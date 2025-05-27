import { Entity, JoinColumn, ManyToOne } from 'typeorm';

import * as dotenv from 'dotenv';
import { Claim } from '@veramo/data-store';
import { CustomerEntity } from './customer.entity.js';

dotenv.config();

@Entity('claim')
export class ClaimEntity extends Claim {
	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { nullable: true, onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId' })
	customer!: CustomerEntity;

	constructor() {
		super();
	}
}
