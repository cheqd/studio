import { parse } from 'pg-connection-string'
import { DataSource } from 'typeorm'
import { migrations, Entities } from '@veramo/data-store'

import { CustomerEntity } from '../entities/customer.entity'

require('dotenv').config()

const { ISSUER_DATABASE_URL, ISSUER_DATABASE_SYNCHRONIZE } = process.env

export class Connection {
    public dbConnection : DataSource
    public static instance = new Connection()

    constructor () {
        const config = parse(ISSUER_DATABASE_URL)
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
            ssl: config.ssl ? true : false,
            migrations,
            synchronize: ISSUER_DATABASE_SYNCHRONIZE || true,
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

