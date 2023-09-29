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
		type: 'date',
		nullable: false,
	})
	createdAt!: Date;

	@Column({
		type: 'date',
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

	constructor(name: string) {
		this.name = name;
	}
}
