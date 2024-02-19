import type { Repository } from 'typeorm';

import { Connection } from '../database/connection/connection.js';

import * as dotenv from 'dotenv';
import type { CustomerEntity } from '../database/entities/customer.entity.js';
import { PaymentEntity } from '../database/entities/payment.entity.js';
import type { OperationEntity } from '../database/entities/operation.entity.js';
import type { ResourceEntity } from '../database/entities/resource.entity.js';
import type { CheqdNetwork } from '@cheqd/sdk';
import type { CoinEntity } from '../database/entities/coin.entity.js';
dotenv.config();

export class PaymentService {
	public paymentRepository: Repository<PaymentEntity>;

	public static instance = new PaymentService();

	constructor() {
		this.paymentRepository = Connection.instance.dbConnection.getRepository(PaymentEntity);
	}

	public async create(
		txHash: string,
		customer: CustomerEntity,
		operation: OperationEntity,
		fee: CoinEntity,
		amount: CoinEntity,
		successful: boolean,
		namespace: CheqdNetwork,
		resource: ResourceEntity,
		fromAccount: string,
		toAccount: string,
		timestamp: Date
	) {
		const paymentEntity = new PaymentEntity(
			txHash,
			customer,
			operation,
			fee,
			amount,
			successful,
			namespace,
			resource,
			fromAccount,
			toAccount,
			timestamp
		);
		const payment = (await this.paymentRepository.insert(paymentEntity)).identifiers[0];
		if (!payment) throw new Error(`Cannot create a new payment`);
		return paymentEntity;
	}

	public async update(
		txHash: string,
		customer: CustomerEntity,
		operation: OperationEntity,
		fee: CoinEntity,
		amount: CoinEntity,
		successful: boolean,
		namespace: CheqdNetwork,
		resource: ResourceEntity,
		fromAccount: string,
		toAccount: string,
		timestamp: Date
	) {
		const existingPayment = await this.paymentRepository.findOneBy({ txHash });
		if (!existingPayment) {
			throw new Error(`txHash not found`);
		}
		if (customer) {
			existingPayment.customer = customer;
		}
		if (operation) {
			existingPayment.operation = operation;
		}
		if (fee) {
			existingPayment.fee = fee;
		}
		if (amount) {
			existingPayment.amount = amount;
		}
		if (successful !== undefined) {
			existingPayment.successful = successful;
		}
		if (namespace) {
			existingPayment.namespace = namespace;
		}
		if (resource) {
			existingPayment.resource = resource;
		}
		if (fromAccount) {
			existingPayment.fromAccount = fromAccount;
		}
		if (toAccount) {
			existingPayment.toAccount = toAccount;
		}
		if (timestamp) {
			existingPayment.timestamp = timestamp;
		}

		return await this.paymentRepository.save(existingPayment);
	}

	public async get(txHash: string) {
		return await this.paymentRepository.findOne({
			where: { txHash },
			relations: ['customer', 'operation', 'resource', 'coin'],
		});
	}

	public async find(where: Record<string, unknown>) {
		return await this.paymentRepository.find({
			where: where,
			relations: ['customer', 'operation', 'resource', 'coin'],
		});
	}
}
