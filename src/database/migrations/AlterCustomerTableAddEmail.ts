import { TableColumn, type MigrationInterface, type QueryRunner } from 'typeorm';

export class AlterCustomerTableAddEmail1695740346005 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		const table_name = 'customer';

		await queryRunner.addColumn(
			table_name,
			new TableColumn({
				name: 'email',
				type: 'text',
				isNullable: true,
			})
		);

		await queryRunner.addColumn(
			table_name,
			new TableColumn({
				name: 'description',
				type: 'text',
				isNullable: true,
			})
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		throw new Error('illegal_operation: cannot roll back initial migration');
	}
}
