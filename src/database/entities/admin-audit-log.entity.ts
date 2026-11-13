import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Every staff action, including flag changes and customer deletion. Append-only: the `studio_api` role gets
 * INSERT and SELECT only (see the migration). There is deliberately no foreign key to `customer`, so a row
 * survives the deletion it records.
 */
@Entity('adminAuditLog')
@Index('IDX_adminAuditLog_targetCustomerId', ['targetCustomerId'])
@Index('IDX_adminAuditLog_createdAt', ['createdAt'])
export class AdminAuditLogEntity {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'text', nullable: false })
	actorUserId!: string;

	@Column({ type: 'text', nullable: false })
	action!: string;

	@Column({ type: 'uuid', nullable: true })
	targetCustomerId?: string;

	@Column({ type: 'text', nullable: false })
	reason!: string;

	@Column({ type: 'text', nullable: true })
	ticketRef?: string;

	@Column({ type: 'jsonb', nullable: false, default: () => "'{}'" })
	metadata!: Record<string, unknown>;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;
}
