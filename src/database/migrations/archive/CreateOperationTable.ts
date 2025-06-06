import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { categoryEnum } from '../../types/enum.js';

export class CreateOperationTable1695740345977 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.createTable(
			new Table({
				name: 'operation',
				columns: [
					{
						name: 'operationId',
						type: 'uuid',
						isPrimary: true,
						isGenerated: true,
						generationStrategy: 'uuid',
					},
					{ name: 'category', type: 'enum', isNullable: false, enum: categoryEnum.toStringList() },
					{ name: 'operationName', type: 'text', isNullable: false },
					{ name: 'defaultFee', type: 'bigint', isNullable: false },
					{ name: 'deprecated', type: 'bool', isNullable: false, default: false },
					{ name: 'createdAt', type: 'timestamptz', isNullable: false },
					{ name: 'updatedAt', type: 'timestamptz', isNullable: true },
				],
			})
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		throw new Error('illegal_operation: cannot roll back initial migration');
	}
}
