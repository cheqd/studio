import { BeforeInsert, BeforeUpdate, Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import * as dotenv from 'dotenv';
import { CustomerEntity } from './customer.entity.js';
import { UserEntity } from './user.entity.js';
dotenv.config();

@Entity('apiKey')
export class APIKeyEntity {
	@Column({
		type: 'varchar',
		unique: true,
		primary: true,
	})
	apiKeyHash!: string;

	@Column({
		type: 'text',
		nullable: false,
	})
	apiKey!: string;

	@Column({
		type: 'text',
		nullable: false,
	})
	name!: string;

	@Column({
		type: 'boolean',
		nullable: false,
		default: false,
	})
	revoked!: boolean;

	@Column({
		type: 'timestamptz',
		nullable: false,
	})
	expiresAt!: Date;

	@Column({
		type: 'timestamptz',
		nullable: false,
	})
	createdAt!: Date;

	@Column({
		type: 'timestamptz',
		nullable: true,
	})
	updatedAt!: Date;

	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId' })
	customer!: CustomerEntity;

	@ManyToOne(() => UserEntity, (user) => user.logToId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'userId' })
	user!: UserEntity;

	@Index({ unique: true })
	@Column({ type: 'varchar', nullable: false })
	fingerprint!: string;

	@BeforeInsert()
	setCreatedAt() {
		this.createdAt = new Date();
	}

	@BeforeUpdate()
	setUpdateAt() {
		this.updatedAt = new Date();
	}

	public isExpired(): boolean {
		return this.expiresAt < new Date();
	}

	constructor(
		apiKeyHash: string,
		apiKey: string,
		name: string,
		expiresAt: Date,
		customer: CustomerEntity,
		user: UserEntity,
		revoked = false,
		fingerprint: string
	) {
		this.apiKeyHash = apiKeyHash;
		this.apiKey = apiKey;
		this.name = name;
		this.expiresAt = expiresAt;
		this.customer = customer;
		this.user = user;
		this.revoked = revoked;
		this.fingerprint = fingerprint;
	}
}
