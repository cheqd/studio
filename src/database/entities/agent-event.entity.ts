import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AgentEntity } from './agent.entity.js';
import { CustomerEntity } from './customer.entity.js';

/**
 * One thing that happened to an agent, written by the agent service. Customer-facing: `actor` is `owner`,
 * `api-key` or `system`, never an email or a user id, and nothing from `adminAuditLog` (staff actions) is read in.
 * `customerId` is denormalised from the agent so tenant isolation needs no join.
 */
@Entity('agentEvent')
@Index('IDX_agentEvent_agentId_createdAt', ['agent', 'createdAt'])
@Index('IDX_agentEvent_customerId', ['customer'])
export class AgentEventEntity {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@ManyToOne(() => AgentEntity, (agent) => agent.agentId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'agentId', foreignKeyConstraintName: 'FK_agentEvent_agentId' })
	agent!: AgentEntity;

	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId', foreignKeyConstraintName: 'FK_agentEvent_customerId' })
	customer!: CustomerEntity;

	@Column({ type: 'varchar', length: 32, nullable: false })
	type!: string;

	@Column({ type: 'varchar', length: 16, nullable: false })
	actor!: string;

	@Column({ type: 'jsonb', nullable: false, default: () => "'{}'::jsonb" })
	detail!: Record<string, unknown>;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;
}
