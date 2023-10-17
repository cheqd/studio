import { BeforeInsert, Column, Entity, ManyToOne, PrimaryGeneratedColumn, RelationId } from 'typeorm';

import * as dotenv from 'dotenv';
import { Identifier, Key } from '@veramo/data-store';
import { CustomerEntity } from './customer.entity.js';
dotenv.config();

@Entity('resource')
export class ResourceEntity {
	@PrimaryGeneratedColumn('uuid')
	resourceId!: string;

    @RelationId((resource: ResourceEntity) => resource.identifier)
	@Column({
        type: 'text',
        nullable: false,
    })
    identifierDid!: string;

    @RelationId((resource: ResourceEntity) => resource.key)
    @Column({
        type: 'text',
        nullable: false,
    })
    kid!: string;

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

    @RelationId((resource: ResourceEntity) => resource.customer)
    @Column({
        type: 'uuid',
        nullable: false,
    })
    customerId!: string;

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
		type: 'date',
		nullable: false,
	})
	createdAt!: Date;

	@BeforeInsert()
	setCreatedAt() {
	  this.createdAt = new Date()
	}

    @ManyToOne(() => Identifier, identifier => identifier.did, { onDelete: 'CASCADE' })
    identifier!: Identifier;

    @ManyToOne(() => Key, key => key.kid, { onDelete: 'CASCADE' })
    key!: Key;

    @ManyToOne(() => CustomerEntity, customer => customer.customerId, { onDelete: 'CASCADE' })
    customer!: CustomerEntity;

	constructor(identifierDid: string, kid: string, resourceName: string, resourceType: string, mediaType: string, customerId: string) {
        this.identifierDid = identifierDid;
        this.kid = kid;
        this.resourceName = resourceName;
        this.resourceType = resourceType;
        this.mediaType = mediaType;
        this.customerId = customerId;
    }
}
