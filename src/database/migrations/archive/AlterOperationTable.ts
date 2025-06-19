import { Table, TableColumn, TableForeignKey, type MigrationInterface, type QueryRunner } from 'typeorm';
import { categoryEnum } from '../../types/enum.js';

export class AlterOperationTable1695740345978 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		const table_name = 'operation';
		const table = (await queryRunner.getTable(table_name)) as Table;
		// Drop unused columns
		await queryRunner.dropColumn(table_name, 'defaultFee');
		// Updated category column because of the new enum values
		await queryRunner.changeColumn(
			table_name,
			'category',
			new TableColumn({
				name: 'category',
				type: 'enum',
				isNullable: false,
				enum: categoryEnum.toStringList(),
			})
		);

		await queryRunner.addColumn(
			table_name,
			new TableColumn({
				name: 'successful',
				type: 'boolean',
				isNullable: false,
				default: true,
			})
		);

		await queryRunner.addColumn(
			table_name,
			new TableColumn({
				name: 'defaultFee',
				type: 'uuid',
				isNullable: true,
			})
		);

		await queryRunner.createForeignKey(
			table as Table,
			new TableForeignKey({
				columnNames: ['defaultFee'],
				referencedColumnNames: ['coinId'],
				referencedTableName: 'coin',
				onDelete: 'CASCADE',
			})
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		throw new Error('illegal_operation: cannot roll back initial migration');
	}
}
