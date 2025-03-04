import type { Repository } from 'typeorm';
import { decodeJWT } from 'did-jwt';
import bcrypt from 'bcrypt';
import { randomBytes, createHmac } from 'crypto';
import { Connection } from '../../database/connection/connection.js';

import * as dotenv from 'dotenv';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import { APIKeyEntity } from '../../database/entities/api.key.entity.js';
import type { UserEntity } from '../../database/entities/user.entity.js';
import { SecretBox } from '@veramo/kms-local';
import { API_SECRET_KEY_LENGTH, API_KEY_PREFIX, API_KEY_EXPIRATION } from '../../types/constants.js';
import type { APIServiceOptions } from '../../types/admin.js';
dotenv.config();

export class APIKeyService {
	public apiKeyRepository: Repository<APIKeyEntity>;
	private secretBox: SecretBox;

	public static instance = new APIKeyService();

	constructor() {
		this.apiKeyRepository = Connection.instance.dbConnection.getRepository(APIKeyEntity);
		this.secretBox = new SecretBox(process.env.EXTERNAL_DB_ENCRYPTION_KEY);
	}

	// ToDo: Maybe we also need to store not the API key but the hash of it?
	// But in that case the API key will be shown once and then it will be lost.

	public async create(
		apiKey: string,
		name: string,
		user: UserEntity,
		expiresAt?: Date,
		revoked = false,
		options?: APIServiceOptions
	): Promise<APIKeyEntity> {
		const apiKeyHash = await APIKeyService.hashAPIKey(apiKey);
		const { decryptionNeeded } = options || {};
		if (!apiKey) {
			throw new Error('API key is not specified');
		}
		if (!name) {
			throw new Error('API key name is not specified');
		}
		if (!user) {
			throw new Error('API key user is not specified');
		}
		if (!expiresAt) {
			expiresAt = new Date();
			expiresAt.setMonth(expiresAt.getDay() + API_KEY_EXPIRATION);
		}
		const encryptedAPIKey = await this.encryptAPIKey(apiKey);
		// Create entity
		const apiKeyEntity = new APIKeyEntity(
			apiKeyHash,
			encryptedAPIKey,
			name,
			expiresAt,
			user.customer,
			user,
			revoked
		);
		const apiKeyRecord = (await this.apiKeyRepository.insert(apiKeyEntity)).identifiers[0];
		if (!apiKeyRecord) throw new Error(`Cannot create a new API key`);

		if (decryptionNeeded) {
			apiKeyEntity.apiKey = apiKey;
		}
		return apiKeyEntity;
	}

	public async update(
		item: {
			apiKey: string;
			name?: string;
			expiresAt?: Date;
			revoked?: boolean;
			customer?: CustomerEntity;
			user?: UserEntity;
		},
		options?: APIServiceOptions
	) {
		const { apiKey, name, expiresAt, customer, revoked, user } = item;
		const { decryptionNeeded } = options || {};

		const existingAPIKey = await this.get(apiKey);

		if (!existingAPIKey) {
			throw new Error(`API key not found`);
		}
		if (name) {
			existingAPIKey.name = name;
		}
		if (expiresAt) {
			existingAPIKey.expiresAt = expiresAt;
		}
		if (customer) {
			existingAPIKey.customer = customer;
		}
		if (user) {
			existingAPIKey.user = user;
		}
		if (revoked) {
			existingAPIKey.revoked = revoked;
		}

		const entity = await this.apiKeyRepository.save(existingAPIKey);
		if (entity && decryptionNeeded) {
			entity.apiKey = await this.decryptAPIKey(existingAPIKey.apiKey);
		}
		return entity;
	}

	public async revoke(apiKey: string, options?: APIServiceOptions) {
		return this.update(
			{
				apiKey: apiKey,
				revoked: true,
			},
			options
		);
	}

	public async decryptAPIKey(apiKey: string) {
		return await this.secretBox.decrypt(apiKey);
	}

	public async encryptAPIKey(apiKey: string) {
		return await this.secretBox.encrypt(apiKey);
	}

	public async get(apiKey: string, options?: APIServiceOptions) {
		const { decryptionNeeded } = options || {};

		// ToDo: possible bottleneck cause we are fetching all the keys
		for (const record of await this.find({})) {
			if (await APIKeyService.compareAPIKey(apiKey, record.apiKeyHash)) {
				if (decryptionNeeded) {
					record.apiKey = await this.decryptAPIKey(record.apiKey);
				}
				return record;
			}
		}
		return null;
	}

	public async find(
		where: Record<string, unknown>,
		order?: Record<string, 'ASC' | 'DESC'>,
		options?: APIServiceOptions
	) {
		try {
			const { decryptionNeeded } = options || {};
			const apiKeyList = await this.apiKeyRepository.find({
				where: where,
				relations: ['customer', 'user'],
				order: order,
			});
			if (decryptionNeeded) {
				for (const apiKey of apiKeyList) {
					apiKey.apiKey = await this.decryptAPIKey(apiKey.apiKey);
				}
			}
			return apiKeyList;
		} catch {
			return [];
		}
	}

	// Utils
	public static generateAPIKey(userId: string): string {
		const apiKey = createHmac('sha512', randomBytes(API_SECRET_KEY_LENGTH).toString('hex')).update(userId).digest('hex');
		return `${API_KEY_PREFIX}_${apiKey}`;
	}

	public static getExpiryDateJWT(apiKey: string): Date {
		const decrypted = decodeJWT(apiKey);
		return new Date(decrypted.payload.exp ? decrypted.payload.exp * 1000 : 0);
	}

	public static async hashAPIKey(apiKey: string): Promise<string> {
		return bcrypt.hash(apiKey, 12);
	}

	public static async compareAPIKey(apiKey: string, hash: string): Promise<boolean> {
		return bcrypt.compare(apiKey, hash);
	}
}
