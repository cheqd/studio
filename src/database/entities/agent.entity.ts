import {
	Column,
	CreateDateColumn,
	DeleteDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { Identifier } from '@veramo/data-store';
import { CustomerEntity } from './customer.entity.js';
import type { AgentCapabilities } from '../../types/agent.js';

/**
 * An agent registered in Studio. Tenant-scoped: every agent belongs to one customer and is anchored to a DID
 * managed by Studio (`identifier.did`).
 */
@Entity('agent')
@Index('IDX_agent_customerId', ['customer'])
@Index('IDX_agent_did', ['identifier'])
export class AgentEntity {
	@PrimaryGeneratedColumn('uuid')
	agentId!: string;

	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId', foreignKeyConstraintName: 'FK_agent_customerId' })
	customer!: CustomerEntity;

	@ManyToOne(() => Identifier, (identifier) => identifier.did, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'did', foreignKeyConstraintName: 'FK_agent_did' })
	identifier!: Identifier;

	@Column({ type: 'text', nullable: false })
	name!: string;

	@Column({ type: 'text', nullable: true })
	description?: string;

	// DID of the principal this agent acts for, if any
	@Column({ type: 'text', nullable: true })
	actsForDid?: string;

	@Column({ type: 'varchar', length: 16, nullable: false, default: 'active' })
	status!: string;

	/** Labels the owner chose (A2A, AP2, KYA-OS, MCP). Not enforcement. */
	@Column({
		type: 'jsonb',
		nullable: false,
		default: () => `'{"a2a":false,"ap2":false,"kyaOs":false,"mcp":false}'::jsonb`,
	})
	capabilities!: AgentCapabilities;

	/** Free text for analytics only. Stored, never trusted. */
	@Column({ type: 'varchar', length: 64, nullable: true })
	useCase?: string;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt!: Date;

	@DeleteDateColumn({ type: 'timestamptz', nullable: true })
	deletedAt?: Date;
}
