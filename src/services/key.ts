import type { Repository } from 'typeorm';

import { Connection } from '../database/connection/connection.js';

import * as dotenv from 'dotenv';
import { KeyEntity } from '../database/entities/key.entity.js';
import type { Key } from '@veramo/data-store';
dotenv.config();

export class KeyService {
	public keyRepository: Repository<KeyEntity>;

	public static instance = new KeyService();

	constructor() {
		this.keyRepository = Connection.instance.dbConnection.getRepository(KeyEntity);
	}

	public async update(kid: string, customerId?: string, keyAlias?: string) {
		const existingKey = await this.keyRepository.findOneBy({ kid });
		if (!existingKey) {
			throw new Error(`kid not found`);
		}
        if (customerId) {
            existingKey.customerId = customerId;
        }
        if (keyAlias) {
		    existingKey.publicKeyAlias = keyAlias;
        }
		return await this.keyRepository.save(existingKey);
	}

	public async get(kid: string) {
		return await this.keyRepository.findOneBy({ kid })
	}

    public async find(
        kid?: string,
        customerId?: string,
        keyAlias?: string,
    ) {
        const where: Record<string, unknown> = {
        };
        if (kid) {
            where.kid = kid;
        }
        if (customerId) {
            where.customerId = customerId;
        }
        if (keyAlias) {
            where.publicKeyAlias = keyAlias;
        }

        return await this.keyRepository.find(where);
    }

    public fromVeramoKey(key: Key) {
        return new KeyEntity(key.kid, key.type, key.publicKeyHex);
    }

}
