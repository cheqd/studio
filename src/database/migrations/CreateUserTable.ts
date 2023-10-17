import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateUserTable1695740345977 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
        const table = new Table({
            name: 'user',
            columns: [
                {name: "logToId", type: "text", "isNullable": false, isPrimary: true},
                {name: "customerId", type: "uuid", "isNullable": false},
                {name: "roleTypeId", type: "uuid", "isNullable": false},
                {name: "createdAt", type: "timestamptz", "isNullable": false},
                {name: "updatedAt", type: "timestamptz", "isNullable": true},
            ],
        });
		await queryRunner.createTable(
			table,
			true
		);

        await queryRunner.createForeignKey(
            table,
            new TableForeignKey({
                columnNames: ["roleTypeId"],
                referencedColumnNames: ["roleTypeId"],
                referencedTableName: "role",
                onDelete: "CASCADE",
            }),
        )

        await queryRunner.createForeignKey(
            table,
            new TableForeignKey({
                columnNames: ["customerId"],
                referencedColumnNames: ["customerId"],
                referencedTableName: "customer",
                onDelete: "CASCADE",
            }),
        )
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		throw new Error('illegal_operation: cannot roll back initial migration');
	}
}
