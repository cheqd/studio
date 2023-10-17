import { BeforeInsert, BeforeUpdate, Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import * as dotenv from 'dotenv';
import { namespaceEnum } from './../types/enum.js';
import { CustomerEntity } from './customer.entity.js';
import { Key } from '@veramo/data-store';
import type { KeyEntity } from './key.entity.js';
dotenv.config();

@Entity('paymentAccount')
export class PaymentAccountEntity {
	@Column({
        type: 'text',
        nullable: false,
        primary: true,
    })
	address!: string;

	@Column({
		type: 'enum', 
        enum: namespaceEnum,
		nullable: false
	})
	namespace!: string;

    @Column({
        type: 'bool',
        nullable: false,
        default: false,
    })
    isDefault!: boolean;

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

    @ManyToOne(() => CustomerEntity, customer => customer.customerId, { onDelete: 'CASCADE' })
    @JoinColumn({name: "customerId"})
    customer!: CustomerEntity;

    @ManyToOne(() => Key, key => key.kid, { onDelete: 'CASCADE' })
    @JoinColumn({name: "kid"})
    key!: Key;

	@BeforeInsert()
	setCreatedAt() {
	  this.createdAt = new Date()
	}

	@BeforeUpdate()
	setUpdateAt() {
	  this.updatedAt = new Date()
	}

	constructor(address: string, namespace: string, isDefault: boolean, customer: CustomerEntity, key: KeyEntity) {
        this.address = address;
        this.namespace = namespace;
        this.isDefault = isDefault;
        this.customer = customer;
        this.key = key;
	}
}
