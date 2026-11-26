import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import * as dotenv from 'dotenv';
import { CustomerEntity } from './customer.entity.js';
dotenv.config();

/**
 * Engine kill switches per route family, the UI default, and per-customer overrides for testing
 * (migration plan, section 6.3). A row with `customerId` null is the global default.
 *
 * Uniqueness of ("flagKey", "customerId", "route") treats NULLs as equal; that is enforced by an expression
 * index in the migration (Postgres treats NULLs as distinct in a plain unique constraint), so no @Unique is
 * declared here.
 */
@Entity('featureFlag')
export class FeatureFlagEntity {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'text', nullable: false })
	flagKey!: string;

	@Column({ type: 'uuid', nullable: true })
	customerId!: string | null;

	@ManyToOne(() => CustomerEntity, { nullable: true, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId' })
	customer?: CustomerEntity;

	@Column({ type: 'text', nullable: true })
	route!: string | null;

	@Column({ type: 'jsonb', nullable: false })
	value!: Record<string, unknown>;

	@Column({ type: 'text', nullable: false })
	updatedBy!: string;

	@Column({ type: 'timestamptz', nullable: false, default: () => 'now()' })
	updatedAt!: Date;
}
