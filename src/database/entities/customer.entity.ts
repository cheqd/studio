import { BeforeInsert, BeforeUpdate, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import * as dotenv from 'dotenv';
dotenv.config();

@Entity('customer')
export class CustomerEntity {
	@PrimaryGeneratedColumn('uuid')
	customerId!: string;

	@Column({
		type: 'text', 
		nullable: false
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

	@BeforeInsert()
	setCreatedAt() {
	  this.createdAt = new Date()
	}

	@BeforeUpdate()
	setUpdateAt() {
	  this.updatedAt = new Date()
	}

	constructor(customerId: string, name: string) {
		this.customerId = customerId;
		this.name = name;
	}
}
