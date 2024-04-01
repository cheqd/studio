import { TableColumn, type MigrationInterface, type QueryRunner } from 'typeorm';

export class AlterAPIKeyTableAddRevoked1695740346004 implements MigrationInterface {
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

		// Remove unused apiKeyId column
		await queryRunner.dropColumn(table_name, 'apiKeyId');
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		throw new Error('illegal_operation: cannot roll back initial migration');
	}
}
