import { DataSource } from 'typeorm';
import { AbstractDatabase, Memory, Postgres } from '../types/types.js';

import * as dotenv from 'dotenv';
dotenv.config();

const { ENABLE_EXTERNAL_DB } = process.env;

export class Connection {
	private db: AbstractDatabase;
	public dbConnection: DataSource;
	public static instance = new Connection();

	constructor() {
		if (ENABLE_EXTERNAL_DB == 'true') {
			this.db = new Postgres();
		} else {
			this.db = new Memory();
		}

		this.dbConnection = this.db.setup();
	}

	public async connect() {
		try {
			await this.dbConnection.initialize();
		} catch (error) {
			throw new Error(`Error initializing db: ${error}`);
		}
	}
}
