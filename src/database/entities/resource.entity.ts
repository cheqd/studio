import { BeforeInsert, Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';

import * as dotenv from 'dotenv';
import { Identifier, Key } from '@veramo/data-store';
import { CustomerEntity } from './customer.entity.js';
import type { IdentifierEntity } from './identifier.entity.js';
import type { KeyEntity } from './key.entity.js';
dotenv.config();

@Entity('resource')
export class ResourceEntity {
	@PrimaryColumn({
		type: 'uuid',
		nullable: false,
	})
	resourceId!: string;

	@Column({
		type: 'text',
		nullable: false,
	})
	resourceName!: string;

	@Column({
		type: 'text',
		nullable: true,
	})
	resourceType!: string;

	@Column({
		type: 'text',
		nullable: false,
	})
	mediaType!: string;

	@Column({
		type: 'uuid', // declared as text in the database, we should migrate to uuid
		nullable: true,
	})
	previousVersionId?: string;

	@Column({
		type: 'uuid', // declared as text in the database, we should migrate to uuid
		nullable: true,
	})
	nextVersionId?: string;

	@Column({
		type: 'bool',
		default: false,
		nullable: false,
	})
	encrypted!: boolean;

	// Should be encrypted in the same way as the privateKeyHex in the private-key table
	@Column({
		type: 'text',
		nullable: true,
	})
	symmetricKey!: string;

	@Column({
		type: 'timestamptz',
		nullable: false,
	})
	createdAt!: Date;

	@Column({
		type: 'timestamptz',
		nullable: true,
	})
	updatedAt?: Date;

	@BeforeInsert()
	setCreatedAt() {
		this.createdAt = new Date();
	}

	@ManyToOne(() => Identifier, (identifier) => identifier.did, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'identifierDid' })
	identifier!: Identifier;

	@ManyToOne(() => Key, (key) => key.kid, { nullable: false,onDelete: 'CASCADE' })
	@JoinColumn({ name: 'kid' })
	key!: Key;

	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { nullable: false, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId' })
	customer!: CustomerEntity;

	constructor(
		resourceId: string,
		resourceName: string,
		resourceType: string,
		mediaType: string,
		previousVersionId: string,
		nextVersionId: string,
		customer: CustomerEntity,
		identifier: IdentifierEntity,
		key: KeyEntity,
		encrypted: boolean,
		symmetricKey: string
	) {
		this.resourceId = resourceId;
		this.resourceName = resourceName;
		this.resourceType = resourceType;
		this.mediaType = mediaType;
		this.previousVersionId = previousVersionId;
		this.nextVersionId = nextVersionId;
		this.customer = customer;
		this.identifier = identifier;
		this.key = key;
		this.encrypted = encrypted;
		this.symmetricKey = symmetricKey;
	}
}
