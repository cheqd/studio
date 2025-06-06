import { BeforeInsert, BeforeUpdate, Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import * as dotenv from 'dotenv';
import { CustomerEntity } from './customer.entity.js';
import { RoleEntity } from './role.entity.js';
dotenv.config();

@Entity('user')
export class UserEntity {
	@Column({
		type: 'text',
		nullable: false,
		primary: true,
	})
	logToId!: string;

	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId' })
	customer!: CustomerEntity;

	@ManyToOne(() => RoleEntity, (role) => role.roleTypeId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'roleTypeId' })
	role!: RoleEntity;

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

	constructor(logToId: string, customer: CustomerEntity, role: RoleEntity) {
		this.logToId = logToId;
		this.customer = customer;
		this.role = role;
	}
}
