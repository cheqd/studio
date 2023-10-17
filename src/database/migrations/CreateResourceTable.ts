import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateResourceTable1695740345977 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
        const table = new Table({
            name: 'resource',
            columns: [
                {name: "resourceId", type: "uuid", "isNullable": false, isPrimary: true},
                {name: "identifierDid", type: "text", "isNullable": false},
                {name: "kid", type: "text", "isNullable": false},
                {name: "resourceName", type: "text", "isNullable": false},
                {name: "resourceType", type: "text", "isNullable": true},
                {name: "mediaType", type: "text", "isNullable": false},
                {name: "previousVersionId", type: "text", "isNullable": false},
                {name: "nextVersionId", type: "text", "isNullable": false},
                {name: "customerId", type: "uuid", "isNullable": false},
                {name: "encrypted", type: "bool", "isNullable": false, default: false},
                {name: "symmetricKey", type: "text", "isNullable": true},

                {name: "createdAt", type: "timestamptz", "isNullable": false},
                {name: "updatedAt", type: "timestamptz", "isNullable": false},


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

        await queryRunner.createForeignKey(
            table,
            new TableForeignKey({
                columnNames: ["identifierDid"],
                referencedColumnNames: ["did"],
                referencedTableName: "identifier",
                onDelete: "CASCADE",
            }),
        )
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		throw new Error('illegal_operation: cannot roll back initial migration');
	}
}
