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
	 *
	 * Returns whatever record existed for this email before this call (or null), so a caller that needs to
	 * roll this write back -- e.g. because the deletion it was recording turned out not to actually happen --
	 * can restore exactly that prior state instead of just deleting the row. That distinction matters: this
	 * email may have been blocked already by a genuinely earlier deletion, and a naive rollback would
	 * incorrectly erase that real block.
	 */
	public async record(
		email: string,
		previousCustomerId: string,
		stripeCustomerId?: string
	): Promise<DeletedAccountRecordEntity | null> {
		const normalizedEmail = normalizeEmail(email);
		const existing = await this.repository.findOneBy({ email: normalizedEmail });
		const record = new DeletedAccountRecordEntity(normalizedEmail, previousCustomerId, stripeCustomerId);
		await this.repository.save(record);
		return existing;
	}

	/**
	 * Undoes a record() call: restores whatever record() reported as having existed before it ran (re-saving
	 * it, since record()'s upsert will have overwritten it), or deletes the row entirely if there was none.
	 */
	public async restore(email: string, previous: DeletedAccountRecordEntity | null): Promise<void> {
		if (previous) {
			await this.repository.save(previous);
		} else {
			await this.repository.delete({ email: normalizeEmail(email) });
		}
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
