import type { Repository } from 'typeorm';

import { Connection } from '../database/connection/connection.js';

import * as dotenv from 'dotenv';
import type { CustomerEntity } from '../database/entities/customer.entity.js';
import { APIKeyEntity } from '../database/entities/api.key.entity.js';
import type { UserEntity } from '../database/entities/user.entity.js';
import { v4 } from 'uuid';
import { Cheqd } from '@cheqd/did-provider-cheqd';
dotenv.config();

export class APIKeyService {
	public apiKeyRepository: Repository<APIKeyEntity>;

	public static instance = new APIKeyService();

	constructor() {
		this.apiKeyRepository = Connection.instance.dbConnection.getRepository(APIKeyEntity);
	}

	public async create(
        apiKey: string,
        customer: CustomerEntity, 
        user: UserEntity
	): Promise<APIKeyEntity> {
		const apiKeyId = v4()
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
        const expiresAt = await this.getExpiryDate(apiKey);
        const apiKeyEntity = new APIKeyEntity(apiKeyId, apiKey, expiresAt, customer, user);
        const apiKeyRecord = (await this.apiKeyRepository.insert(apiKeyEntity)).identifiers[0];
        if (!apiKeyRecord) throw new Error(`Cannot create a new API key`);
        return apiKeyEntity;
	}

	public async update(
        apiKeyId: string,
        apiKey: string, 
        expiresAt: Date, 
        customer: CustomerEntity, 
        user: UserEntity
	) {
		const existingAPIKey = await this.apiKeyRepository.findOneBy({ apiKeyId });
		if (!existingAPIKey) {
			throw new Error(`API with key id ${apiKeyId} not found`);
		}
        if (apiKey) {
            existingAPIKey.apiKey = apiKey;
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

		return await this.apiKeyRepository.save(existingAPIKey);
	}

	public async get(apiKeyId: string) {
		return await this.apiKeyRepository.findOne({
			where: { apiKeyId },
			relations: ['customer', 'user'],
		});
	}

	public async find(where: Record<string, unknown>) {
		return await this.apiKeyRepository.find({
			where: where,
			relations: ['customer', 'user'],
		});
	}

    public async getExpiryDate(apiKey: string): Promise<Date> {
        const decrypted = await Cheqd.decodeCredentialJWT(apiKey);
        return new Date(decrypted.exp);
    }

    public isExpired(apiKey: APIKeyEntity): boolean {
        return apiKey.expiresAt < new Date();
    }
}
