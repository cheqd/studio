import {
	Entity,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	ManyToOne,
	JoinColumn,
	BeforeInsert,
	PrimaryColumn,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Credential } from '@veramo/data-store';
import { CustomerEntity } from './customer.entity.js';
import { CredentialProviderEntity } from './credential-provider.entity.js';
import { StatusRegistryEntity } from './status-registry.entity.js';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Tracks credentials issued through external providers (e.g., Dock, Studio)
 * This entity stores metadata about issued credentials including status,
 * provider information, and credential-specific data.
 */
@Entity('issuedCredential')
export class IssuedCredentialEntity {
	@PrimaryColumn({ type: 'varchar', nullable: false })
	issuedCredentialId!: string;

	@Column({ type: 'varchar', nullable: false })
	providerId!: string;

	@Column({ type: 'varchar', nullable: true })
	providerCredentialId?: string;

	@Column({ type: 'varchar', nullable: true })
	issuerId?: string;

	@Column({ type: 'varchar', nullable: true })
	subjectId?: string;

	@Column({ type: 'text', nullable: false })
	format!: 'jwt' | 'jsonld' | 'sd-jwt-vc' | 'anoncreds';

	@Column({ type: 'text', nullable: false })
	category!: 'credential' | 'accreditation';

	@Column('json', { nullable: false })
	type!: string[];

	@Column({ type: 'text', nullable: false, default: 'issued' })
	status!: 'issued' | 'suspended' | 'revoked' | 'unknown' | 'offered' | 'rejected';

	@Column({ type: 'timestamptz', nullable: true })
	statusUpdatedAt?: Date;

	@Column('json', { nullable: true })
	metadata?: Record<string, any>;

	@Column('json', { nullable: true })
	credentialStatus?: Record<string, any>;

	@Column({ type: 'integer', nullable: true })
	statusIndex?: number;

	@Column({ type: 'integer', nullable: false, default: 0 })
	retryCount!: number;

	@Column({ type: 'text', nullable: true })
	lastError?: string;

	@Column({ type: 'timestamptz', nullable: false })
	issuedAt!: Date;

	@Column({ type: 'timestamptz', nullable: true })
	expiresAt?: Date;

	@Column({ type: 'timestamptz', nullable: true })
	subjectAcceptedAt?: Date;

	@Column({ type: 'timestamptz', nullable: true })
	offerExpiresAt?: Date;

	@CreateDateColumn()
	createdAt?: Date;

	@UpdateDateColumn()
	updatedAt?: Date;

	@Column('boolean', { default: false })
	deprecated?: boolean;

	// Relations
	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId' })
	customer?: CustomerEntity;

	@ManyToOne(() => CredentialProviderEntity, (provider) => provider.providerId, { nullable: false })
	@JoinColumn({ name: 'providerId' })
	provider?: CredentialProviderEntity;

	@ManyToOne(() => StatusRegistryEntity, (registry) => registry.registryId, { nullable: true })
	@JoinColumn({ name: 'statusRegistryId' })
	statusRegistry?: StatusRegistryEntity;

	/**
	 * Hash of the credential stored in Veramo's data store
	 * This is the foreign key that references the 'hash' column in Veramo's credential table
	 */
	@Column({ type: 'varchar', nullable: true })
	veramoHash?: string;

	/**
	 * Reference to Veramo's credential table
	 * This links to the credential stored in Veramo's data store
	 */
	@ManyToOne(() => Credential, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'veramoHash', referencedColumnName: 'hash' })
	veramoCredential?: Credential;

	@BeforeInsert()
	addId() {
		if (!this.issuedCredentialId) {
			this.issuedCredentialId = uuidv4();
		}
	}

	constructor(
		providerId: string,
		format: 'jwt' | 'jsonld' | 'sd-jwt-vc' | 'anoncreds',
		category: 'credential' | 'accreditation',
		type: string[],
		issuedAt: Date,
		customer: CustomerEntity,
		options?: {
			issuedCredentialId?: string;
			providerCredentialId?: string;
			issuerId?: string;
			subjectId?: string;
			status?: 'issued' | 'suspended' | 'revoked' | 'unknown' | 'offered' | 'rejected';
			statusUpdatedAt?: Date;
			metadata?: Record<string, any>;
			credentialStatus?: Record<string, any>;
			statusRegistry?: StatusRegistryEntity;
			statusIndex?: number;
			retryCount?: number;
			lastError?: string;
			expiresAt?: Date;
			subjectAcceptedAt?: Date;
			offerExpiresAt?: Date;
			veramoCredential?: Credential;
			deprecated?: boolean;
		}
	) {
		if (options?.issuedCredentialId) {
			this.issuedCredentialId = options.issuedCredentialId;
		}
		this.providerId = providerId;
		this.providerCredentialId = options?.providerCredentialId;
		this.issuerId = options?.issuerId;
		this.subjectId = options?.subjectId;
		this.format = format;
		this.category = category;
		this.type = type;
		this.status = options?.status || 'issued';
		this.statusUpdatedAt = options?.statusUpdatedAt;
		this.metadata = options?.metadata;
		this.credentialStatus = options?.credentialStatus;
		this.statusRegistry = options?.statusRegistry;
		this.statusIndex = options?.statusIndex;
		this.retryCount = options?.retryCount || 0;
		this.lastError = options?.lastError;
		this.issuedAt = issuedAt;
		this.expiresAt = options?.expiresAt;
		this.subjectAcceptedAt = options?.subjectAcceptedAt;
		this.offerExpiresAt = options?.offerExpiresAt;
		this.veramoCredential = options?.veramoCredential;
		this.customer = customer;
		this.deprecated = options?.deprecated || false;
	}
}
