import { BeforeInsert, Column, Entity, PrimaryColumn } from 'typeorm';

import * as dotenv from 'dotenv';
dotenv.config();

/**
 * One row per email address that has ever had a cheqd Studio account deleted. Deliberately has no FK to
 * `customer` (so it is never cascaded away when the customer row it describes is deleted -- the whole point
 * is to survive that deletion) and is written as part of the account-deletion pipeline, before the customer
 * row itself is removed.
 *
 * Used to block a fresh free trial for an email that has already had an account: see
 * DeletedAccountRecordService and its use in account-submitter.ts (the automatic trial grant on signup) and
 * subscriptions.ts (the explicit "start trial" endpoint).
 */
@Entity('deletedAccountRecord')
export class DeletedAccountRecordEntity {
	@PrimaryColumn({
		type: 'text',
	})
	email!: string;

	@Column({
		type: 'text',
		nullable: false,
	})
	previousCustomerId!: string;

	@Column({
		type: 'text',
		nullable: true,
	})
	stripeCustomerId?: string;

	@Column({
		type: 'timestamptz',
		nullable: false,
	})
	deletedAt!: Date;

	@BeforeInsert()
	setDeletedAt() {
		this.deletedAt = new Date();
	}

	// Plain assignment only: TypeORM instantiates entity classes with no arguments while building metadata
	// (e.g. during DataSource.initialize()), so a constructor that calls a method on its parameters -- like
	// the email.trim() this used to do -- throws on that undefined call and aborts initialize() entirely.
	// Callers are expected to pass an already-normalized email; see normalizeEmail() in
	// DeletedAccountRecordService, which is the only thing that constructs this entity.
	constructor(email: string, previousCustomerId: string, stripeCustomerId?: string) {
		this.email = email;
		this.previousCustomerId = previousCustomerId;
		this.stripeCustomerId = stripeCustomerId;
	}
}
