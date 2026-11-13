import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import * as dotenv from 'dotenv';
import { Identifier } from '@veramo/data-store';
import { CustomerEntity } from './customer.entity.js';

dotenv.config();

@Entity('identifier')
@Index('IDX_identifier_customerId_engine', ['customer', 'engine'])
export class IdentifierEntity extends Identifier {
	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { nullable: true, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId' })
	customer!: CustomerEntity;

	// Which engine manages the DID. Defaults to 'veramo' in the database, so existing code need not set it.
	@Column({ type: 'varchar', length: 16, nullable: false, default: 'veramo' })
	engine!: string;

	constructor() {
		super();
	}
}
