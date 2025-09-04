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
import { ResourceEntity } from '../entities/resource.entity.js';
import { KeyEntity } from '../entities/key.entity.js';
import { APIKeyEntity } from '../entities/api.key.entity.js';
import { IdentifierEntity } from '../entities/identifier.entity.js';
import { CoinEntity } from '../entities/coin.entity.js';
import { SubscriptionEntity } from '../entities/subscription.entity.js';
import { CredentialProviderEntity } from '../entities/credential-provider.entity.js';
import { ProviderConfigurationEntity } from '../entities/provider-configuration.entity.js';

import { CreatePaymentTable1695740345977 } from '../migrations/archive/CreatePaymentTable.js';
import { CreateOperationTable1695740345977 } from '../migrations/archive/CreateOperationTable.js';
import { CreateCustomersTable1683723285946 } from '../migrations/archive/CreateCustomersTable.js';
import { CreateUserTable1695740345977 } from '../migrations/archive/CreateUserTable.js';
import { CreateRoleTable1695740345977 } from '../migrations/archive/CreateRoleTable.js';
import { CreatePaymentAccountTable1695740345977 } from '../migrations/archive/CreatePaymentAccountTable.js';
import { CreateResourceTable1695740345977 } from '../migrations/archive/CreateResourceTable.js';
import { CreateCustomerTable1695740345977 } from '../migrations/archive/CreateCustomerTable.js';
import { AlterTableClaim1695740345977 } from '../migrations/archive/AlterTableClaim.js';
import { AlterTableIdentifier1695740345977 } from '../migrations/archive/AlterTableIdentifier.js';
import { AlterTableKey1695740345977 } from '../migrations/archive/AlterTableKey.js';
import { MigrateData1695740345977 } from '../migrations/archive/MigrateData.js';
import { CreateAPIKeyTable1695740345977 } from '../migrations/archive/CreateApiKeyMigration.js';
import { AlterOperationTable1695740345978 } from '../migrations/archive/AlterOperationTable.js';
import { AlterPaymentTable1695740345979 } from '../migrations/archive/AlterPaymentTable.js';
import { CreateCoinTable1695740345977 } from '../migrations/archive/CreateCoinTable.js';
import { AlterOperationTableAddCustomer1695740345990 } from '../migrations/archive/AlterOperationTableAddCustomer.js';
import { AlterCustomerTable1695740346000 } from '../migrations/archive/AlterCustomerTable.js';
import { AlterOperationTable1695740346001 } from '../migrations/archive/AlterOperationTableNewCategory.js';
import { CreateSubscritpionTable1695740346003 } from '../migrations/archive/CreateSubscriptionTable.js';
import { AlterAPIKeyTable1695740346004 } from '../migrations/archive/AlterAPIKeyTable.js';
import { AlterCustomerTableAddEmail1695740346005 } from '../migrations/archive/AlterCustomerTableAddEmail.js';
import { AlterCustomerTableUpdateEmail1695740346006 } from '../migrations/archive/AlterCustomerTableUniqueEmail.js';
import { IndexPaymentAccountTable1746513196390 } from '../migrations/archive/IndexPaymentAccountTable.js';
import { InsertFingerprintAPIKeyTable1746780465032 } from '../migrations/archive/InsertFingerprintApiKeyTable.js';
import { Cleanup1748331341024 } from '../migrations/custom/1748331341024-Cleanup.js';
import { StudioMigrations1750427001486 } from '../migrations/1750427001486-studio-migrations.js';
import { StudioMigrations1756996499358 } from '../migrations/1756996499358-studio-migrations.js';
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
				// Add Customer relation to Operation table
				AlterOperationTableAddCustomer1695740345990,
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
				// Add unique constraint to email field
				AlterCustomerTableUpdateEmail1695740346006,
				// Add unique index in PaymentAccount table
				IndexPaymentAccountTable1746513196390,
				// Add fingerprint in APIKey table
				InsertFingerprintAPIKeyTable1746780465032,
				// Add custom migrations
				Cleanup1748331341024,
				StudioMigrations1750427001486,
				StudioMigrations1756996499358,
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
				CredentialProviderEntity,
				ProviderConfigurationEntity,
			],
			logging: ['error', 'info', 'warn'],
		});
	}
}
