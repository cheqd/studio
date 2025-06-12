import { Column, Entity, PrimaryGeneratedColumn, ValueTransformer } from 'typeorm';

import * as dotenv from 'dotenv';
dotenv.config();

const { ENABLE_EXTERNAL_DB } = process.env;

if (!ENABLE_EXTERNAL_DB) throw new Error('ENABLE_EXTERNAL_DB is not set');

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

@Entity('role')
export class RoleEntity {
	@PrimaryGeneratedColumn('uuid')
	roleTypeId!: string;

	@Column({
		type: 'text',
		nullable: false,
	})
	name!: string;

	@Column({
		type: 'text',
		transformer: arrayToJsonTransformer(ENABLE_EXTERNAL_DB),
		array: true,
		default: () => "'{}'",
		nullable: true,
	})
	logToRoleIds?: string[];

	constructor(roleTypeId: string, name: string, logToRoleIds = [] as string[]) {
		this.roleTypeId = roleTypeId;
		this.name = name;
		this.logToRoleIds = logToRoleIds;
	}
}
