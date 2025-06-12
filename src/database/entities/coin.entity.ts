import { BeforeInsert, BeforeUpdate, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

import * as dotenv from 'dotenv';
import { MINIMAL_DENOM } from '../../types/constants.js';
dotenv.config();

@Entity('coin')
export class CoinEntity {
	@PrimaryGeneratedColumn('uuid')
	coinId!: string;

	@Column({
		type: 'text',
		nullable: false,
	})
	denom!: string;

	@Column({
		type: 'bigint',
		nullable: false,
	})
	amount!: bigint;

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

	@BeforeInsert()
	setCreatedAt() {
		this.createdAt = new Date();
	}

	@BeforeUpdate()
	setUpdateAt() {
		this.updatedAt = new Date();
	}

	constructor(coindId: string, amount: bigint, denom = MINIMAL_DENOM) {
		this.coinId = coindId;
		this.amount = amount;
		this.denom = denom;
	}
}
