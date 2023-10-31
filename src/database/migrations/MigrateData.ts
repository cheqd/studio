import type { MigrationInterface, QueryRunner } from 'typeorm';
import * as dotenv from 'dotenv';
import {v4 as uuidv4} from 'uuid';
import { CheqdNetwork } from '@cheqd/sdk';
import { CustomerEntity } from '../entities/customer.entity.js';
import type { UserEntity } from '../entities/user.entity.js';
import type { RoleEntity } from '../entities/role.entity.js';
dotenv.config();


export class MigrateData1695740345977 implements MigrationInterface {
	public async up(queryRunner: QueryRunner): Promise<void> {
		// Here we are going to migrate all the data from customers table and put it into customer, user and paymentAccount table due to the logic
		// Currently, customers record includes:
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
		// 2.1. logToId - customers's customerId
		// 2.2. customerId - uuid of just created customer from 1.1
		// 2.3. roleTypeId - will be empty cause we don't know the roleTypeId while migration. It should be set manually after migration

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

		const user_t = await queryRunner.getTable('user');
		const paymentAccount_t = await queryRunner.getTable('paymentAccount');
		const customer_t = await queryRunner.getTable('customer');
		const customerS_t = await queryRunner.getTable('customers');
		const key_t = await queryRunner.getTable('key');
		const identifier_t = await queryRunner.getTable('identifier');

		if (!user_t) {
			throw new Error('For such migration we need user table');
		}
		if (!paymentAccount_t) {
			throw new Error('For such migration we need paymentAccount table');
		}
		if (!customer_t) {
			throw new Error('For such migration we need customer table');
		}

		if (!customerS_t) {
			throw new Error('For such migration we need customers table');
		}

		if (!key_t) {
			throw new Error('For such migration we need key table');
		}

		if (!identifier_t) {
			throw new Error('For such migration we need identifier table');
		}

        // 0. Set default role:

        console.info("Setting up default role...")
        const _res = await this.setDefaultRole(queryRunner);
        if (!_res) {
            throw new Error(`Failed to set up default role`);
        }

        // Get default role:
        const roles: RoleEntity[] = await queryRunner.query(`SELECT * FROM role WHERE name = 'default'`);
        if (!roles) {
            throw new Error(`Failed to get default role with LogToRoleId ${process.env.LOGTO_DEFAULT_ROLE_ID}`);
        }

        if (roles.length !== 1) {
            throw new Error(`Default role with LogToRoleId ${process.env.LOGTO_DEFAULT_ROLE_ID} should be only one`);
        }
        const role = roles[0];

        for (const c_record of await queryRunner.query(`SELECT * FROM customers`)) {
        
            // 1. Create customer row:
            console.info(`Creating CustomerEntity with id ${c_record.customerId}`);
            const customerEntity = new CustomerEntity(uuidv4(), c_record.address);
            customerEntity.createdAt = new Date();

            console.info(`Creating customer with address ${c_record.address}`);
		    const _customer = await queryRunner.query(`INSERT INTO "customer" ("customerId", name, "createdAt") VALUES ('${customerEntity.customerId}', '${customerEntity.name}', '${customerEntity.createdAt.toISOString()}')`);
            if (!_customer) {
                throw new Error(`Failed to create customer for address ${c_record.address}`);
            }
            
            // 2. Create user row:
            console.info(`Creating user with id ${c_record.customerId}`);
            const user: UserEntity = await queryRunner.query(`INSERT INTO "user" ("logToId", "customerId", "roleTypeId", "createdAt") VALUES ('${c_record.customerId}', '${customerEntity.customerId}', '${role.roleTypeId}', '${customerEntity.createdAt.toISOString()}')`);
            if (!user) {
                throw new Error(`Failed to create user for address ${c_record.address}`);
            }

            // 3. Create paymentAccount row:
            console.info(`Creating payment account with address ${c_record.address}`);
            const payment_account = await queryRunner.query(`INSERT INTO "paymentAccount" (address, namespace, "isDefault", "customerId", kid, "createdAt") VALUES ('${c_record.address}', '${CheqdNetwork.Testnet}', false, '${customerEntity.customerId}', '${c_record.account}', '${customerEntity.createdAt.toISOString()}')`);
            if (!payment_account) {
                throw new Error(`Failed to create payment account for address ${c_record.address}`);
            }

            // 4. Update key and identifier tables:
            // 4.1 for each kid in kids field:
            for (const kid of c_record.kids) {
                console.info(`Updating key with kid ${kid}`);
                const _key = await queryRunner.query(`UPDATE "key" SET "customerId" = '${customerEntity.customerId}' WHERE kid = '${kid}'`);
                if (!_key) {
                    throw new Error(`Failed to update key with kid ${kid}`);
                }
            }

            // 4.2 for each did in dids field:
            for (const did of c_record.dids) {
                console.info(`Updating identifier with did ${did}`);
                const _identifier = await queryRunner.query(`UPDATE "identifier" SET "customerId" = '${customerEntity.customerId}' WHERE did = '${did}'`);
                if (!_identifier) {
                    throw new Error(`Failed to update identifier with did ${did}`);
                }
            }
        }
	}

    private async setDefaultRole(queryRunner: QueryRunner): Promise<RoleEntity | undefined>{
        if (process.env.LOGTO_DEFAULT_ROLE_ID) {
            console.info(`Setting default role with LogToRoleId ${process.env.LOGTO_DEFAULT_ROLE_ID}`);
            const role = await queryRunner.query(`SELECT * FROM role WHERE name = 'default'`);
            if (role.length === 0) {
                console.info("Default role not found, creating...")
                const _res = await queryRunner.query(`INSERT INTO role ("roleTypeId", name, "logToRoleIds") VALUES ('${uuidv4()}', 'default', '{"${process.env.LOGTO_DEFAULT_ROLE_ID}"}')`);
                if (_res) {
                    console.info("Default role created")
                }
                return _res
            }
            return role[0];
        }
        return undefined;
    }

	public async down(queryRunner: QueryRunner): Promise<void> {
		throw new Error('illegal_operation: cannot roll back initial migration');
	}
}
