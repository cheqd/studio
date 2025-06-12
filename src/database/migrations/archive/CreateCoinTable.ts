import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateCoinTable1695740345977 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		const table = new Table({
			name: 'coin',
			columns: [
				{ name: 'coinId', type: 'uuid', isNullable: false, isPrimary: true },
				{ name: 'denom', type: 'text', isNullable: false },
				{ name: 'amount', type: 'bigint', isNullable: false },
				{ name: 'createdAt', type: 'timestamptz', isNullable: false },
				{ name: 'updatedAt', type: 'timestamptz', isNullable: true },
			],
		});
		await queryRunner.createTable(table, true);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		throw new Error('illegal_operation: cannot roll back initial migration');
	}
}
