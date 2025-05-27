import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import * as dotenv from 'dotenv';
import { CustomerEntity } from './customer.entity.js';
import { ResourceEntity } from './resource.entity.js';
import { OperationEntity } from './operation.entity.js';
import type { CheqdNetwork } from '@cheqd/sdk';
import { namespaceEnum } from '../types/enum.js';
import { CoinEntity } from './coin.entity.js';
import { PaymentAccountEntity } from './payment.account.entity.js';
dotenv.config();

@Entity('payment')
export class PaymentEntity {
	@Column({
		type: 'text',
		nullable: false,
		primary: true,
	})
	txHash!: string;

	@Column({
		type: 'enum',
		enum: namespaceEnum,
		enumName: 'paymentAccount_namespace_enum',
		nullable: false,
	})
	namespace!: CheqdNetwork;

	@Column({
		type: 'text',
		nullable: false,
	})
	toAccount!: string;

	@Column({
		type: 'boolean',
		nullable: false,
	})
	successful!: boolean;

	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId' })
	customer!: CustomerEntity;

	@ManyToOne(() => ResourceEntity, (resource) => resource.resourceId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'resourceId' })
	resource!: ResourceEntity;

	@ManyToOne(() => OperationEntity, (operation) => operation.operationId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'operationId' })
	operation!: OperationEntity;

	@ManyToOne(() => CoinEntity, (coin) => coin.coinId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'fee'})
	fee!: CoinEntity;

	@ManyToOne(() => CoinEntity, (coin) => coin.coinId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'amount' })
	amount!: CoinEntity;

	@ManyToOne(() => PaymentAccountEntity, (paymentAccount) => paymentAccount.address, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'fromAccount' })
	fromAccount!: PaymentAccountEntity;

	@Column({
		type: 'timestamptz',
		nullable: false,
	})
	timestamp!: Date;

	constructor(
		txHash: string,
		customer: CustomerEntity,
		operation: OperationEntity,
		fee: CoinEntity,
		amount: CoinEntity,
		successful: boolean,
		namespace: CheqdNetwork,
		resource: ResourceEntity,
		fromAccount: PaymentAccountEntity,
		toAccount: string,
		timestamp: Date
	) {
		this.txHash = txHash;
		this.customer = customer;
		this.operation = operation;
		this.fee = fee;
		this.amount = amount;
		this.successful = successful;
		this.namespace = namespace;
		this.resource = resource;
		this.fromAccount = fromAccount;
		this.toAccount = toAccount;
		this.timestamp = timestamp;
	}
}
