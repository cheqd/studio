import { Table, TableColumn, TableForeignKey, type MigrationInterface, type QueryRunner } from 'typeorm';
import { namespaceEnum } from '../../types/enum.js';

export class AlterPaymentTable1695740345979 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		const table_name = 'payment';
		const table = (await queryRunner.getTable(table_name)) as Table;

		// Drop unused columns
		await queryRunner.dropColumn(table_name, 'direction');
		await queryRunner.dropColumn(table_name, 'identifierDid');
		await queryRunner.dropColumn(table_name, 'fee');

		// Add new columns
		await queryRunner.addColumn(
			table_name,
			new TableColumn({
				name: 'amount',
				type: 'uuid',
				isNullable: false,
			})
		);

		await queryRunner.addColumn(
			table_name,
			new TableColumn({
				name: 'fee',
				type: 'uuid',
				isNullable: false,
			})
		);

		await queryRunner.addColumn(
			table_name,
			new TableColumn({
				name: 'successful',
				type: 'boolean',
				isNullable: false,
			})
		);

		await queryRunner.addColumn(
			table_name,
			new TableColumn({
				name: 'namespace',
				type: 'text',
				isNullable: false,
				enum: namespaceEnum.toStringList(),
			})
		);

		await queryRunner.changeColumn(
			table_name,
			'paymentAddress',
			new TableColumn({
				name: 'fromAccount',
				type: 'text',
				isNullable: false,
			})
		);

		await queryRunner.addColumn(
			table_name,
			new TableColumn({
				name: 'toAccount',
				type: 'text',
				isNullable: false,
			})
		);
		// Add foreign keys
		await queryRunner.createForeignKey(
			table,
			new TableForeignKey({
				columnNames: ['fee'],
				referencedColumnNames: ['coinId'],
				referencedTableName: 'coin',
				onDelete: 'CASCADE',
			})
		);

		await queryRunner.createForeignKey(
			table,
			new TableForeignKey({
				columnNames: ['amount'],
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
