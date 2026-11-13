import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AgentEntity } from './agent.entity.js';
import { CustomerEntity } from './customer.entity.js';
import { IssuedCredentialEntity } from './issued-credential.entity.js';
import { StatusRegistryEntity } from './status-registry.entity.js';

/**
 * What an agent may do: acts-for, mandate, delegation or tool scope. Backed by an issued credential whose status
 * list entry carries revocation.
 */
@Entity('authorityGrant')
@Index('IDX_authorityGrant_agentId', ['agent'])
@Index('IDX_authorityGrant_customerId', ['customer'])
export class AuthorityGrantEntity {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@ManyToOne(() => AgentEntity, (agent) => agent.agentId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'agentId', foreignKeyConstraintName: 'FK_authorityGrant_agentId' })
	agent!: AgentEntity;

	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId', foreignKeyConstraintName: 'FK_authorityGrant_customerId' })
	customer!: CustomerEntity;

	@Column({ type: 'varchar', length: 32, nullable: false })
	grantType!: string;

	@ManyToOne(() => IssuedCredentialEntity, (credential) => credential.issuedCredentialId, {
		nullable: true,
		onDelete: 'SET NULL',
	})
	@JoinColumn({ name: 'issuedCredentialId', foreignKeyConstraintName: 'FK_authorityGrant_issuedCredentialId' })
	issuedCredential?: IssuedCredentialEntity;

	@ManyToOne(() => StatusRegistryEntity, (registry) => registry.registryId, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'statusListId', foreignKeyConstraintName: 'FK_authorityGrant_statusListId' })
	statusList?: StatusRegistryEntity;

	@Column({ type: 'integer', nullable: true })
	statusIndex?: number;

	@Column({ type: 'timestamptz', nullable: true })
	expiresAt?: Date;

	@Column({ type: 'timestamptz', nullable: true })
	revokedAt?: Date;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;
}
