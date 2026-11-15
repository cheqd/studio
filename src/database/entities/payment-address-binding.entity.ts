import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AgentEntity } from './agent.entity.js';
import { CustomerEntity } from './customer.entity.js';
import { IssuedCredentialEntity } from './issued-credential.entity.js';
import { StatusRegistryEntity } from './status-registry.entity.js';

/**
 * An x402 payment address bound to an agent. `account` is a CAIP-10 identifier, for example `eip155:8453:0x...`.
 * An account can be bound to an agent once while the binding is not revoked.
 */
@Entity('paymentAddressBinding')
@Index('UQ_paymentAddressBinding_agentId_account_active', ['agent', 'account'], {
	unique: true,
	where: '"revokedAt" IS NULL',
})
@Index('IDX_paymentAddressBinding_customerId', ['customer'])
export class PaymentAddressBindingEntity {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@ManyToOne(() => AgentEntity, (agent) => agent.agentId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'agentId', foreignKeyConstraintName: 'FK_paymentAddressBinding_agentId' })
	agent!: AgentEntity;

	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId', foreignKeyConstraintName: 'FK_paymentAddressBinding_customerId' })
	customer!: CustomerEntity;

	@Column({ type: 'text', nullable: false })
	account!: string;

	// The signed binding credential
	@ManyToOne(() => IssuedCredentialEntity, (credential) => credential.issuedCredentialId, {
		nullable: true,
		onDelete: 'SET NULL',
	})
	@JoinColumn({ name: 'issuedCredentialId', foreignKeyConstraintName: 'FK_paymentAddressBinding_issuedCredentialId' })
	issuedCredential?: IssuedCredentialEntity;

	@ManyToOne(() => StatusRegistryEntity, (registry) => registry.registryId, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'statusListId', foreignKeyConstraintName: 'FK_paymentAddressBinding_statusListId' })
	statusList?: StatusRegistryEntity;

	@Column({ type: 'integer', nullable: true })
	statusIndex?: number;

	@Column({ type: 'timestamptz', nullable: true })
	revokedAt?: Date;

	@CreateDateColumn({ type: 'timestamptz' })
	createdAt!: Date;
}
