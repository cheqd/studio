import { TableColumn, type MigrationInterface, type QueryRunner } from 'typeorm';
import bcrypt from 'bcrypt';
import { SecretBox } from '@veramo/kms-local';

export class AlterAPIKeyTable1695740346004 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		const table_name = 'apiKey';
		const secretBox = new SecretBox(process.env.EXTERNAL_DB_ENCRYPTION_KEY);

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
				isNullable: true,
			})
		);

		await queryRunner.addColumn(
			table_name,
			new TableColumn({
				name: 'apiKeyHash',
				type: 'varchar',
				isNullable: true,
				isUnique: true,
			})
		);

		for (const record of await queryRunner.query(`SELECT * FROM "${table_name}"`)) {
			const hash = await bcrypt.hash(record.apiKey, 12);
			const encryptedHash = await secretBox.encrypt(record.apiKey);
			// All the previous idToken should be unique
			const name = 'idToken';
			await queryRunner.query(
				`UPDATE "${table_name}" SET "apiKeyHash" = '${hash}', "apiKey" = '${encryptedHash}', "name" = '${name}' WHERE "apiKeyId" = '${record.apiKeyId}'`
			);
		}

		// Drop old id field
		await queryRunner.dropColumn(table_name, 'apiKeyId');

		// setup apiKeyHash column as primary
		await queryRunner.changeColumn(
			table_name,
			'apiKeyHash',
			new TableColumn({
				name: 'apiKeyHash',
				type: 'varchar',
				isNullable: false,
				isPrimary: true,
				isUnique: true,
			})
		);
		await queryRunner.changeColumn(
			table_name,
			'name',
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
