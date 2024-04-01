import { TableColumn, type MigrationInterface, type QueryRunner } from 'typeorm';
import pkg from 'js-sha3';
const { sha3_512 } = pkg;

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

		// Remove unused apiKeyId column
		await queryRunner.dropColumn(table_name, 'apiKeyId');
		// Add column apiKeyHash
		await queryRunner.addColumn(
			table_name,
			new TableColumn({
				name: 'apiKeyHash',
				type: 'text',
				isNullable: true,
			})
		);
		// Data migration
		// Make all current API keys as revoked cause we need to force API key recreation
		for (const apiKey of await queryRunner.query(`SELECT * FROM "${table_name}"`)) {
			await queryRunner.query(
				`UPDATE "${table_name}" SET "apiKeyHash" = '${sha3_512(apiKey.apiKey)}', "revoked" = 'true' WHERE "apiKey" = '${apiKey.apiKey}'`
			);
		}
		// Make apiKeyHash not nullable
		await queryRunner.changeColumn(
			table_name,
			'apiKeyHash',
			new TableColumn({
				name: 'apiKeyHash',
				type: 'text',
				isNullable: false,
				isPrimary: true,
			})
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		throw new Error('illegal_operation: cannot roll back initial migration');
	}
}
