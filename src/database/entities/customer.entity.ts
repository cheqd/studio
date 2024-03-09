import { BeforeInsert, BeforeUpdate, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import * as dotenv from 'dotenv';
dotenv.config();

@Entity('customer')
export class CustomerEntity {
	@PrimaryGeneratedColumn('uuid')
	customerId!: string;

	@Column({
		type: 'text',
		nullable: false,
	})
	name!: string;

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

	@Column({
		type: 'text',
		nullable: true,
	})
	stripeCustomerId!: string;

	@BeforeInsert()
	setCreatedAt() {
		this.createdAt = new Date();
	}

	@BeforeUpdate()
	setUpdateAt() {
		this.updatedAt = new Date();
	}

	constructor(customerId: string, name: string) {
		this.customerId = customerId;
		this.name = name;
	}

	public isEqual(customer: CustomerEntity): boolean {
		return (
			this.customerId === customer.customerId &&
			this.name === customer.name &&
			this.createdAt.toISOString() === customer.createdAt.toISOString() &&
			((!this.updatedAt && !customer.updatedAt) ||
				this.updatedAt.toISOString() === customer.updatedAt.toISOString())
		);
	}
}
