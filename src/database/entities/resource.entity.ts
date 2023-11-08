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
		type: 'uuid',
		nullable: true,
	})
	previousVersionId!: string;

	@Column({
		type: 'uuid',
		nullable: true,
	})
	nextVersionId!: string;

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

	@BeforeInsert()
	setCreatedAt() {
		this.createdAt = new Date();
	}

	@ManyToOne(() => Identifier, (identifier) => identifier.did, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'identifierDid' })
	identifier!: Identifier;

	@ManyToOne(() => Key, (key) => key.kid, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'kid' })
	key!: Key;

	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId' })
	customer!: CustomerEntity;

	constructor(
		resourceId: string,
		resourceName: string,
		resourceType: string,
		mediaType: string,
		previousVersionId: string | null,
		nextVersionId: string | null,
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
		this.previousVersionId = previousVersionId || '';
		this.nextVersionId = nextVersionId || '';
		this.customer = customer;
		this.identifier = identifier;
		this.key = key;
		this.encrypted = encrypted;
		this.symmetricKey = symmetricKey;
	}
}
