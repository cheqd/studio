import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateCustomerTable1695740345977 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.createTable(
			new Table({
				name: 'customer',
				columns: [
					{
						name: 'customerId',
						type: 'uuid',
						isPrimary: true,
						generationStrategy: 'uuid',
						isGenerated: true,
					},
					{ name: 'name', type: 'text', isNullable: false },
					{ name: 'createdAt', type: 'timestamptz', isNullable: false },
					{ name: 'updatedAt', type: 'timestamptz', isNullable: true },
				],
			}),
			true
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		throw new Error('illegal_operation: cannot roll back initial migration');
	}
}
