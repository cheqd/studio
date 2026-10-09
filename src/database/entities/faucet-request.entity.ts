import { BeforeInsert, Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import * as dotenv from 'dotenv';
import { CustomerEntity } from './customer.entity.js';
dotenv.config();

/**
 * - pending: reserved, faucet call in flight. Counts towards the quota until it times out.
 * - completed: the faucet confirmed the credit.
 * - unknown: the faucet call threw (e.g. a timeout), so tokens may have been sent. Always counts.
 * - abandoned: stayed pending past the timeout (e.g. the process died). No longer counts.
 */
export const FAUCET_REQUEST_STATUSES = ['pending', 'completed', 'unknown', 'abandoned'] as const;
export type FaucetRequestStatus = (typeof FAUCET_REQUEST_STATUSES)[number];

/**
 * One row per testnet faucet request made through `POST /account/faucet` or the account bootstrap top-up.
 * Summed per customer to enforce the monthly faucet quota.
 */
@Entity('faucetRequest')
@Check('CHK_faucetRequest_status', `"status" IN (${FAUCET_REQUEST_STATUSES.map((status) => `'${status}'`).join(', ')})`)
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
		type: 'text',
		nullable: false,
		default: 'completed',
	})
	status!: FaucetRequestStatus;

	@Column({
		type: 'timestamptz',
		nullable: false,
	})
	createdAt!: Date;

	@Column({
		type: 'timestamptz',
		nullable: true,
	})
	completedAt?: Date;

	@BeforeInsert()
	setCreatedAt() {
		this.createdAt = new Date();
	}

	constructor(customer: CustomerEntity, address: string, amountNcheq: bigint) {
		this.customer = customer;
		this.address = address;
		// TypeORM instantiates entities without arguments when building metadata
		this.amountNcheq = amountNcheq?.toString();
		this.status = 'pending';
	}
}
