import { BeforeInsert, BeforeUpdate, Column, Entity, JoinColumn, ManyToOne, RelationId } from 'typeorm';

import * as dotenv from 'dotenv';
import { CustomerEntity } from './customer.entity.js';
import { RoleEntity } from './role.entity.js';
dotenv.config();

@Entity('user')
export class UserEntity {
	@Column({
        type: 'text',
        nullable: false,
        primary: true,
    })
	logToId!: string;

    @ManyToOne(() => CustomerEntity, customer => customer.customerId, { onDelete: 'CASCADE' })
	@JoinColumn({name: "customerId"})
    customer!: CustomerEntity;

	@RelationId((user: UserEntity) => user.role)
    @Column({
        type: 'uuid',
        nullable: false,
    })
	roleTypeId!: string;

    @ManyToOne(() => RoleEntity, role => role.roleTypeId, { onDelete: 'CASCADE' })
    role!: RoleEntity;

	@Column({
		type: 'timestamptz',
		nullable: false,
	})
	createdAt!: Date;

	@Column({
		type: 'timestamptz',
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

	constructor(logToId: string, customer: CustomerEntity) {
		this.logToId = logToId;
		this.customer = customer;
	}
}
