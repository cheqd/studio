import { BeforeInsert, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import * as dotenv from 'dotenv';
import { CustomerEntity } from './customer.entity.js';
dotenv.config();

/**
 * One row per successful (or in-flight) testnet faucet request made through `POST /account/faucet`.
 * Summed per customer to enforce the monthly faucet quota.
 */
@Entity('faucetRequest')
@Index(['customer', 'createdAt'])
export class FaucetRequestEntity {
	@PrimaryGeneratedColumn('uuid')
	faucetRequestId!: string;

	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId' })
	customer!: CustomerEntity;

	@Column({
		type: 'text',
		nullable: false,
	})
	address!: string;

	// ncheq amount, stored as bigint and surfaced as a string by the driver
	@Column({
		type: 'bigint',
		nullable: false,
	})
	amountNcheq!: string;

	@Column({
		type: 'timestamptz',
		nullable: false,
	})
	createdAt!: Date;

	@BeforeInsert()
	setCreatedAt() {
		this.createdAt = new Date();
	}

	constructor(customer: CustomerEntity, address: string, amountNcheq: bigint) {
		this.customer = customer;
		this.address = address;
		// TypeORM instantiates entities without arguments when building metadata
		this.amountNcheq = amountNcheq?.toString();
	}
}
