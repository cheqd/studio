import type { Repository } from 'typeorm';
import { decodeJWT } from 'did-jwt';
import { randomBytes } from 'crypto';
import { Connection } from '../../database/connection/connection.js';

import * as dotenv from 'dotenv';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import { APIKeyEntity } from '../../database/entities/api.key.entity.js';
import type { UserEntity } from '../../database/entities/user.entity.js';
import { SecretBox } from '@veramo/kms-local';
import { API_KEY_LENGTH, API_KEY_PREFIX, API_KEY_EXPIRATION } from '../../types/constants.js';
import pkg from 'js-sha3';
import { v4 } from 'uuid';
import type { APIServiceOptions } from '../../types/portal.js';
dotenv.config();

const { sha3_512 } = pkg;

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

	public async create(apiKey: string, name: string, user: UserEntity, expiresAt?: Date, revoked = false, options?: APIServiceOptions): Promise<APIKeyEntity> {
		const apiKeyId = v4();
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
		const encryptedAPIKey = await this.secretBox.encrypt(apiKey);
		// Create entity
		const apiKeyEntity = new APIKeyEntity(apiKeyId, encryptedAPIKey, name, expiresAt, user.customer, user, revoked);
		const apiKeyRecord = (await this.apiKeyRepository.insert(apiKeyEntity)).identifiers[0];
		if (!apiKeyRecord) throw new Error(`Cannot create a new API key`);

		if (decryptionNeeded) {
			apiKeyEntity.apiKey = apiKey;
		}
		return apiKeyEntity;
	}

	public async update(
		item: {
			customer: CustomerEntity,
			apiKey: string,
			name?: string,
			expiresAt?: Date,
			revoked?: boolean,
			user?: UserEntity
		},
		options?: APIServiceOptions
	) {
		const { apiKey, name, expiresAt, revoked, customer, user } = item;
		const { decryptionNeeded } = options || {};

		const existingAPIKey = await this.discoverAPIKey(apiKey as string, customer);

		if (!existingAPIKey) {
			throw new Error(`API key for customer ${customer.customerId} not found`);
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

	public async revoke(apiKey: string, customer: CustomerEntity, options?: APIServiceOptions) {
		return this.update({
			customer,
			apiKey: apiKey,
			revoked: true
		}, options);
	}

	public async decryptAPIKey(apiKey: string) {
		return await this.secretBox.decrypt(apiKey);
	}

	public async get(apiKey: string, customer: CustomerEntity, options?: APIServiceOptions) {
		const { decryptionNeeded } = options || {};
		const apiKeyEntity = await this.discoverAPIKey(apiKey, customer);

		if (apiKeyEntity && decryptionNeeded) {
			apiKeyEntity.apiKey = await this.decryptAPIKey(apiKeyEntity.apiKey);
		}
		
		return apiKeyEntity;
	}

	public async find(where: Record<string, unknown>, order?: Record<string, 'ASC' | 'DESC'>, options?: APIServiceOptions) {
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

	public async discoverAPIKey(apiKey: string, customer?: CustomerEntity) {
		const where = customer ? { customer } : {};
	    const keys = await this.find(where, { createdAt: 'DESC' });
		for (const key of keys) {
			if (await this.decryptAPIKey(key.apiKey) === apiKey) {
				return key;
			}
		}
		return undefined;
	}

	// Utils
	public generateAPIKey(): string {
		return `${API_KEY_PREFIX}_${randomBytes(API_KEY_LENGTH).toString('hex')}`;
	}

	public async getExpiryDate(apiKey: string): Promise<Date> {
		const decrypted = await decodeJWT(apiKey);
		return new Date(decrypted.payload.exp ? decrypted.payload.exp * 1000 : 0);
	}

	public static hashAPIKey(apiKey: string): string {
		return sha3_512(apiKey);
	}
}
