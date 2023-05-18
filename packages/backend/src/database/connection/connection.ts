import pkg from 'pg-connection-string'
import { DataSource } from 'typeorm'
import { migrations, Entities } from '@veramo/data-store'

import { CustomerEntity } from '../entities/customer.entity.js'
import { CreateCustomersTable1683723285946 } from '../migrations/CreateCustomersTable.js'

import * as dotenv from 'dotenv'
dotenv.config()

const { ISSUER_DATABASE_URL, ISSUER_DATABASE_CERT } = process.env

export class Connection {
    public dbConnection : DataSource
    public static instance = new Connection()

    constructor () {
        const { parse } = pkg
        const config = parse(ISSUER_DATABASE_URL!)
        if(!(config.host && config.port && config.database)) {
            throw new Error(`Error: Invalid Database url`)
        }

        this.dbConnection = new DataSource({
            type: 'postgres',
            host: config.host,
            port: Number(config.port),
            username: config.user,
            password: config.password,
            database: config.database,
            ssl: config.ssl ? {
                ca: ISSUER_DATABASE_CERT
            } : false,
            migrations: [...migrations, CreateCustomersTable1683723285946],
            entities: [...Entities, CustomerEntity],
            logging: ['error', 'info', 'warn']
          })
    }

    public async connect() {
        try {
            await this.dbConnection.initialize()
        } catch (error) {
            throw new Error(`Error initializing db: ${error}`)
        }
    }
}


