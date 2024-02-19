import { BeforeInsert, BeforeUpdate, Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { categoryEnum } from './../types/enum.js';
import { CoinEntity } from './coin.entity.js';

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
		type: 'bool',
		nullable: false,
		default: false,
	})
	deprecated!: boolean;

	@Column({
		type: 'boolean',
		nullable: false,
	})
	successful!: boolean;

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

	@ManyToOne(() => CoinEntity, (defaultFee) => defaultFee.coinId, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'defaultFee' })
	defaultFee!: CoinEntity;

	constructor(
		operationId: string,
		category: string,
		operationName: string,
		defaultFee: CoinEntity,
		deprecated: boolean,
		successful: boolean
	) {
		this.operationId = operationId;
		this.category = category;
		this.operationName = operationName;
		this.defaultFee = defaultFee;
		this.deprecated = deprecated;
		this.successful = successful;
	}
}
