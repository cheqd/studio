import { BeforeInsert, BeforeUpdate, Column, Entity, ManyToOne, RelationId } from 'typeorm';

import * as dotenv from 'dotenv';
import { namespaceEnum } from './../types/enum.js';
import { CustomerEntity } from './customer.entity.js';
import { Key } from '@veramo/data-store';
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

    @RelationId((paymentAccount: PaymentAccountEntity) => paymentAccount.customer)
    @Column({
        type: 'uuid',
        nullable: false,
    })
    customerId!: string;

    @RelationId((paymentAccount: PaymentAccountEntity) => paymentAccount.key)
    @Column({
        type: 'text',
        nullable: false,
    })
    kid!: string;

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
    customer!: CustomerEntity;

    @ManyToOne(() => Key, key => key.kid, { onDelete: 'CASCADE' })
    key!: Key;

	@BeforeInsert()
	setCreatedAt() {
	  this.createdAt = new Date()
	}

	@BeforeUpdate()
	setUpdateAt() {
	  this.updatedAt = new Date()
	}

	constructor(address: string, namespace: string, isDefault: boolean, customerId: string, kid: string) {
        this.address = address;
        this.namespace = namespace;
        this.isDefault = isDefault;
        this.customerId = customerId;
        this.kid = kid;
	}
}
