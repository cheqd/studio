import { Column, Entity, PrimaryGeneratedColumn, ValueTransformer } from 'typeorm';

import * as dotenv from 'dotenv';
dotenv.config();

const { ENABLE_EXTERNAL_DB } = process.env;

const arrayToJsonTransformer = (shouldTransform: string): ValueTransformer => {
	return {
		to: (array: any[]) => {
			if (shouldTransform == 'false') {
				// Convert the array to a JSON string
				return JSON.stringify(array);
			}
			return array;
		},
		from: (jsonString: string) => {
			if (shouldTransform == 'false') {
				// Parse the JSON string and return the array
				return JSON.parse(jsonString);
			}
			return jsonString;
		},
	};
};

@Entity('customers')
export class CustomerEntity {
	@PrimaryGeneratedColumn('uuid')
	customerId!: string;

	@Column('text')
	account!: string;

	@Column('text')
	address!: string;

	@Column({
		type: 'text',
		transformer: arrayToJsonTransformer(ENABLE_EXTERNAL_DB),
		array: true,
		nullable: true,
	})
	kids!: string[];

	@Column({
		type: 'text',
		transformer: arrayToJsonTransformer(ENABLE_EXTERNAL_DB),
		array: true,
		nullable: true,
	})
	dids!: string[];

	@Column({
		type: 'text',
		transformer: arrayToJsonTransformer(ENABLE_EXTERNAL_DB),
		array: true,
		nullable: true,
	})
	claimIds!: string[];

	@Column({
		type: 'text',
		transformer: arrayToJsonTransformer(ENABLE_EXTERNAL_DB),
		array: true,
		nullable: true,
	})
	presentationIds!: string[];

	constructor(customerId: string, account: string, address: string) {
		this.customerId = customerId;
		this.account = account;
		this.address = address;
	}
}
