import type { FindOptionsRelations, Repository } from 'typeorm';

import { Connection } from '../../database/connection/connection.js';

import * as dotenv from 'dotenv';
import { KeyEntity } from '../../database/entities/key.entity.js';
import type { Key } from '@veramo/data-store';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
dotenv.config();

export class KeyService {
	public keyRepository: Repository<KeyEntity>;

	public static instance = new KeyService();

	constructor() {
		this.keyRepository = Connection.instance.dbConnection.getRepository(KeyEntity);
	}

	public async update(kid: string, customer?: CustomerEntity, keyAlias?: string, createdAt?: Date) {
		const existingKey = await this.keyRepository.findOneBy({ kid });
		if (!existingKey) {
			throw new Error(`kid not found`);
		}
		if (customer) {
			existingKey.customer = customer;
		}
		if (keyAlias) {
			existingKey.publicKeyAlias = keyAlias;
		}
		if (createdAt) {
			// It's a workaround cause Veramo creates key inside without createdAt field
			existingKey.createdAt = createdAt;
		}
		return await this.keyRepository.save(existingKey);
	}

	public async get(kid: string, relations?: FindOptionsRelations<KeyEntity>) {
		return await this.keyRepository.findOne({
			where: { kid },
			relations,
		});
	}

	public async find(where: Record<string, unknown>, relations?: FindOptionsRelations<KeyEntity>) {
		try {
			return await this.keyRepository.find({
				where: where,
				relations,
			});
		} catch {
			return [];
		}
	}

	public fromVeramoKey(key: Key) {
		return new KeyEntity(key.kid, key.type, key.publicKeyHex);
	}
}
