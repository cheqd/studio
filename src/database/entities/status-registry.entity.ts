import {
	Entity,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	PrimaryColumn,
	BeforeInsert,
	ManyToOne,
	JoinColumn,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { Identifier } from '@veramo/data-store';
import { CustomerEntity } from './customer.entity.js';
import { StatusRegistryState } from '../../types/credential-status.js';
import { CredentialCategory } from '../../types/credential.js';

export interface StatusRegistryMetadata {
	encoding?: 'base64url' | 'hex';
	statusPurpose?: string;
	additionalUsedIndexes?: number[];

	[x: string]: any;
}

/**
 * Status Registry entity for managing credential status registries
 */
@Entity('statusRegistry')
export class StatusRegistryEntity {
	@PrimaryColumn({ type: 'varchar', nullable: false })
	registryId!: string;

	@Column({ type: 'varchar', nullable: false })
	uri!: string;

	@Column({ type: 'varchar', nullable: true })
	prev_uri?: string;

	@Column({ type: 'varchar', nullable: true })
	next_uri?: string;

	@Column({ type: 'text', nullable: false })
	registryType!: string;

	@Column({ type: 'text', nullable: false })
	storageType!: string;

	@Column({ type: 'varchar', nullable: false })
	registryName!: string;

	@Column('boolean', { default: false })
	encrypted!: boolean;

	@Column({ type: 'varchar', nullable: false })
	credentialCategory!: CredentialCategory;

	@Column({ type: 'integer', nullable: false, default: 0 })
	version!: number;

	@Column({ type: 'integer', nullable: false, default: 131072 })
	registrySize!: number;

	@Column({ type: 'integer', nullable: false, default: 0 })
	writeCursor!: number;

	@Column({ type: 'integer', nullable: false, default: 80 })
	threshold_percentage!: number;

	@Column({ type: 'varchar', nullable: false })
	state!: StatusRegistryState;

	@Column({ type: 'timestamptz', nullable: true })
	sealedAt!: Date;

	@Column({ type: 'varchar', nullable: true })
	sealedCommitment!: string;

	@Column('json', { nullable: true })
	metadata?: StatusRegistryMetadata;

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;

	@Column('boolean', { default: false })
	deprecated!: boolean;

	@Column({ type: 'varchar', length: 16, nullable: false, default: 'veramo' })
	engine!: string;

	// Never changes once set
	@Column({ type: 'varchar', length: 32, nullable: true })
	listFormat?: string;

	// Exact legacy encoding (no-prefix base64url, or hex), so Credo can reproduce it
	@Column({ type: 'varchar', length: 16, nullable: true })
	encoding?: string;

	@ManyToOne(() => Identifier, (identifier) => identifier.did, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'issuerId' })
	identifier!: Identifier;

	// Relations
	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId' })
	customer!: CustomerEntity;

	@BeforeInsert()
	addId() {
		if (!this.registryId) {
			this.registryId = uuidv4();
		}
	}

	constructor(options?: {
		uri: string;
		registryType: string;
		registryName: string;
		credentialCategory: CredentialCategory;
		version: number;
		registrySize: number;
		writeCursor: number;
		state: StatusRegistryState;
		storageType?: 'cheqd' | 'ipfs' | 'dock' | 'paradym';
		metadata?: StatusRegistryMetadata;
		registryId?: string;
		deprecated?: boolean;
		encrypted?: boolean;
		prev_uri?: string;
		next_uri?: string;
		threshold_percentage?: number;
		identifier: Identifier;
		customer: CustomerEntity;
		createdAt?: Date;
		/** The engine that created the list. Omitted means the column default (veramo). */
		engine?: string;
	}) {
		if (!options) {
			return;
		}

		if (options.registryId) {
			this.registryId = options.registryId;
		}
		this.uri = options.uri;
		this.registryType = options.registryType;
		this.registryName = options.registryName;
		this.credentialCategory = options.credentialCategory;
		this.version = options.version;
		this.registrySize = options.registrySize;
		this.writeCursor = options.writeCursor;
		this.state = options.state;
		this.storageType = options.storageType || 'cheqd';
		this.metadata = options.metadata;
		this.deprecated = options.deprecated || false;
		this.encrypted = options.encrypted || false;
		this.prev_uri = options.prev_uri;
		this.next_uri = options.next_uri;
		this.threshold_percentage = options.threshold_percentage || 80;

		this.identifier = options.identifier;
		this.customer = options.customer;
		this.createdAt = options.createdAt || new Date();
		if (options.engine) this.engine = options.engine;
	}
}
