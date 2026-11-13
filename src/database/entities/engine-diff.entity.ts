import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { CustomerEntity } from './customer.entity.js';

/**
 * A shadow-read difference between the primary and the shadow engine. `diff` holds identifiers and verdicts
 * only, never claim values. Kept for 30 days.
 */
@Entity('engineDiff')
@Index('IDX_engineDiff_customerId', ['customer'])
@Index('IDX_engineDiff_route_createdAt', ['route', 'createdAt'])
export class EngineDiffEntity {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'text', nullable: false })
	route!: string;

	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId', foreignKeyConstraintName: 'FK_engineDiff_customerId' })
	customer!: CustomerEntity;

	@Column({ type: 'varchar', length: 16, nullable: false })
	primaryEngine!: string;

	@Column({ type: 'varchar', length: 128, nullable: false })
	primaryHash!: string;

	@Column({ type: 'varchar', length: 128, nullable: false })
	shadowHash!: string;

	@Column({ type: 'jsonb', nullable: false, default: () => "'{}'" })
	diff!: Record<string, unknown>;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;
}
