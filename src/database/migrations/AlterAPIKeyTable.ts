import { TableColumn, type MigrationInterface, type QueryRunner } from 'typeorm';

export class AlterAPIKeyTable1695740346004 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		const table_name = 'apiKey';

		await queryRunner.addColumn(
			table_name,
			new TableColumn({
				name: 'revoked',
				type: 'boolean',
				isNullable: true,
			})
		);

		await queryRunner.addColumn(
			table_name,
			new TableColumn({
				name: 'name',
				type: 'text',
				isNullable: false,
			})
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		throw new Error('illegal_operation: cannot roll back initial migration');
	}
}
