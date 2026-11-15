import { BeforeInsert, BeforeUpdate, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import * as dotenv from 'dotenv';
dotenv.config();

@Entity('customer')
@Index('UQ_customer_credoTenantId', ['credoTenantId'], { unique: true })
export class CustomerEntity {
	@PrimaryGeneratedColumn('uuid')
	customerId!: string;

	@Column({
		type: 'text',
		nullable: false,
	})
	name!: string;

	@Column({
		type: 'text',
		nullable: false,
		unique: true,
	})
	email!: string;

	@Column({
		type: 'text',
		nullable: true,
	})
	description?: string;

	@Column({
		type: 'timestamptz',
		nullable: false,
	})
	createdAt!: Date;

	@Column({
		type: 'timestamptz',
		nullable: true,
	})
	updatedAt?: Date;

	@Column({
		type: 'text',
		nullable: true,
	})
	paymentProviderId?: string;

	// Set on the customer's first Credo operation
	@Column({ type: 'varchar', length: 64, nullable: true })
	credoTenantId?: string;

	// Where the account came from (cheqd/studio#868). Free-form but validated: ^[a-z0-9][a-z0-9-]{0,31}$
	@Column({ type: 'varchar', length: 32, nullable: true })
	source?: string;

	@BeforeInsert()
	setCreatedAt() {
		this.createdAt = new Date();
	}

	@BeforeUpdate()
	setUpdateAt() {
		this.updatedAt = new Date();
	}

	constructor(customerId: string, name: string, email: string, description?: string, paymentProviderId?: string) {
		this.customerId = customerId;
		this.name = name;
		this.email = email;
		this.description = description;
		if (paymentProviderId) {
			this.paymentProviderId = paymentProviderId;
		}
	}

	public isEqual(customer: CustomerEntity): boolean {
		return (
			this.customerId === customer.customerId &&
			this.email === customer.email &&
			this.createdAt.toISOString() === customer.createdAt.toISOString() &&
			((!this.updatedAt && !customer.updatedAt) ||
				this.updatedAt?.toISOString() === customer.updatedAt?.toISOString())
		);
	}
}
