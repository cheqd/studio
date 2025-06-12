import { MigrationInterface, QueryRunner, TableColumn, TableUnique } from 'typeorm';

export class AlterCustomerTableUpdateEmail1695740346006 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		const tableName = 'customer';

		// Make the email column NOT NULL
		await queryRunner.changeColumn(
			tableName,
			'email',
			new TableColumn({
				name: 'email',
				type: 'text',
				isNullable: false, // Set the column as NOT NULL
			})
		);

		// Add a unique constraint to the email column
		await queryRunner.createUniqueConstraint(
			tableName,
			new TableUnique({
				name: 'UQ_customer_email',
				columnNames: ['email'],
			})
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		const tableName = 'customer';

		// Remove the unique constraint
		await queryRunner.dropUniqueConstraint(tableName, 'UQ_customer_email');

		// Revert the email column back to nullable
		await queryRunner.changeColumn(
			tableName,
			'email',
			new TableColumn({
				name: 'email',
				type: 'text',
				isNullable: true, // Revert to nullable
			})
		);
	}
}
