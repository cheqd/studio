import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AlterTableClaim1695740345977 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		const table_name = 'claim';
		await queryRunner.addColumn(
			table_name,
			new TableColumn({
				name: 'customerId',
				type: 'uuid',
				isNullable: true,
			})
		);

		await queryRunner.createForeignKey(
			table_name,
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
// this is wrong - table is declared by veramo/data-store and we manually generated this migration
// this is causing a migration drift
