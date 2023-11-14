import { MigrationInterface, QueryRunner, Table, TableForeignKey } from 'typeorm';

export class CreateAPIKeyTable1695740345977 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		
        const table =  new Table({
            name: 'apiKey',
            columns: [
                {
                    name: 'apiKeyId',
                    type: 'uuid',
                    isPrimary: true,
                    isGenerated: true,
                    generationStrategy: 'uuid',
                },
                { name: 'apiKey', type: 'text', isNullable: false },
                { name: 'customerId', type: 'uuid', isNullable: false },
                { name: 'userId', type: 'text', isNullable: false },
                { name: 'expiresAt', type: 'timestamptz', isNullable: false },
                { name: 'createdAt', type: 'timestamptz', isNullable: false },
                { name: 'updatedAt', type: 'timestamptz', isNullable: true },
            ],
        })

		await queryRunner.createTable(table);
        
        await queryRunner.createForeignKey(
			table,
			new TableForeignKey({
				columnNames: ['customerId'],
				referencedColumnNames: ['customerId'],
				referencedTableName: 'customer',
				onDelete: 'CASCADE',
			})
		);

        await queryRunner.createForeignKey(
			table,
			new TableForeignKey({
				columnNames: ['userId'],
				referencedColumnNames: ['logToId'],
				referencedTableName: 'user',
				onDelete: 'CASCADE',
			})
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		throw new Error('illegal_operation: cannot roll back initial migration');
	}
}
