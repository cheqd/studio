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

/**
 * Status Registry entity for managing credential status registries
 */
@Entity('statusRegistry')
export class StatusRegistryEntity {
	@PrimaryColumn({ type: 'varchar', nullable: false })
	registryId!: string;

	@Column({ type: 'varchar', nullable: false })
	uri!: string;

	@Column({ type: 'text', nullable: false })
	registryType!: string;

	@Column({ type: 'text', nullable: false })
	storageType!: string;

	@Column({ type: 'varchar', nullable: false })
	registryName!: string;

	@Column({ type: 'varchar', nullable: false })
	credentialCategory!: CredentialCategory;

	@Column({ type: 'varchar', nullable: false })
	version!: string;

	@Column({ type: 'integer', nullable: false })
	size!: number;

	@Column({ type: 'integer', nullable: false })
	lastAssignedIndex!: number;

	@Column({ type: 'varchar', nullable: false })
	state!: StatusRegistryState;

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;

	@Column('boolean', { default: false })
	deprecated!: boolean;

	@ManyToOne(() => Identifier, (identifier) => identifier.did, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'identifierDid' })
	identifier!: Identifier;

	// Relations
	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId' })
	customer!: CustomerEntity;

	@Column('json', { nullable: true })
	metadata?: Record<string, any>;

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
		version: string;
		size: number;
		lastAssignedIndex: number;
		state: StatusRegistryState;
		identifier: Identifier;
		customer: CustomerEntity;
		storageType?: 'cheqd' | 'ipfs' | 'dock' | 'paradym';
		metadata?: Record<string, any>;
		registryId?: string;
        deprecated?: boolean;
	}) {
        if(!options) {
            return;
        }

		if (options.registryId) {
			this.registryId = options.registryId;
		}
		this.uri = options.uri;
		this.registryType = options.registryType;
		this.storageType = options.storageType || 'cheqd';
		this.registryName = options.registryName;
		this.version = options.version;
		this.size = options.size;
		this.lastAssignedIndex = options.lastAssignedIndex;
		this.state = options.state;
		this.metadata = options.metadata;
		this.credentialCategory = options.credentialCategory;
		this.deprecated = false;

		this.identifier = options.identifier;
		this.customer = options.customer;
	}
}
