import { TableColumn, type MigrationInterface, type QueryRunner } from 'typeorm';
import { SecretBox } from '@veramo/kms-local';
import { createHash } from 'crypto';

export class InsertFingerprintAPIKeyTable1746780465032 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		const tableName = 'apiKey';
		const secretBox = new SecretBox(process.env.EXTERNAL_DB_ENCRYPTION_KEY);

		// Step 1: Add the fingerprint column (non-nullable, no default)
		await queryRunner.addColumn(
			tableName,
			new TableColumn({
				name: 'fingerprint',
				type: 'varchar',
				isNullable: false,
			})
		);

		// Step 2: Add fingerprints for non-revoked keys
		const records: any[] = await queryRunner.query(`SELECT "apiKey", "apiKeyHash" FROM "${tableName}"`);
		for (const record of records) {
			const decryptedKey = await secretBox.decrypt(record.apiKey);
			const fingerprint = createHash('sha256').update(decryptedKey).digest('hex');
			await queryRunner.query(`UPDATE "${tableName}" SET "fingerprint" = $1 WHERE "apiKeyHash" = $2`, [
				fingerprint,
				record.apiKeyHash,
			]);
		}

		// Step 3: Add a unique index on fingerprint
		await queryRunner.query(
			`CREATE UNIQUE INDEX "IDX_apiKey_c5fdf6760b38094e0905ac85e4" ON "${tableName}" ("fingerprint") `
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX "IDX_apiKey_c5fdf6760b38094e0905ac85e4"`);
		await queryRunner.dropColumn('apiKey', 'fingerprint');
	}
}
