import {
	BeforeInsert,
	BeforeUpdate,
	Column,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
} from 'typeorm';

import { categoryEnum } from './../types/enum.js';
import { CoinEntity } from './coin.entity.js';

import * as dotenv from 'dotenv';
import { CustomerEntity } from './customer.entity.js';
dotenv.config();

@Entity('operation')
@Index('IDX_operation_customerId_createdAt', ['customer', 'createdAt'])
@Index('IDX_operation_createdAt', ['createdAt'])
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
		default: true,
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

	@Column({ type: 'varchar', length: 16, nullable: true })
	engine?: string;

	@Column({ type: 'varchar', length: 16, nullable: true })
	network?: string;

	@Column({ type: 'varchar', length: 16, nullable: true })
	outcome?: string;

	@Column({ type: 'integer', nullable: true })
	durationMs?: number;

	/** How the caller authenticated: `api-key`, `portal`, `id-token`, `m2m` or `swagger-ui`. Null on older rows. */
	@Column({ type: 'varchar', length: 16, nullable: true })
	authMethod?: string;

	@BeforeInsert()
	setCreatedAt() {
		this.createdAt = new Date();
	}

	@BeforeUpdate()
	setUpdateAt() {
		this.updatedAt = new Date();
	}

	@ManyToOne(() => CoinEntity, (defaultFee) => defaultFee.coinId, { nullable: true, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'defaultFee' })
	defaultFee?: CoinEntity;

	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { nullable: true, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId' })
	customer?: CustomerEntity;

	constructor(
		operationId: string,
		category: string,
		operationName: string,
		defaultFee: CoinEntity,
		deprecated: boolean,
		successful: boolean,
		customer: CustomerEntity
	) {
		this.operationId = operationId;
		this.category = category;
		this.operationName = operationName;
		this.defaultFee = defaultFee;
		this.deprecated = deprecated;
		this.successful = successful;
		this.customer = customer;
	}
}
