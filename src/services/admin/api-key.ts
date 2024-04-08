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
dotenv.config();

const { sha3_512 } = pkg;

// Returns the decrypted API key
export function decryptAPIKey(target: any, key: string, descriptor: PropertyDescriptor | undefined) {
	// save a reference to the original method this way we keep the values currently in the
	// descriptor and don't overwrite what another decorator might have done to the descriptor.
	if (descriptor === undefined) {
		descriptor = Object.getOwnPropertyDescriptor(target, key) as PropertyDescriptor;
	}

	const originalMethod = descriptor.value;

	//editing the descriptor/value parameter
	descriptor.value = async function (...args: any[]) {
		const decryptOne = async (entity: APIKeyEntity) => {
			if (entity && entity.apiKey) {
				entity.apiKey = await APIKeyService.instance.decryptAPIKey(entity.apiKey);
			}
			return entity;
		};
		const entity = await originalMethod.apply(this, args);
		if (Array.isArray(entity)) {
			for (const apiKey of entity) {
				await decryptOne(apiKey);
			}
		} else {
			await decryptOne(entity);
		}
		return entity;
	};

	// return edited descriptor as opposed to overwriting the descriptor
	return descriptor;
}

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
	@decryptAPIKey
	public async create(apiKey: string, name: string, user: UserEntity, expiresAt?: Date, revoked = false): Promise<APIKeyEntity> {
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
			expiresAt.setMonth(expiresAt.getMonth() + API_KEY_EXPIRATION);
		}
		const apiKeyHash = APIKeyService.hashAPIKey(apiKey);
		const encryptedAPIKey = await this.secretBox.encrypt(apiKey);
		// Create entity
		const apiKeyEntity = new APIKeyEntity(apiKeyHash, encryptedAPIKey, name, expiresAt, user.customer, user, revoked);
		const apiKeyRecord = (await this.apiKeyRepository.insert(apiKeyEntity)).identifiers[0];
		if (!apiKeyRecord) throw new Error(`Cannot create a new API key`);
		return apiKeyEntity;
	}

	@decryptAPIKey
	public async update(
		apiKey: string,
		name?: string,
		expiresAt?: Date,
		revoked?: boolean,
		customer?: CustomerEntity,
		user?: UserEntity
	) {
		const apiKeyHash = APIKeyService.hashAPIKey(apiKey);
		const existingAPIKey = await this.apiKeyRepository.findOneBy({ apiKeyHash });
		if (!existingAPIKey) {
			throw new Error(`API with key id ${apiKey} not found`);
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
		return entity;
	}

	public async revoke(apiKey: string) {
		return this.update(apiKey, undefined, undefined, true);
	}

	public async decryptAPIKey(apiKey: string) {
		return await this.secretBox.decrypt(apiKey);
	}

	@decryptAPIKey
	public async get(apiKey: string) {
		const apiKeyHash = APIKeyService.hashAPIKey(apiKey);
		const apiKeyEntity = await this.apiKeyRepository.findOne({
			where: { apiKeyHash: apiKeyHash },
			relations: ['customer', 'user'],
		});
		return apiKeyEntity;
	}

	@decryptAPIKey
	public async find(where: Record<string, unknown>, order?: Record<string, 'ASC' | 'DESC'>) {
		try {
			const apiKeyList = await this.apiKeyRepository.find({
				where: where,
				relations: ['customer', 'user'],
				order: order,
			});
			return apiKeyList;
		} catch {
			return [];
		}
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
