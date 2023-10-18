import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';
import { directionEnum } from '../types/enum.js';

export class CreatePaymentTable1695740345977 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
        const table = new Table({
            name: 'payment',
            columns: [
                {name: "txHash", type: "text", "isNullable": false, isPrimary: true},
                {name: "customerId", type: "uuid", "isNullable": false},
                {name: "operationId", type: "uuid", "isNullable": false},
                {name: "direction", type: "enum", enum: directionEnum.toStringList(), "isNullable": false},
                {name: "fee", type: "bigint", "isNullable": false},
                {name: "timestamp", type: "timestamptz", "isNullable": false},
                {name: "identifierDid", type: "text", "isNullable": false},
                {name: "resourceId", type: "uuid", "isNullable": false},
                {name: "paymentAddress", type: "text", "isNullable": false},
                {name: "createdAt", type: "timestamptz", "isNullable": false},
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
                columnNames: ["identifierDid"],
                referencedColumnNames: ["did"],
                referencedTableName: "identifier",
                onDelete: "CASCADE",
            }),
        )

        await queryRunner.createForeignKey(
            table,
            new TableForeignKey({
                columnNames: ["paymentAddress"],
                referencedColumnNames: ["address"],
                referencedTableName: "paymentAccount",
                onDelete: "CASCADE",
            }),
        )

        await queryRunner.createForeignKey(
            table,
            new TableForeignKey({
                columnNames: ["resourceId"],
                referencedColumnNames: ["resourceId"],
                referencedTableName: "resource",
                onDelete: "CASCADE",
            }),
        )

        await queryRunner.createForeignKey(
            table,
            new TableForeignKey({
                columnNames: ["operationId"],
                referencedColumnNames: ["operationId"],
                referencedTableName: "operation",
                onDelete: "CASCADE",
            }),
        )
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		throw new Error('illegal_operation: cannot roll back initial migration');
	}
}
