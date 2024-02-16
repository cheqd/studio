import { TableColumn, type MigrationInterface, type QueryRunner } from 'typeorm';
import { namespaceEnum } from '../types/enum.js';

export class AlterPaymentTable1695740345979 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		const table_name = 'payment';

		// Drop unused columns
		await queryRunner.dropColumn(table_name, 'direction');
		await queryRunner.dropColumn(table_name, 'identifierDid');

		// Add new columns
		await queryRunner.addColumn(
			table_name,
			new TableColumn({
				name: 'amount',
				type: 'bigint',
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
		// // Add new categories
		// await queryRunner.query("alter type operation_category_enum add value 'presentation';");
		// await queryRunner.query("alter type operation_category_enum add value 'key';");
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		throw new Error('illegal_operation: cannot roll back initial migration');
	}
}
