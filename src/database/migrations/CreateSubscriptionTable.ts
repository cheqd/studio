import { MigrationInterface, QueryRunner, Table, TableForeignKey } from "typeorm";


export class CreateSubscritpionTable1695740346003 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
		const table = new Table({
			name: 'subscription',
			columns: [
				{ name: 'subscriptionId', type: 'text', isNullable: false, isPrimary: true },
                { name: 'customerId', type: 'uuid', isNullable: false },
                { name: 'status', type: 'text', isNullable: false },
                { name: 'trialStart', type: 'timestamptz', isNullable: true },
                { name: 'trialEnd', type: 'timestamptz', isNullable: true },
                { name: 'currentPeriodStart', type: 'timestamptz', isNullable: false },
                { name: 'currentPeriodEnd', type: 'timestamptz', isNullable: false },
                { name: 'createdAt', type: 'timestamptz', isNullable: false },
                { name: 'updatedAt', type: 'timestamptz', isNullable: true },
            ],
		});
		await queryRunner.createTable(table, true);

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