import { BeforeInsert, BeforeUpdate, Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import * as dotenv from 'dotenv';
import { CustomerEntity } from './customer.entity.js';
dotenv.config();

@Entity('subscription')
export class SubscriptionEntity {
	@Column({
		type: 'text',
		nullable: false,
		primary: true,
	})
	subscriptionId!: string;

	@Column({
		type: 'text',
		nullable: false,
	})
	status!: string;

	@Column({
		type: 'timestamptz',
		nullable: false,
	})
	currentPeriodStart!: Date;

	@Column({
		type: 'timestamptz',
		nullable: false,
	})
	currentPeriodEnd!: Date;

	@Column({
		type: 'timestamptz',
		nullable: true,
	})
	trialStart!: Date;

	@Column({
		type: 'timestamptz',
		nullable: true,
	})
	trialEnd!: Date;

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

	@BeforeInsert()
	setCreatedAt() {
		this.createdAt = new Date();
	}

	@BeforeUpdate()
	setUpdateAt() {
		this.updatedAt = new Date();
	}

	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId' })
	customer!: CustomerEntity;

	constructor(
		subscriptionId: string,
		customer: CustomerEntity,
		status: string,
		currentPeriodStart: Date,
		currentPeriodEnd: Date,
		trialStart?: Date,
		trialEnd?: Date
	) {
		this.subscriptionId = subscriptionId;
		this.customer = customer;
		this.status = status;
		this.currentPeriodStart = currentPeriodStart;
		this.currentPeriodEnd = currentPeriodEnd;
		if (trialStart) this.trialStart = trialStart;
		if (trialEnd) this.trialEnd = trialEnd;
	}
}
