import type { Repository } from 'typeorm';

import { Connection } from '../../database/connection/connection.js';
import { CustomerEntity } from '../../database/entities/customer.entity.js';
import { IdentityServiceStrategySetup } from '../identity/index.js';

import * as dotenv from 'dotenv';
import { PaymentAccountService } from './payment-account.js';
import { CheqdNetwork } from '@cheqd/sdk';
import { v4 as uuidv4 } from 'uuid';
dotenv.config();

export class CustomerService {
	public customerRepository: Repository<CustomerEntity>;

	// Get rid of such code and move it to the builder
	public static instance = new CustomerService();

	constructor() {
		this.customerRepository = Connection.instance.dbConnection.getRepository(CustomerEntity);
	}

	public async create(name: string) {
		// The sequence for creating a customer is supposed to be:
		// 1. Create a new customer entity in the database;
		// 2. Create new cosmos keypair
		// 3. Get the cosmos address from the keypair
		// 4. Create a new payment account entity in the database

		if (await this.isExist({ name: name })) {
			throw new Error(`Cannot create a new customer since the customer with same name ${name} already exists`);
		}
		const customerEntity = new CustomerEntity(uuidv4(), name);
		await this.customerRepository.insert(customerEntity);

		// Create a new Cosmos account for the customer and make a link with customer entity;
		const key = await new IdentityServiceStrategySetup(name).agent.createKey('Secp256k1', customerEntity);
		await PaymentAccountService.instance.create(CheqdNetwork.Testnet, true, customerEntity, key);
		return {
			customerId: customerEntity.customerId,
			name: customerEntity.name,
		};
	}

	public async update(customerId: string, name?: string, stripeCustomerId?: string) {
		const existingCustomer = await this.customerRepository.findOneBy({ customerId });
		if (!existingCustomer) {
			throw new Error(`CustomerId not found`);
		}
		if (name) {
			existingCustomer.name = name;
		}

		if (stripeCustomerId) {
			existingCustomer.stripeCustomerId = stripeCustomerId;
		}
		return await this.customerRepository.save(existingCustomer);
	}

	public async get(customerId?: string) {
		return this.customerRepository.findOneBy({ customerId });
	}

	public async findOne(name?: string) {
		return await this.customerRepository.findOne({
			where: { name },
		});
	}

	public async find(where: Record<string, unknown>) {
		try {
			return await this.customerRepository.find({
				where: where,
			});
		} catch {
			return [];
		}
	}

	public async isExist(where: Record<string, unknown>) {
		try {
			return (await this.customerRepository.findOne({ where })) ? true : false;
		} catch {
			return false;
		}
	}
}
