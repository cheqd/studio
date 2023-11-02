import { BeforeInsert, BeforeUpdate, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import { categoryEnum } from './../types/enum.js';

import * as dotenv from 'dotenv';
dotenv.config();

@Entity('operation')
export class OperationEntity {
	@PrimaryGeneratedColumn('uuid')
	operationId!: string;

	@Column({
		type: 'enum',
		enum: categoryEnum,
		nullable: false,
	})
	category!: string;

	@Column({
		type: 'text',
		nullable: false,
	})
	operationName!: string;

	@Column({
		type: 'bigint',
		nullable: false,
	})
	defaultFee!: number;

	@Column({
		type: 'bool',
		nullable: false,
		default: false,
	})
	deprecated!: boolean;

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

	constructor(operationId: string, category: string, operationName: string, defaultFee: number, deprecated: boolean) {
		this.operationId = operationId;
		this.category = category;
		this.operationName = operationName;
		this.defaultFee = defaultFee;
		this.deprecated = deprecated;
	}
}
