import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CustomerEntity } from './customer.entity.js';

/**
 * One row per verify-an-agent or verify-credential call, for metering. Holds which checks ran and the verdict,
 * never credential contents. `customerId` is null for an anonymous verifier.
 */
@Entity('verificationEvent')
@Index('IDX_verificationEvent_customerId_createdAt', ['customer', 'createdAt'])
export class VerificationEventEntity {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { nullable: true, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId', foreignKeyConstraintName: 'FK_verificationEvent_customerId' })
	customer?: CustomerEntity;

	@Column({ type: 'text', nullable: true })
	subjectDid?: string;

	@Column({ type: 'jsonb', nullable: false, default: () => "'{}'" })
	checks!: Record<string, unknown>;

	@Column({ type: 'varchar', length: 32, nullable: false })
	verdict!: string;

	@Column({ type: 'varchar', length: 16, nullable: false })
	engine!: string;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;
}
