import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AgentEntity } from './agent.entity.js';
import { AuthorityGrantEntity } from './authority-grant.entity.js';
import { CustomerEntity } from './customer.entity.js';
import { IssuedCredentialEntity } from './issued-credential.entity.js';
import { PaymentAddressBindingEntity } from './payment-address-binding.entity.js';

/**
 * A signed authority credential that Studio issued to an agent (an authority grant or a payment address binding),
 * kept so its owner can download it again. Authority credentials are the exception to Studio keeping only an index
 * of what it issues: ordinary credentials are not stored.
 *
 * `sealed` is the credential encrypted with Studio's database key (`EXTERNAL_DB_ENCRYPTION_KEY`, the same
 * `SecretBox` that protects private keys and stored idempotent responses); the column never holds plaintext.
 * Exactly one of `grant` and `binding` is set. An expiry change issues a replacement for the same grant: the old row
 * stays, with `supersededAt` and `supersededBy` set, and at most one row per grant or binding is current.
 * Deleting the customer, agent, grant or binding deletes the row (FK cascade).
 */
@Entity('authorityCredential')
@Index('IDX_authorityCredential_customerId', ['customer'])
@Index('IDX_authorityCredential_agentId', ['agent'])
@Index('UQ_authorityCredential_grantId_current', ['grant'], { unique: true, where: '"supersededAt" IS NULL' })
@Index('UQ_authorityCredential_bindingId_current', ['binding'], { unique: true, where: '"supersededAt" IS NULL' })
export class AuthorityCredentialEntity {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId', foreignKeyConstraintName: 'FK_authorityCredential_customerId' })
	customer!: CustomerEntity;

	@ManyToOne(() => AgentEntity, (agent) => agent.agentId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'agentId', foreignKeyConstraintName: 'FK_authorityCredential_agentId' })
	agent!: AgentEntity;

	@ManyToOne(() => AuthorityGrantEntity, (grant) => grant.id, { nullable: true, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'grantId', foreignKeyConstraintName: 'FK_authorityCredential_grantId' })
	grant?: AuthorityGrantEntity;

	@ManyToOne(() => PaymentAddressBindingEntity, (binding) => binding.id, { nullable: true, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'bindingId', foreignKeyConstraintName: 'FK_authorityCredential_bindingId' })
	binding?: PaymentAddressBindingEntity;

	@ManyToOne(() => IssuedCredentialEntity, (credential) => credential.issuedCredentialId, {
		nullable: true,
		onDelete: 'SET NULL',
	})
	@JoinColumn({ name: 'issuedCredentialId', foreignKeyConstraintName: 'FK_authorityCredential_issuedCredentialId' })
	issuedCredential?: IssuedCredentialEntity;

	/** `sd-jwt-vc` or `jwt`, as issued. */
	@Column({ type: 'varchar', length: 16, nullable: false })
	format!: string;

	/** `{ v, enc }`: the sealed `{ format, value }`. Never plaintext. */
	@Column({ type: 'jsonb', nullable: false })
	sealed!: Record<string, unknown>;

	@Column({ type: 'timestamptz', nullable: true })
	supersededAt?: Date;

	@ManyToOne(() => AuthorityCredentialEntity, (credential) => credential.id, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'supersededById', foreignKeyConstraintName: 'FK_authorityCredential_supersededById' })
	supersededBy?: AuthorityCredentialEntity;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;
}
