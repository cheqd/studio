import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import * as dotenv from 'dotenv';
import { CustomerEntity } from './customer.entity.js';
import { Identifier } from '@veramo/data-store';
import { directionEnum } from './../types/enum.js';
import { ResourceEntity } from './resource.entity.js';
import { OperationEntity } from './operation.entity.js';
import { PaymentAccountEntity } from './payment.account.entity.js';
import type { IdentifierEntity } from './identifier.entity.js';
dotenv.config();

@Entity('payment')
export class PaymentEntity {
	@Column({
        type: 'text',
        nullable: false,
        primary: true,
    })
	txHash!: string;

    @Column({
        type: 'enum',
        enum: directionEnum,
        nullable: false
    })
    direction!: string;

    @Column({
        type: 'bigint',
        nullable: false,
    })
    fee!: number;

    @Column({
        type: 'date',
        nullable: false,
    })
    timestamp!: Date;


    @ManyToOne(() => CustomerEntity, customer => customer.customerId, { onDelete: 'CASCADE' })
    @JoinColumn({name: "customerId"})
    customer!: CustomerEntity;

    @ManyToOne(() => ResourceEntity, resource => resource.resourceId, { onDelete: 'CASCADE' })
    @JoinColumn({name: "resourceId"})
    resource!: ResourceEntity;

    @ManyToOne(() => Identifier, identifier => identifier.did, { onDelete: 'CASCADE' })
    @JoinColumn({name: "identifierDid"})
    identifier!: Identifier;

    @ManyToOne(() => OperationEntity, operation => operation.operationId, { onDelete: 'CASCADE' })
    @JoinColumn({name: "operationId"})
    operation!: OperationEntity;

    @ManyToOne(() => PaymentAccountEntity, paymentAccount => paymentAccount.address, { onDelete: 'CASCADE' })
    @JoinColumn({name: "paymentAddress"})
    paymentAccount!: PaymentAccountEntity;

	constructor(
        txHash: string, 
        customer: CustomerEntity, 
        operation: OperationEntity, 
        direction: string, 
        fee: number, 
        timestamp: Date, 
        identifierDid: IdentifierEntity, 
        resource: ResourceEntity, 
        paymentAddress: PaymentAccountEntity) {
        this.txHash = txHash;
        this.customer = customer;
        this.operation = operation;
        this.direction = direction;
        this.fee = fee;
        this.timestamp = timestamp;
        this.identifier = identifierDid;
        this.resource = resource;
        this.paymentAccount = paymentAddress;
	}
}
