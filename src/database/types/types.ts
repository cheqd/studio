import pkg from 'pg-connection-string';
import { DataSource } from 'typeorm';
import { migrations, Entities } from '@veramo/data-store';

import * as dotenv from 'dotenv';

import { CustomerEntity } from '../entities/customer.entity.js';
import { UserEntity } from '../entities/user.entity.js';
import { RoleEntity } from '../entities/role.entity.js';
import { OperationEntity } from '../entities/operation.entity.js';
import { PaymentEntity } from '../entities/payment.entity.js';
import { PaymentAccountEntity } from '../entities/payment.account.entity.js';

import { CreatePaymentTable1695740345977 } from '../migrations/CreatePaymentTable.js';
import { CreateOperationTable1695740345977 } from '../migrations/CreateOperationTable.js';
import { CreateCustomersTable1683723285946 } from '../migrations/CreateCustomersTable.js';
import { CreateUserTable1695740345977 } from '../migrations/CreateUserTable.js';
import { CreateRoleTable1695740345977 } from '../migrations/CreateRoleTable.js';
import { CreatePaymentAccountTable1695740345977 } from '../migrations/CreatePaymentAccountTable.js';
import { ResourceEntity } from '../entities/resource.entity.js';
import { CreateResourceTable1695740345977 } from '../migrations/CreateResourceTable.js';
import { CreateCustomerTable1695740345977 } from '../migrations/CreateCustomerTable.js';
import { AlterTableClaim1695740345977 } from '../migrations/AlterTableClaim.js';
import { AlterTableIdentifier1695740345977 } from '../migrations/AlterTableIdentifier.js';
import { AlterTableKey1695740345977 } from '../migrations/AlterTableKey.js';
import { KeyEntity } from '../entities/key.entity.js';
import { IdentifierEntity } from '../entities/identifier.entity.js';
import { MigrateData1695740345977 } from '../migrations/MigrateData.js';
import { APIKeyEntity } from '../entities/api.key.entity.js';
import { CreateAPIKeyTable1695740345977 } from '../migrations/CreateApiKeyMigration.js';
import { AlterOperationTable1695740345978 } from '../migrations/AlterOperationTable.js';
import { AlterPaymentTable1695740345979 } from '../migrations/AlterPaymentTable.js';
import { CreateCoinTable1695740345977 } from '../migrations/CreateCoinTable.js';
import { CoinEntity } from '../entities/coin.entity.js';
import { AlterCustomerTable1695740346000 } from '../migrations/AlterCustomerTable.js';
import { AlterOperationTable1695740346001 } from '../migrations/AlterOperationTableNewCategory.js';
import { SubscriptionEntity } from '../entities/subscription.entity.js';
import { CreateSubscritpionTable1695740346003 } from '../migrations/CreateSubscriptionTable.js';
import { AlterAPIKeyTable1695740346004 } from '../migrations/AlterAPIKeyTable.js';
import { AlterCustomerTableAddEmail1695740346005 } from '../migrations/AlterCustomerTableAddEmail.js';
dotenv.config();

const { EXTERNAL_DB_CONNECTION_URL, EXTERNAL_DB_CERT } = process.env;

export interface AbstractDatabase {
	setup(): DataSource;
}

export class Memory implements AbstractDatabase {
	setup(): DataSource {
		return new DataSource({
			type: 'sqlite',
			database: ':memory:',
			entities: [...Entities],
			synchronize: false,
			migrations: [...migrations],
			migrationsRun: true,
			logging: ['error', 'info', 'warn'],
		});
	}
}

export class Postgres implements AbstractDatabase {
	setup(): DataSource {
		const { parse } = pkg;
		const config = parse(EXTERNAL_DB_CONNECTION_URL);
		if (!(config.host && config.port && config.database)) {
			throw new Error(`Error: Invalid Database URL`);
		}

		return new DataSource({
			type: 'postgres',
			host: config.host,
			port: Number(config.port),
			username: config.user,
			password: config.password,
			database: config.database,
			ssl: config.ssl
				? {
						ca: EXTERNAL_DB_CERT,
					}
				: false,
			migrations: [
				...migrations,
				// Old migration
				CreateCustomersTable1683723285946,
				// New ones
				CreateCustomerTable1695740345977,
				CreateRoleTable1695740345977,
				CreateUserTable1695740345977,
				CreateResourceTable1695740345977,
				CreateOperationTable1695740345977,
				CreatePaymentAccountTable1695740345977,
				CreatePaymentTable1695740345977,
				AlterTableClaim1695740345977,
				AlterTableIdentifier1695740345977,
				AlterTableKey1695740345977,
				MigrateData1695740345977,
				CreateAPIKeyTable1695740345977,
				CreateCoinTable1695740345977,
				// Add new categories
				AlterOperationTable1695740345978,
				// Change payment table structure
				AlterPaymentTable1695740345979,
				// Add paymentProviderId to customer table
				AlterCustomerTable1695740346000,
				// Add new category
				AlterOperationTable1695740346001,
				// Add subscription table
				CreateSubscritpionTable1695740346003,
				// Add revoked field to APIKey table
				AlterAPIKeyTable1695740346004,
				// Add email and description fields
				AlterCustomerTableAddEmail1695740346005,
			],
			entities: [
				...Entities,
				CustomerEntity,
				UserEntity,
				RoleEntity,
				OperationEntity,
				PaymentEntity,
				PaymentAccountEntity,
				ResourceEntity,
				KeyEntity,
				IdentifierEntity,
				APIKeyEntity,
				CoinEntity,
				SubscriptionEntity,
			],
			logging: ['error', 'info', 'warn'],
		});
	}
}
