import { Table, TableColumn, TableForeignKey, type MigrationInterface, type QueryRunner } from 'typeorm';

export class AlterOperationTableAddCustomer1695740345990 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		const table_name = 'operation';
		const table = (await queryRunner.getTable(table_name)) as Table;

		await queryRunner.addColumn(
			table_name,
			new TableColumn({
				name: 'customerId',
				type: 'uuid',
				isNullable: true,
			})
		);

		await queryRunner.createForeignKey(
			table,
			new TableForeignKey({
				columnNames: ['customerId'],
				referencedColumnNames: ['customerId'],
				referencedTableName: 'customer',
				onDelete: 'CASCADE',
			})
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		throw new Error('illegal_operation: cannot roll back initial migration');
	}
}
