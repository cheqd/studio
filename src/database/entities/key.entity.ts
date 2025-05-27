import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import * as dotenv from 'dotenv';
import { Key } from '@veramo/data-store';
import { CustomerEntity } from './customer.entity.js';
import type { TKeyType } from '@veramo/core';
dotenv.config();

@Entity('key')
export class KeyEntity extends Key {
	@Column({
		type: 'text',
		nullable: true,
	})
	publicKeyAlias: string;

	@Column({
		type: 'timestamptz',
		nullable: false,
		default: () => 'now()',
	})
	createdAt!: Date;

	@Column({
		type: 'timestamptz',
		nullable: true,
		default: () => 'now()',
	})
	updatedAt!: Date;

	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { nullable: true, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId', referencedColumnName: 'customerId' })
	customer!: CustomerEntity;

	constructor(kid: string, type: TKeyType, publicKeyHex: string) {
		super();
		this.kid = kid;
		this.type = type;
		this.publicKeyHex = publicKeyHex;
		this.publicKeyAlias = '';
	}
}
