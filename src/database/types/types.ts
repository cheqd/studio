import pkg from 'pg-connection-string'
import { DataSource } from 'typeorm'
import { migrations, Entities } from '@veramo/data-store'

import { CustomerEntity } from '../entities/customer.entity.js'
import { CreateCustomersTable1683723285946 } from '../migrations/CreateCustomersTable.js'

import * as dotenv from 'dotenv'
dotenv.config()

const { EXTERNAL_DB_CONNECTION_URL, EXTERNAL_DB_CERT } = process.env;

export interface AbstractDatabase {
    setup(): DataSource;
}

export class Memory implements AbstractDatabase {
    setup(): DataSource {
        return new DataSource({
            type: 'sqlite',
            database: ':memory:',
            entities: [...Entities, CustomerEntity],
            synchronize: false,
            migrations: [...migrations, CreateCustomersTable1683723285946],
            migrationsRun: true,
            logging: ['error', 'info', 'warn']
        });
    }
}

export class Postgres implements AbstractDatabase {
    setup(): DataSource {
        const { parse } = pkg;
        const config = parse(EXTERNAL_DB_CONNECTION_URL)
        if (!(config.host && config.port && config.database)) {
            throw new Error(`Error: Invalid Database URL`)
        }

        return new DataSource({
            type: 'postgres',
            host: config.host,
            port: Number(config.port),
            username: config.user,
            password: config.password,
            database: config.database,
            ssl: config.ssl ? {
                ca: EXTERNAL_DB_CERT
            } : false,
            migrations: [...migrations, CreateCustomersTable1683723285946],
            entities: [...Entities, CustomerEntity],
            logging: ['error', 'info', 'warn']
        });
    }
}
