import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';
import { namespaceEnum } from '../types/enum.js';

export class CreatePaymentAccountTable1695740345977 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
        const table = new Table({
            name: 'paymentAccount',
            columns: [
                {name: "address", type: "text", "isNullable": false, isPrimary: true},
                {name: "namespace", type: "enum", "isNullable": false, enum: namespaceEnum.toStringList()},
                {name: "isDefault", type: "bool", "isNullable": false, default: false},
                {name: "customerId", type: "uuid", "isNullable": false},
                {name: "kid", type: "text", "isNullable": false},
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
                columnNames: ["customerId"],
                referencedColumnNames: ["customerId"],
                referencedTableName: "customer",
                onDelete: "CASCADE",
            }),
        )

        await queryRunner.createForeignKey(
            table,
            new TableForeignKey({
                columnNames: ["kid"],
                referencedColumnNames: ["kid"],
                referencedTableName: "key",
                onDelete: "CASCADE",
            }),
        )
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		throw new Error('illegal_operation: cannot roll back initial migration');
	}
}
