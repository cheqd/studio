import { Column, Entity, ManyToOne, RelationId } from 'typeorm';

import * as dotenv from 'dotenv';
import { Identifier } from '@veramo/data-store';

dotenv.config();

@Entity('identifier')
export class IdentifierEntity extends Identifier {

    @RelationId((key: IdentifierEntity) => key.customer)
    @Column({
        type: 'uuid',
        nullable: false,
    })
    customerId!: string;

    @ManyToOne(() => IdentifierEntity, customer => customer.customerId, { onDelete: 'CASCADE' })
    customer!: IdentifierEntity;
	
	constructor() {
		super();
	}
}
