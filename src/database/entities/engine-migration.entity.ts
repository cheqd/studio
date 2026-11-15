import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export const ENGINE_MIGRATION_ENTITY_TYPES = ['did', 'statusList', 'resource'] as const;
export const ENGINE_MIGRATION_STATUSES = ['planned', 'verified-read', 'migrated', 'rolled-back', 'failed'] as const;

const toSqlList = (values: readonly string[]) => values.map((value) => `'${value}'`).join(', ');

/**
 * One row per artifact moved between engines, kept as the evidence trail. Platform-level record, so there is
 * no customer foreign key.
 */
@Entity('engineMigration')
@Check('CHK_engineMigration_entityType', `"entityType" IN (${toSqlList(ENGINE_MIGRATION_ENTITY_TYPES)})`)
@Check('CHK_engineMigration_status', `"status" IN (${toSqlList(ENGINE_MIGRATION_STATUSES)})`)
@Index('IDX_engineMigration_entity', ['entityType', 'entityId'])
export class EngineMigrationEntity {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'varchar', length: 16, nullable: false })
	entityType!: (typeof ENGINE_MIGRATION_ENTITY_TYPES)[number];

	@Column({ type: 'text', nullable: false })
	entityId!: string;

	@Column({ type: 'varchar', length: 16, nullable: true })
	network?: string;

	@Column({ type: 'varchar', length: 16, nullable: false })
	fromEngine!: string;

	@Column({ type: 'varchar', length: 16, nullable: false })
	toEngine!: string;

	@Column({ type: 'varchar', length: 16, nullable: false, default: 'planned' })
	status!: (typeof ENGINE_MIGRATION_STATUSES)[number];

	@Column({ type: 'text', nullable: true })
	checkedBy?: string;

	@Column({ type: 'timestamptz', nullable: true })
	checkedAt?: Date;

	@Column({ type: 'text', nullable: true })
	error?: string;
}
