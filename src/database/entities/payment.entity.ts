import { Column, Entity, ManyToOne, RelationId } from 'typeorm';

import * as dotenv from 'dotenv';
import { CustomerEntity } from './customer.entity.js';
import { Identifier } from '@veramo/data-store';
import { directionEnum } from './../types/enum.js';
import { ResourceEntity } from './resource.entity.js';
import { OperationEntity } from './operation.entity.js';
import { PaymentAccountEntity } from './payment.account.entity.js';
dotenv.config();

@Entity('payment')
export class PaymentEntity {
	@Column({
        type: 'text',
        nullable: false,
        primary: true,
    })
	txHash!: string;

    @RelationId((payment: PaymentEntity) => payment.customer)
    @Column({
        type: 'uuid',
        nullable: false,
    })
    customerId!: string;

    @RelationId((payment: PaymentEntity) => payment.operation)
    @Column({
        type: 'uuid',
        nullable: false,
    })
    operationId!: string;

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

    @RelationId((payment: PaymentEntity) => payment.identifier)
    @Column({
        type: 'text',
        nullable: false,
    })
    identifierDid!: string;

    @RelationId((payment: PaymentEntity) => payment.resource)
    @Column({
        type: 'uuid',
        nullable: false,
    })
    resourceId!: string;

    @RelationId((payment: PaymentEntity) => payment.paymentAccount)
    @Column({
        type: 'text',
        nullable: false,
    })
    paymentAddress!: string;


    @ManyToOne(() => CustomerEntity, customer => customer.customerId, { onDelete: 'CASCADE' })
    customer!: CustomerEntity;

    @ManyToOne(() => ResourceEntity, resource => resource.resourceId, { onDelete: 'CASCADE' })
    resource!: ResourceEntity;

    @ManyToOne(() => Identifier, identifier => identifier.did, { onDelete: 'CASCADE' })
    identifier!: Identifier;

    @ManyToOne(() => OperationEntity, operation => operation.operationId, { onDelete: 'CASCADE' })
    operation!: OperationEntity;

    @ManyToOne(() => PaymentAccountEntity, paymentAccount => paymentAccount.address, { onDelete: 'CASCADE' })
    paymentAccount!: PaymentAccountEntity;

	constructor(txHash: string, customerId: string, operationId: string, direction: string, fee: number, timestamp: Date, identifierDid: string, resourceId: string, paymentAddress: string) {
        this.txHash = txHash;
        this.customerId = customerId;
        this.operationId = operationId;
        this.direction = direction;
        this.fee = fee;
        this.timestamp = timestamp;
        this.identifierDid = identifierDid;
        this.resourceId = resourceId;
        this.paymentAddress = paymentAddress;
	}
}
