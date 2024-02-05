import { TableColumn, type MigrationInterface, type QueryRunner } from "typeorm";
import { categoryEnum } from "../types/enum.js";

export class AlterOperationTable1695740345978 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
        const table_name = 'operation';
		// Updated category column because of the new enum values
		await queryRunner.changeColumn(
			table_name,
			'category',
			new TableColumn({
				name: 'category',
				type: 'enum',
				isNullable: false,
				enum: categoryEnum.toStringList()
			})
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		throw new Error('illegal_operation: cannot roll back initial migration');
	}
}