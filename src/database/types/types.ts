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
import { IssuedCredentialEntity } from '../entities/issued-credential.entity.js';
import { StatusRegistryEntity } from '../entities/status-registry.entity.js';
import { FaucetRequestEntity } from '../entities/faucet-request.entity.js';
import { DeletedAccountRecordEntity } from '../entities/deleted-account-record.entity.js';
import { FeatureFlagEntity } from '../entities/feature-flag.entity.js';
import { AgentEntity } from '../entities/agent.entity.js';
import { AgentCardEntity } from '../entities/agent-card.entity.js';
import { AgentEventEntity } from '../entities/agent-event.entity.js';
import { AuthorityGrantEntity } from '../entities/authority-grant.entity.js';
import { PaymentAddressBindingEntity } from '../entities/payment-address-binding.entity.js';
import { IdempotencyKeyEntity } from '../entities/idempotency-key.entity.js';
import { AdminAuditLogEntity } from '../entities/admin-audit-log.entity.js';
import { EngineDiffEntity } from '../entities/engine-diff.entity.js';
import { EngineMigrationEntity } from '../entities/engine-migration.entity.js';
import { CustomerActivationEntity } from '../entities/customer-activation.entity.js';

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
import { StudioMigrations1758011998054 } from '../migrations/1758011998054-studio-migrations.js';
import { StudioMigrations1760533089289 } from '../migrations/1760533089289-studio-migrations.js';
import { MigrateStudioCredentials1760533089389 } from '../migrations/1760533089389-MigrateStudioCredentials.js';
import { MigrateDockCredentials1760533089589 } from '../migrations/1760533089589-MigrateDockCredentials.js';
import { StudioMigrations1761834657128 } from '../migrations/1761834657128-studio-migrations.js';
import { MigrationsStatusLists1762775396083 } from '../migrations/1762775396083-MigrateStatusLists.js';
import { UpdateWriteCursors1762775500000 } from '../migrations/1762775500000-UpdateWriteCursors.js';
import { StudioMigrations1766408271347 } from '../migrations/1766408271347-studio-migrations.js';
import { StudioMigrations1791500000000 } from '../migrations/1791500000000-studio-migrations.js';
import { StudioMigrations1791500000001 } from '../migrations/1791500000001-studio-migrations.js';
import { StudioMigrations1791500000002 } from '../migrations/1791500000002-studio-migrations.js';
import { StudioMigrations1791600000000 } from '../migrations/1791600000000-studio-migrations.js';
import { StudioMigrations1791700000000 } from '../migrations/1791700000000-studio-migrations.js';
import { StudioMigrations1791700100000 } from '../migrations/1791700100000-studio-migrations.js';
import { StudioMigrations1791700200000 } from '../migrations/1791700200000-studio-migrations.js';
import { StudioMigrations1791700300000 } from '../migrations/1791700300000-studio-migrations.js';
import { StudioMigrations1791700500000 } from '../migrations/1791700500000-studio-migrations.js';
import { StudioMigrations1791700600000 } from '../migrations/1791700600000-studio-migrations.js';
import { StudioMigrations1791700700000 } from '../migrations/1791700700000-studio-migrations.js';
import { StudioMigrations1791700800000 } from '../migrations/1791700800000-studio-migrations.js';
import { StudioMigrations1791700900000 } from '../migrations/1791700900000-studio-migrations.js';
import { StudioMigrations1791701000000 } from '../migrations/1791701000000-studio-migrations.js';
import { StudioMigrations1791701100000 } from '../migrations/1791701100000-studio-migrations.js';
import { StudioMigrations1791701200000 } from '../migrations/1791701200000-studio-migrations.js';
import { StudioMigrations1791701300000 } from '../migrations/1791701300000-studio-migrations.js';
import { StudioMigrations1791701400000 } from '../migrations/1791701400000-studio-migrations.js';
import { StudioMigrations1791701500000 } from '../migrations/1791701500000-studio-migrations.js';
import { StudioMigrations1791701600000 } from '../migrations/1791701600000-studio-migrations.js';
import { StudioMigrations1791701700000 } from '../migrations/1791701700000-studio-migrations.js';
import { StudioMigrations1791701800000 } from '../migrations/1791701800000-studio-migrations.js';
import { StudioMigrations1791701900000 } from '../migrations/1791701900000-studio-migrations.js';
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
				StudioMigrations1758011998054,
				// Add IssuedCredential table
				StudioMigrations1760533089289,
				// Migrate Studio credentials to IssuedCredential table
				MigrateStudioCredentials1760533089389,
				// Migrate Dock credentials to IssuedCredential table
				MigrateDockCredentials1760533089589,
				// Add StatusRegistry table
				StudioMigrations1761834657128,
				// Migrate status lists to StatusRegistry table
				MigrationsStatusLists1762775396083,
				UpdateWriteCursors1762775500000,
				StudioMigrations1766408271347,
				// Add faucetRequest table for the monthly faucet quota
				StudioMigrations1791500000000,
				// Track whether each faucet request completed, so abandoned reservations can stop counting
				StudioMigrations1791500000001,
				// Let the database set faucetRequest.createdAt
				StudioMigrations1791500000002,
				// Add deletedAccountRecord table, to block a fresh free trial after account deletion
				StudioMigrations1791600000000,
				// Add featureFlag table: engine kill switches, UI default and per-customer overrides
				StudioMigrations1791700000000,
				// No-op: Credo storage is a separate database, provisioned by hand
				StudioMigrations1791700100000,
				// Add agent and agentCard tables
				StudioMigrations1791700200000,
				// Add authorityGrant and paymentAddressBinding tables
				StudioMigrations1791700300000,
				// Add customer.credoTenantId
				StudioMigrations1791700500000,
				// Add append-only adminAuditLog table
				StudioMigrations1791700600000,
				// Add engineDiff and engineMigration tables
				StudioMigrations1791700700000,
				// Add engine column to identifier, issuedCredential and statusRegistry
				StudioMigrations1791700800000,
				// Add engine, network, outcome and durationMs to operation
				StudioMigrations1791700900000,
				// Add statusFormat, listFormat and encoding columns
				StudioMigrations1791701000000,
				// Add identifier and customer credoTenantId indexes
				StudioMigrations1791701100000,
				// Add idempotencyKey table
				StudioMigrations1791701200000,
				// Add operation and key indexes for the staff analytics queries
				StudioMigrations1791701300000,
				// Add source to customer and faucetRequest
				StudioMigrations1791701400000,
				// Add customerActivation table (activation milestones)
				StudioMigrations1791701500000,
				// Add authorityGrant.policySummary (settlement view)
				StudioMigrations1791701600000,
				StudioMigrations1791701700000,
				StudioMigrations1791701800000,
				StudioMigrations1791701900000,
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
				IssuedCredentialEntity,
				StatusRegistryEntity,
				FaucetRequestEntity,
				DeletedAccountRecordEntity,
				FeatureFlagEntity,
				AgentEntity,
				AgentCardEntity,
				AgentEventEntity,
				AuthorityGrantEntity,
				PaymentAddressBindingEntity,
				AdminAuditLogEntity,
				EngineDiffEntity,
				EngineMigrationEntity,
				IdempotencyKeyEntity,
				CustomerActivationEntity,
			],
			logging: ['error', 'info', 'warn'],
		});
	}
}
