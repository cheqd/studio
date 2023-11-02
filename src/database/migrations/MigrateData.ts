import type { MigrationInterface, QueryRunner } from 'typeorm';
import * as dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';
import { CheqdNetwork } from '@cheqd/sdk';
import { CustomerEntity } from '../entities/customer.entity.js';
import type { UserEntity } from '../entities/user.entity.js';
import type { RoleEntity } from '../entities/role.entity.js';
dotenv.config();

export class MigrateData1695740345977 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		// Here we are going to migrate all the data from customers table and put it into customer, user and paymentAccount table due to the logic
		// Currently, customers record includes:

		// 0. Set default role:
		// Create deafult role with list of LogToRoleIds from .env file

		// 1. customerId - usually, it's a LogTo user id (except one field with uuid value) and it should be mapped to user table
		// 2. account - kid to key table with cosmos keys
		// 3. address - payment address
		// 4. kids - list of all kid, associated with such customer
		// 5. dids - list of all did, associated with such customer

		// Steps to data migration:
		// 1. Create customer row:
		// 1.1. customerId - uuid.gen()
		// 1.2. name - customers's address

		// 2. Create user row:
		// 2.1. logToId - customers's customerId (cause for old db we kept it as LogTo user id)
		// 2.2. customerId - uuid of just created customer from 1.1
		// 2.3. roleTypeId - default role id

		// 3. Create paymentAccount row:
		// 3.1. address - customers's address
		// 3.2. namespace - "testnet" by default
		// 3.3. isDefault - false by default
		// 3.4. customerId - uuid of just created customer from 1.1
		// 3.5. kid - customers's account

		// 4. Update key and identifier tables:
		// 4.1 for each kid in kids field:
		// 4.1.1. update corresponding row in key table with customerId from 1.1
		// 4.2 for each did in dids field:
		// 4.2.1. update corresponding row in identifier table with customerId from 1.1

		const userTable = await queryRunner.getTable('user');
		const paymentAccountTable = await queryRunner.getTable('paymentAccount');
		const customerTable = await queryRunner.getTable('customer');
		const customerSTable = await queryRunner.getTable('customers');
		const keyTable = await queryRunner.getTable('key');
		const identifierTable = await queryRunner.getTable('identifier');
		const isDefaultPaymentAccount = true;

		if (!userTable) {
			throw new Error('For such migration we need user table');
		}
		if (!paymentAccountTable) {
			throw new Error('For such migration we need paymentAccount table');
		}
		if (!customerTable) {
			throw new Error('For such migration we need customer table');
		}

		if (!customerSTable) {
			throw new Error('For such migration we need customers table');
		}

		if (!keyTable) {
			throw new Error('For such migration we need key table');
		}

		if (!identifierTable) {
			throw new Error('For such migration we need identifier table');
		}

		// 0. Set default role:

		console.info('Setting up default role...');
		const _res = await this.setDefaultRole(queryRunner);
		if (!_res) {
			throw new Error(
				`Failed to set up default role. Seems like it was created before but it's unexpected behavior. Please, check your database`
			);
		}

		// Get default role:
		// Here we need to get previously created role row cause we need it's roleTypeId which is autogenerated
		const defaultRoles: RoleEntity[] = await queryRunner.query(`SELECT * FROM role WHERE name = 'default'`);
		if (!defaultRoles) {
			throw new Error(`Failed to get default role with LogToRoleId ${process.env.LOGTO_DEFAULT_ROLE_ID}`);
		}

		if (defaultRoles.length !== 1) {
			throw new Error(`Default role with LogToRoleId ${process.env.LOGTO_DEFAULT_ROLE_ID} should be only one`);
		}
		const defaultRole = defaultRoles[0];

		for (const oldCustomer of await queryRunner.query(`SELECT * FROM customers`)) {
			// 1. Create customer row:
			console.info(`Creating CustomerEntity with id ${oldCustomer.customerId}`);
			const customerEntity = new CustomerEntity(uuidv4(), oldCustomer.address);
			customerEntity.createdAt = new Date();

			console.info(`Creating customer with address ${oldCustomer.address}`);
			const _customer = await queryRunner.query(
				`INSERT INTO "customer" ("customerId", name, "createdAt") VALUES ('${customerEntity.customerId}', '${
					customerEntity.name
				}', '${customerEntity.createdAt.toISOString()}')`
			);
			if (!_customer) {
				throw new Error(`Failed to create customer for address ${oldCustomer.address}`);
			}

			// 2. Create user row:
			console.info(`Creating user with id ${oldCustomer.customerId}`);
			const user: UserEntity = await queryRunner.query(
				`INSERT INTO "user" ("logToId", "customerId", "roleTypeId", "createdAt") VALUES ('${
					oldCustomer.customerId
				}', '${customerEntity.customerId}', '${
					defaultRole.roleTypeId
				}', '${customerEntity.createdAt.toISOString()}')`
			);
			if (!user) {
				throw new Error(`Failed to create user for address ${oldCustomer.address}`);
			}

			// 3. Create paymentAccount row:
			console.info(`Creating payment account with address ${oldCustomer.address}`);
			const payment_account = await queryRunner.query(
				`INSERT INTO "paymentAccount" (address, namespace, "isDefault", "customerId", kid, "createdAt") VALUES ('${
					oldCustomer.address
				}', '${CheqdNetwork.Testnet}', '${isDefaultPaymentAccount}', '${customerEntity.customerId}', '${
					oldCustomer.account
				}', '${customerEntity.createdAt.toISOString()}')`
			);
			if (!payment_account) {
				throw new Error(`Failed to create payment account for address ${oldCustomer.address}`);
			}

			// 4. Update key and identifier tables:
			// 4.1 for each kid in kids field:
			for (const kid of oldCustomer.kids) {
				console.info(`Updating key with kid ${kid}`);
				const _key = await queryRunner.query(
					`UPDATE "key" SET "customerId" = '${customerEntity.customerId}', "createdAt" = '${customerEntity.createdAt.toISOString()}' WHERE kid = '${kid}'`
				);
				if (!_key) {
					throw new Error(`Failed to update key with kid ${kid}`);
				}
			}

			// 4.2 for each did in dids field:
			for (const did of oldCustomer.dids) {
				console.info(`Updating identifier with did ${did}`);
				const _identifier = await queryRunner.query(
					`UPDATE "identifier" SET "customerId" = '${customerEntity.customerId}' WHERE did = '${did}'`
				);
				if (!_identifier) {
					throw new Error(`Failed to update identifier with did ${did}`);
				}
			}
		}
	}

	private async setDefaultRole(queryRunner: QueryRunner): Promise<RoleEntity | undefined> {
		if (process.env.LOGTO_DEFAULT_ROLE_ID) {
			console.info(`Setting default role with LogToRoleId ${process.env.LOGTO_DEFAULT_ROLE_ID}`);
			const role = await queryRunner.query(`SELECT * FROM role WHERE name = 'default'`);
			if (role.length === 0) {
				console.info('Default role not found, creating...');
				const _res = await queryRunner.query(
					`INSERT INTO role ("roleTypeId", name, "logToRoleIds") VALUES ('${uuidv4()}', 'default', '{"${
						process.env.LOGTO_DEFAULT_ROLE_ID
					}"}')`
				);
				if (_res) {
					console.info('Default role created');
				}
				return _res;
			}
			return role[0];
		}
		return undefined;
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		throw new Error('illegal_operation: cannot roll back initial migration');
	}
}
