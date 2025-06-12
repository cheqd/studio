import pkg from 'pg-connection-string';
import { DataSource } from 'typeorm';
import { migrations, Entities } from '@veramo/data-store';
import { APIKeyEntity } from '../entities/api.key.entity.js';
import { CustomerEntity } from '../entities/customer.entity.js';
import { UserEntity } from '../entities/user.entity.js';
import { RoleEntity } from '../entities/role.entity.js';
import { OperationEntity } from '../entities/operation.entity.js';
import { PaymentEntity } from '../entities/payment.entity.js';
import { PaymentAccountEntity } from '../entities/payment.account.entity.js';
import { ResourceEntity } from '../entities/resource.entity.js';
import { KeyEntity } from '../entities/key.entity.js';
import { IdentifierEntity } from '../entities/identifier.entity.js';
import { CoinEntity } from '../entities/coin.entity.js';
import { SubscriptionEntity } from '../entities/subscription.entity.js';

import * as dotenv from 'dotenv';


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
				'src/database/migrations/**/*.ts',
			],
			entities: [
				...Entities,
				APIKeyEntity,
				CustomerEntity,
				UserEntity,
				RoleEntity,
				OperationEntity,
				PaymentEntity,
				PaymentAccountEntity,
				ResourceEntity,
				KeyEntity,
				IdentifierEntity,
				CoinEntity,
				SubscriptionEntity,
				'src/database/entities/*.entity.ts'
			],
			logging: ['error', 'info', 'warn'],
		});
	}
}
