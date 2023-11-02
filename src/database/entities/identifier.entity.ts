import { Entity, JoinColumn, ManyToOne } from 'typeorm';

import * as dotenv from 'dotenv';
import { Identifier } from '@veramo/data-store';
import { CustomerEntity } from './customer.entity.js';

dotenv.config();

@Entity('identifier')
export class IdentifierEntity extends Identifier {
	@ManyToOne(() => CustomerEntity, (customer) => customer.customerId, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'customerId' })
	customer!: CustomerEntity;

	constructor() {
		super();
	}
}
