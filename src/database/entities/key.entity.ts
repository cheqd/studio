import { BeforeInsert, BeforeUpdate, Column, Entity, ManyToOne, RelationId } from 'typeorm';

import * as dotenv from 'dotenv';
import { Key } from '@veramo/data-store';
import { CustomerEntity } from './customer.entity.js';
dotenv.config();

@Entity('key')
export class KeyEntity extends Key {

    @RelationId((key: KeyEntity) => key.customer)
    @Column({
        type: 'uuid',
        nullable: false,
    })
    customerId!: string;

    @Column({
        type: 'text',
        nullable: true,
    })
    publicKeyAlias: string;

    @Column({
		type: 'date',
		nullable: false,
	})
	createdAt!: Date;

	@Column({
		type: 'date',
		nullable: true,
	})
	updatedAt!: Date;

	@BeforeInsert()
	setCreatedAt() {
	  this.createdAt = new Date()
	}

	@BeforeUpdate()
	setUpdateAt() {
	  this.updatedAt = new Date()
	}

    @ManyToOne(() => CustomerEntity, customer => customer.customerId, { onDelete: 'CASCADE' })
    customer!: CustomerEntity;
	
	constructor(kid: string, type: string, publicKeyHex: string,) {
		super();
        this.publicKeyAlias = '';
	}
}
