import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateRoleTable1695740345977 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		const table = new Table({
			name: 'role',
			columns: [
				{
					name: 'roleTypeId',
					type: 'uuid',
					isNullable: false,
					isPrimary: true,
					isGenerated: true,
					generationStrategy: 'uuid',
				},
				{ name: 'name', type: 'text', isNullable: false },
				{ name: 'logToRoleIds', type: 'text', isNullable: true, isArray: true, default: 'ARRAY[]::text[]' },
			],
		});
		await queryRunner.createTable(table, true);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		throw new Error('illegal_operation: cannot roll back initial migration');
	}
}
