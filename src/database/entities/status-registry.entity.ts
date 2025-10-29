import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryColumn, BeforeInsert } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

/**
 * Status Registry entity for managing credential status registries
 */
@Entity('statusRegistry')
export class StatusRegistryEntity {
	@PrimaryColumn({ type: 'varchar', nullable: false })
	registryId!: string;

	@Column({ type: 'varchar', nullable: false })
	uri!: string;

	@Column({ type: 'varchar', nullable: false })
	issuerId!: string;

	@Column({ type: 'text', nullable: false })
	registryType!: string;

	@Column({ type: 'text', nullable: false })
	statusPurpose!: string;

	@Column({ type: 'text', nullable: false })
	storageType!: string;

	@Column({ type: 'varchar', nullable: false })
	registryName!: string;

	@Column({ type: 'varchar', nullable: false })
	version!: string;

	@Column({ type: 'integer', nullable: false })
	size!: number;

	@Column({ type: 'integer', nullable: false })
	lastAssignedIndex!: number;

	@Column({ type: 'varchar', nullable: false })
	state!: 'ACTIVE' | 'FULL' | 'STANDBY';

	@Column('json', { nullable: true })
	metadata?: Record<string, any>;

	@CreateDateColumn()
	createdAt?: Date;

	@UpdateDateColumn()
	updatedAt?: Date;

	@Column('boolean', { default: false })
	deprecated?: boolean;

	@BeforeInsert()
	addId() {
		if (!this.registryId) {
			this.registryId = uuidv4();
		}
	}

	constructor(
		uri: string,
		issuerId: string,
		registryType: string,
		statusPurpose: string,
		storageType: 'cheqd' | 'ipfs' | 'dock' | 'paradym',
		registryName: string,
		version: string,
		size: number,
		lastAssignedIndex: number,
		state: 'ACTIVE' | 'FULL' | 'STANDBY',
		metadata?: Record<string, any>,
		registryId?: string
	) {
		if (registryId) {
			this.registryId = registryId;
		}
		this.uri = uri;
		this.issuerId = issuerId;
		this.registryType = registryType;
		this.statusPurpose = statusPurpose;
		this.storageType = storageType;
		this.registryName = registryName;
		this.version = version;
		this.size = size;
		this.lastAssignedIndex = lastAssignedIndex;
		this.state = state;
		this.metadata = metadata;
		this.deprecated = false;
	}
}
