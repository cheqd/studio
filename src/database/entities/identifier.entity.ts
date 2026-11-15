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

	// What the DID was made for: 'agent' for a DID created by registering an agent, null for any other DID. Set when
	// the agent is registered and never cleared, so it still marks the DID after the agent is deleted.
	@Column({ type: 'varchar', length: 16, nullable: true })
	kind?: string | null;

	// When the agent that owns this DID was deleted. The DID itself stays active on the ledger.
	@Column({ type: 'timestamptz', nullable: true })
	agentDeletedAt?: Date | null;

	constructor() {
		super();
	}
}
