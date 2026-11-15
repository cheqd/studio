import { In } from 'typeorm';
import type { FindOptionsRelations, Repository } from 'typeorm';

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

	/**
	 * Which of these DIDs belong to an agent, current or deleted (`identifier.kind = 'agent'`). Used to tell a client
	 * which DIDs must not be offered as a principal to act for. Never throws: with no database the answer is none.
	 */
	public async agentDidsAmong(customerId: string, dids: string[]): Promise<string[]> {
		if (dids.length === 0) return [];
		try {
			const rows = await this.identifierRepository.find({
				select: { did: true },
				where: { did: In(dids), kind: 'agent', customer: { customerId } },
			});
			return rows.map((row) => row.did);
		} catch {
			return [];
		}
	}

	public async update(did: string, customer: CustomerEntity) {
		const existing = await this.identifierRepository.findOneBy({ did });
		if (!existing) {
			throw new Error(`Did not found`);
		}
		existing.customer = customer;
		return await this.identifierRepository.save(existing);
	}

	public async get(did?: string, customer?: CustomerEntity, relations?: FindOptionsRelations<IdentifierEntity>) {
		return await this.identifierRepository.findOne({
			where: { did, customer },
			relations,
		});
	}

	public async find(
		where: Record<string, unknown>,
		page?: number,
		limit?: number,
		relations?: FindOptionsRelations<IdentifierEntity>
	) {
		try {
			return await this.identifierRepository.findAndCount({
				where: where,
				relations,
				skip: page && limit ? (page - 1) * limit : 0,
				take: limit,
			});
		} catch {
			return [];
		}
	}

	public async count(customer: CustomerEntity, where: Record<string, unknown>) {
		return await this.identifierRepository.count({
			where: {
				...where,
				customer: { customerId: customer.customerId },
			},
		});
	}
}
