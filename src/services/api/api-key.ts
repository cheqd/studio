import type { Repository } from 'typeorm';
import { decodeJWT } from 'did-jwt';
import { Connection } from '../../database/connection/connection.js';

import * as dotenv from 'dotenv';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import { APIKeyEntity } from '../../database/entities/api.key.entity.js';
import type { UserEntity } from '../../database/entities/user.entity.js';
import { v4 } from 'uuid';
import { SecretBox } from '@veramo/kms-local';
dotenv.config();

export class APIKeyService {
	public apiKeyRepository: Repository<APIKeyEntity>;
	private secretBox: SecretBox;

	public static instance = new APIKeyService();

	constructor() {
		this.apiKeyRepository = Connection.instance.dbConnection.getRepository(APIKeyEntity);
		this.secretBox = new SecretBox(process.env.EXTERNAL_DB_ENCRYPTION_KEY)
	}

	public async create(apiKey: string, customer: CustomerEntity, user: UserEntity, revoked = false): Promise<APIKeyEntity> {
		const apiKeyId = v4();
		if (!apiKey) {
			throw new Error('API key is not specified');
		}
		if (!customer) {
			throw new Error('API key customer is not specified');
		}
		if (!user) {
			throw new Error('API key user is not specified');
		}
		if (!customer) {
			throw new Error('Customer id is not specified');
		}
		const encryptedAPIKey = await this.secretBox.encrypt(apiKey);
		const expiresAt = await this.getExpiryDate(apiKey);
		const apiKeyEntity = new APIKeyEntity(encryptedAPIKey, expiresAt, customer, user, revoked);
		const apiKeyRecord = (await this.apiKeyRepository.insert(apiKeyEntity)).identifiers[0];
		if (!apiKeyRecord) throw new Error(`Cannot create a new API key`);
		return apiKeyEntity;
	}

	public async update(
		apiKey: string,
		expiresAt?: Date,
		customer?: CustomerEntity,
		user?: UserEntity,
		revoked?: boolean
	) {
		const existingAPIKey = await this.apiKeyRepository.findOneBy({ apiKey });
		if (!existingAPIKey) {
			throw new Error(`API with key id ${apiKey} not found`);
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

		return await this.apiKeyRepository.save(existingAPIKey);
	}

	public async get(apiKey: string) {
		const apiKeyEntity = await this.apiKeyRepository.findOne({
			where: { apiKey },
			relations: ['customer', 'user'],
		});
		if (!apiKeyEntity) {
			throw new Error(`API key ${apiKey} not found`);
		}

		if (this.secretBox && apiKeyEntity.apiKey) {
			apiKeyEntity.apiKey = await this.secretBox.decrypt(apiKeyEntity.apiKey);
		}
		return apiKeyEntity;
	}

	public async find(where: Record<string, unknown>) {
		try {
			const apiKeyList = await this.apiKeyRepository.find({
				where: where,
				relations: ['customer', 'user'],
			});
			// decrypt the API keys
			if (this.secretBox) {
				for (const apiKey of apiKeyList) {
					apiKey.apiKey = await this.secretBox.decrypt(apiKey.apiKey);
				}
			}
			return apiKeyList;

		} catch {
			return [];
		}
	}

	public async getExpiryDate(apiKey: string): Promise<Date> {
		const decrypted = await decodeJWT(apiKey);
		return new Date(decrypted.payload.exp ? decrypted.payload.exp * 1000 : 0);
	}
}
