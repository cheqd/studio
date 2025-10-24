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
import { CustomerEntity } from './customer.entity.js';
import { CredentialProviderEntity } from './credential-provider.entity.js';
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
	status!: 'issued' | 'suspended' | 'revoked';

	@Column({ type: 'timestamptz', nullable: true })
	statusUpdatedAt?: Date;

	@Column('json', { nullable: true })
	metadata?: Record<string, any>;

	@Column('json', { nullable: true })
	credentialStatus?: Record<string, any>;

	@Column({ type: 'timestamptz', nullable: false })
	issuedAt!: Date;

	@Column({ type: 'timestamptz', nullable: true })
	expiresAt?: Date;

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
			status?: 'issued' | 'suspended' | 'revoked';
			statusUpdatedAt?: Date;
			metadata?: Record<string, any>;
			credentialStatus?: Record<string, any>;
			expiresAt?: Date;
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
		this.issuedAt = issuedAt;
		this.expiresAt = options?.expiresAt;
		this.customer = customer;
		this.deprecated = options?.deprecated || false;
	}
}
