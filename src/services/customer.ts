import type { Repository } from 'typeorm';

import { Connection } from '../database/connection/connection.js';
import { CustomerEntity } from '../database/entities/customer.entity.js';
import { IdentityServiceStrategySetup } from './identity/index.js';

import * as dotenv from 'dotenv';
dotenv.config();

export class CustomerService {
	public customerRepository: Repository<CustomerEntity>;

	public static instance = new CustomerService();

	constructor() {
		this.customerRepository = Connection.instance.dbConnection.getRepository(CustomerEntity);
	}

	public async create(name: string) {
		if (await this.find(name)) {
			throw new Error(`Cannot create a new customer since the customer with same name ${name} already exists`);
		}
		const customer = new CustomerEntity(name);
		const customerEntity = (await this.customerRepository.insert(customer)).identifiers[0];

		// Create a new Cosmos account for the customer and make a link with customer entity;
		await new IdentityServiceStrategySetup(name).agent.createKey('Secp256k1', customerEntity.customerId)
		return {
			customerId: customerEntity.customerId,
			name: customerEntity.name,
		};
	}

	public async update(
		customerId: string,
		name: string,
	) {
		const existingCustomer = await this.customerRepository.findOneBy({ customerId });
		if (!existingCustomer) {
			throw new Error(`CustomerId not found`);
		}

		existingCustomer.name = name;
		return await this.customerRepository.save(existingCustomer);
	}

	public async get(customerId?: string) {
		return customerId
			? await this.customerRepository.findOneBy({ customerId })
			: await this.customerRepository.find();
	}

	public async find(
		customerId: string,
		name?: string) {
		const where: Record<string, unknown> = {
			customerId,
		};
		if (name) {
			where.name = name;
		}
		try {
			return (await this.customerRepository.findOne({ where })) ? true : false;
		} catch {
			return false;
		}
	}
}
