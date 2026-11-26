import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AgentEntity } from './agent.entity.js';
import { CustomerEntity } from './customer.entity.js';

/**
 * A versioned, signed A2A agent card. `customerId` is denormalised from the agent so tenant isolation can be
 * enforced and tested without a join.
 */
@Entity('agentCard')
@Index('UQ_agentCard_agentId_version', ['agent', 'version'], { unique: true })
@Index('IDX_agentCard_customerId', ['customer'])
export class AgentCardEntity {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@ManyToOne(() => AgentEntity, (agent) => agent.agentId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'agentId', foreignKeyConstraintName: 'FK_agentCard_agentId' })
	agent!: AgentEntity;

	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId', foreignKeyConstraintName: 'FK_agentCard_customerId' })
	customer!: CustomerEntity;

	@Column({ type: 'integer', nullable: false })
	version!: number;

	@Column({ type: 'jsonb', nullable: false })
	card!: Record<string, unknown>;

	@Column({ type: 'text', nullable: true })
	jws?: string;

	// The DID-Linked Resource id, if the card has been published
	@Column({ type: 'text', nullable: true })
	resourceId?: string;

	@Column({ type: 'timestamptz', nullable: true })
	publishedAt?: Date;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;
}
