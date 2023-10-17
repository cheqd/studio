import { MigrationInterface, QueryRunner, TableColumn, TableForeignKey } from 'typeorm';

export class AlterTableKey1695740345977 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		const table_name = 'key';
        await queryRunner.addColumn(
            table_name,
            new TableColumn({
                name: 'customerId',
                type: 'uuid',
                "isNullable": true,
            })
        );

        await queryRunner.addColumn(
            table_name,
            new TableColumn({
                name: 'createdAt',
                type: 'timestamptz',
                "isNullable": true,
            })
        );

        await queryRunner.addColumn(
            table_name,
            new TableColumn({
                name: 'updatedAt',
                type: 'timestamptz',
                "isNullable": true,
            })
        );

        await queryRunner.addColumn(
            table_name,
            new TableColumn({
                name: 'publicKeyAlias',
                type: 'text',
                "isNullable": true,
            })
        );

        await queryRunner.createForeignKey(
            table_name,
            new TableForeignKey({
                columnNames: ["customerId"],
                referencedColumnNames: ["customerId"],
                referencedTableName: "customer",
                onDelete: "CASCADE",
            })
        );
        
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		throw new Error('illegal_operation: cannot roll back initial migration');
	}
}
