import type { Repository } from 'typeorm';

import { Connection } from '../../database/connection/connection.js';
import { DeletedAccountRecordEntity } from '../../database/entities/deleted-account-record.entity.js';

import * as dotenv from 'dotenv';
dotenv.config();

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

export class DeletedAccountRecordService {
	public repository: Repository<DeletedAccountRecordEntity>;

	public static instance = new DeletedAccountRecordService();

	constructor() {
		this.repository = Connection.instance.dbConnection.getRepository(DeletedAccountRecordEntity);
	}

	/**
	 * Records that an account for this email was deleted, so a later signup with the same email never gets a
	 * fresh free trial. Upserts on email: repeated deletions of the same email (delete, resignup, delete
	 * again) just update the one record rather than erroring on a duplicate key.
	 */
	public async record(email: string, previousCustomerId: string, stripeCustomerId?: string): Promise<void> {
		const record = new DeletedAccountRecordEntity(email, previousCustomerId, stripeCustomerId);
		await this.repository.save(record);
	}

	/**
	 * True if this email has ever had a Studio account deleted before -- regardless of whether that account
	 * was ever on a trial, a paid plan, or no subscription at all.
	 */
	public async hasPriorDeletedAccount(email: string): Promise<boolean> {
		const existing = await this.repository.findOneBy({ email: normalizeEmail(email) });
		return existing !== null;
	}
}
