import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateAPIKeyTable1695740345977 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.createTable(
			new Table({
				name: 'apiKey',
				columns: [
					{
						name: 'apiKeyId',
                        type: 'uuid',
                        isPrimary: true,
                        isGenerated: true,
                        generationStrategy: 'uuid',
					},
					{ name: 'apiKey', type: 'text', isNullable: false },
                    { name: 'customerId', type: 'uuid', isNullable: false },
                    { name: 'userId', type: 'uuid', isNullable: false },
                    { name: 'expiresAt', type: 'timestamptz', isNullable: false },
                    { name: 'createdAt', type: 'timestamptz', isNullable: false },
                    { name: 'updatedAt', type: 'timestamptz', isNullable: true },
				],
			})
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		throw new Error('illegal_operation: cannot roll back initial migration');
	}
}
