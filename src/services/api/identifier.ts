import type { Repository } from 'typeorm';

import { Connection } from '../../database/connection/connection.js';
import { IdentifierEntity } from '../../database/entities/identifier.entity.js';
import * as dotenv from 'dotenv';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
dotenv.config();

export class IdentifierService {
	public identifierRepository: Repository<IdentifierEntity>;

	// Get rid of such code and move it to the builder
	public static instance = new IdentifierService();

	constructor() {
		this.identifierRepository = Connection.instance.dbConnection.getRepository(IdentifierEntity);
	}

	public async update(did: string, customer: CustomerEntity) {
		const existing = await this.identifierRepository.findOneBy({ did });
		if (!existing) {
			throw new Error(`Did not found`);
		}
		existing.customer = customer;
		return await this.identifierRepository.save(existing);
	}

	public async get(did?: string) {
		return await this.identifierRepository.findOne({
			where: { did },
			relations: ['customer'],
		});
	}

	public async find(where: Record<string, unknown>) {
		try {
			return await this.identifierRepository.find({
				where: where,
				relations: ['customer'],
			});
		} catch {
			return [];
		}
	}
}
