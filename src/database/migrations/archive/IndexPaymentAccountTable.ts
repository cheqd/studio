import { MigrationInterface, QueryRunner } from 'typeorm';

export class IndexPaymentAccountTable1746513196390 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`CREATE UNIQUE INDEX "IDX_e252516d4b5a966d291ee0ab61" ON "paymentAccount" ("customerId", "namespace") `
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX "public"."IDX_e252516d4b5a966d291ee0ab61"`);
	}
}
