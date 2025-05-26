import type { FindOptionsRelations, Repository } from 'typeorm';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { KeyEntity } from '../../database/entities/key.entity.js';
import { getCosmosAccount } from '@cheqd/sdk';
import { PaymentAccountEntity } from '../../database/entities/payment.account.entity.js';
import { Connection } from '../../database/connection/connection.js';
import * as dotenv from 'dotenv';

dotenv.config();

export class PaymentAccountService {
	public paymentAccountRepository: Repository<PaymentAccountEntity>;

	public static instance = new PaymentAccountService();

	constructor() {
		this.paymentAccountRepository = Connection.instance.dbConnection.getRepository(PaymentAccountEntity);
	}

	public async create(
		namespace: string,
		isDefault: boolean,
		customer: CustomerEntity,
		key: KeyEntity
	): Promise<PaymentAccountEntity> {
		const address = getCosmosAccount(key.kid);
		const existing = await this.find({ address: address });
		if (!address) {
			throw new Error('Account address is not specified');
		}
		if (existing.length > 0) {
			throw new Error(
				`Cannot create a new payment account since the payment account with same address ${address} already exists`
			);
		}
		if (!namespace) {
			throw new Error('Account namespace is not specified');
		}
		if (!customer) {
			throw new Error('Customer id is not specified');
		}
		if (!key) {
			throw new Error('Key id is not specified');
		}
		const paymentAccount = new PaymentAccountEntity(address, namespace, isDefault, customer, key);
		const paymentAccountEntity = (await this.paymentAccountRepository.insert(paymentAccount)).identifiers[0];
		if (!paymentAccountEntity) throw new Error(`Cannot create a new payment account`);

		return paymentAccount;
	}

	public async update(
		address: string,
		namespace?: string,
		isDefault?: boolean,
		customer?: CustomerEntity,
		key?: KeyEntity
	) {
		const existingPaymentAccount = await this.paymentAccountRepository.findOneBy({ address });
		if (!existingPaymentAccount) {
			throw new Error(`address not found`);
		}
		if (customer) {
			existingPaymentAccount.customer = customer;
		}
		if (namespace) {
			existingPaymentAccount.namespace = namespace;
		}
		if (key) {
			existingPaymentAccount.key = key;
		}
		if (isDefault) {
			existingPaymentAccount.isDefault = isDefault;
		}

		return await this.paymentAccountRepository.save(existingPaymentAccount);
	}

	public async get(address: string, relations?: FindOptionsRelations<PaymentAccountEntity>) {
		return await this.paymentAccountRepository.findOne({
			where: { address },
			relations,
		});
	}

	public async find(where: Record<string, unknown>, relations?: FindOptionsRelations<PaymentAccountEntity>) {
		return await this.paymentAccountRepository.find({
			where: where,
			relations,
		});
	}

	public async findOne(where: Record<string, unknown>, relations?: FindOptionsRelations<PaymentAccountEntity>) {
		return await this.paymentAccountRepository.findOne({
			where: where,
			relations,
		});
	}
}
