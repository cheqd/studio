import { MigrationInterface, QueryRunner } from 'typeorm';

export class StudioMigrations1766408271347 implements MigrationInterface {
	name = 'StudioMigrations1766408271347';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "issuedCredential" ADD "subjectAcceptedAt" TIMESTAMP WITH TIME ZONE`);
		await queryRunner.query(`ALTER TABLE "issuedCredential" ADD "offerExpiresAt" TIMESTAMP WITH TIME ZONE`);
		await queryRunner.query(`ALTER TABLE "issuedCredential" ADD "veramoHash" character varying`);
		await queryRunner.query(
			`ALTER TABLE "issuedCredential" ADD CONSTRAINT "FK_b3c46dba2595859c99916743970" FOREIGN KEY ("veramoHash") REFERENCES "credential"("hash") ON DELETE SET NULL ON UPDATE NO ACTION`
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "issuedCredential" DROP CONSTRAINT "FK_b3c46dba2595859c99916743970"`);
		await queryRunner.query(`ALTER TABLE "issuedCredential" DROP COLUMN "veramoHash"`);
		await queryRunner.query(`ALTER TABLE "issuedCredential" DROP COLUMN "offerExpiresAt"`);
		await queryRunner.query(`ALTER TABLE "issuedCredential" DROP COLUMN "subjectAcceptedAt"`);
	}
}
