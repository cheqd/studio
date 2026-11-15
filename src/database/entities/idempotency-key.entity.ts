import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { CustomerEntity } from './customer.entity.js';

export const IDEMPOTENCY_STATES = ['submitting', 'succeeded', 'failed', 'unknown'] as const;
export type IdempotencyState = (typeof IDEMPOTENCY_STATES)[number];

/**
 * Makes a ledger write on a new route safe to retry (engine spec 3.4, data model 4.1). The row is committed in
 * state `submitting` before the SDK is called, so a crash leaves evidence; it then settles to `succeeded`
 * (response and transaction hash recorded), `failed`, or `unknown` (a timeout: the write may or may not have
 * landed, so nothing writes again until a reconciler settles it).
 */
@Entity('idempotencyKey')
@Index('IDX_idempotencyKey_customerId', ['customer'])
@Index('UQ_idempotencyKey_customerId_key', ['customer', 'key'], { unique: true })
@Index('IDX_idempotencyKey_expiresAt', ['expiresAt'])
export class IdempotencyKeyEntity {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId', foreignKeyConstraintName: 'FK_idempotencyKey_customerId' })
	customer!: CustomerEntity;

	@Column({ type: 'varchar', length: 255, nullable: false })
	key!: string;

	@Column({ type: 'varchar', length: 255, nullable: false })
	route!: string;

	/** SHA-256 of the canonical request, so the same key with a different request is refused. */
	@Column({ type: 'varchar', length: 64, nullable: false })
	requestHash!: string;

	@Column({ type: 'varchar', length: 16, nullable: false, default: 'submitting' })
	state!: IdempotencyState;

	@Column({ type: 'varchar', length: 128, nullable: true })
	txHash?: string | null;

	@Column({ type: 'jsonb', nullable: true })
	response?: Record<string, unknown> | null;

	@Column({ type: 'timestamptz', nullable: false })
	expiresAt!: Date;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'timestamptz' })
	updatedAt!: Date;
}
