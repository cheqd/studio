import { MigrationInterface, QueryRunner, Table } from 'typeorm'

export class CreateCustomersTable1683723285946 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.createTable(new Table({
            name: 'customers',
            columns: [
                { name: 'customerId', type: 'varchar', isPrimary: true, generationStrategy: 'uuid' },
                { name: 'account', type: 'text' },
                { name: 'address', type: 'text' },
                { name: 'kids', type: 'text', isArray: true },
                { name: 'dids', type: 'text', isArray: true, isNullable: true },
                { name: 'claimIds', type: 'text', isArray: true },
                { name: 'presentationIds', type: 'text', isArray: true },
            ]
        }), true)
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        throw new Error('illegal_operation: cannot roll back initial migration')
    }
}
