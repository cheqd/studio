import { BeforeInsert, BeforeUpdate, Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import * as dotenv from 'dotenv';
import { CustomerEntity } from './customer.entity.js';
import { UserEntity } from './user.entity.js';
dotenv.config();

@Entity('apiKey')
export class APIKeyEntity {
	@Column({
		type: 'text',
		primary: true,
		nullable: false,
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

	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId' })
	customer!: CustomerEntity;

	@ManyToOne(() => UserEntity, (user) => user.logToId, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'userId' })
	user!: UserEntity;

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
		revoked = false
	) {
		this.apiKeyHash = apiKeyHash;
		this.apiKey = apiKey;
		this.name = name;
		this.expiresAt = expiresAt;
		this.customer = customer;
		this.user = user;
		this.revoked = revoked;
	}
}
