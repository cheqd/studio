import { createHash } from 'node:crypto';
import { unfundedPayerFailure } from '../../helpers/ledger-errors.js';
import { LedgerUnavailableError } from '../identity/ledger-lock.js';
import type { IdempotencyState } from '../../database/entities/idempotency-key.entity.js';

/**
 * Idempotent ledger writes for NEW routes (engine spec 3.4, rule 2 and 3).
 *
 *   1. Insert the row (`submitting`) and commit it on its own connection BEFORE the SDK call, so a crash
 *      leaves evidence.
 *   2. Run the write. Settle to `succeeded` (response and transaction hash) or `failed`.
 *   3. A timeout (cosmjs `TimeoutError`, or the request deadline passing) is "unknown", not "failed": the
 *      transaction may have landed. The row is set to `unknown` and `LedgerUnavailableError` is thrown with the
 *      key. Nothing writes again for that key until a reconciler settles it.
 *   4. A retry with the same key and the same request hash gets the settled result; a different hash is a
 *      422; `unknown` and `submitting` never write again.
 *
 * Existing routes do not use this: with no key the work simply runs.
 */

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_WRITE_DEADLINE_MS = 120_000;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 255;

export interface IdempotencyRecord {
	id: string;
	customerId: string;
	key: string;
	route: string;
	requestHash: string;
	state: IdempotencyState;
	txHash?: string | null;
	response?: Record<string, unknown> | null;
	expiresAt: Date;
}

/** Persistence port. Every method runs on its own connection, outside any caller transaction. */
export interface IdempotencyStore {
	/** Inserts a `submitting` row and commits. Returns null when `(customerId, key)` already exists. */
	insertSubmitting(row: {
		customerId: string;
		key: string;
		route: string;
		requestHash: string;
		expiresAt: Date;
	}): Promise<IdempotencyRecord | null>;
	find(customerId: string, key: string): Promise<IdempotencyRecord | null>;
	settle(
		id: string,
		change: { state: IdempotencyState; txHash?: string | null; response?: Record<string, unknown> | null }
	): Promise<void>;
	remove(id: string): Promise<void>;
}

/** What a settled write returns to the caller and what is stored for replay. */
export interface IdempotentResult {
	status: number;
	body: Record<string, unknown>;
	/** Transaction hash, if the write produced one the caller can see. */
	txHash?: string;
}

/** Error carrying the HTTP answer the controller sends. */
export class IdempotencyError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string,
		readonly idempotencyKey?: string
	) {
		super(message);
		this.name = 'IdempotencyError';
	}
}

export type IdempotentOutcome =
	| { replayed: false; result: IdempotentResult }
	| { replayed: true; state: 'succeeded' | 'failed'; result: IdempotentResult };

/** Stable JSON: object keys sorted, so the same request hashes the same however the client ordered it. */
export function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
	const entries = Object.entries(value as Record<string, unknown>)
		.filter(([, v]) => v !== undefined)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
}

export function hashRequest(parts: unknown): string {
	return createHash('sha256').update(canonicalJson(parts)).digest('hex');
}

/** True for errors that leave the outcome unknown: the transaction may or may not have been included. */
export function isTimeoutError(error: unknown): boolean {
	if (!error || typeof error !== 'object') return false;
	const name = (error as { name?: string }).name;
	const message = String((error as { message?: string }).message ?? '');
	return (
		name === 'TimeoutError' ||
		name === 'DeadlineExceeded' ||
		/was not included in a block|timed out|timeout/i.test(message)
	);
}

class DeadlineExceeded extends Error {
	constructor() {
		super('The request deadline passed before the ledger write finished');
		this.name = 'DeadlineExceeded';
	}
}

export interface IdempotencyServiceOptions {
	store: IdempotencyStore;
	now?: () => number;
	ttlMs?: number;
}

export class IdempotencyService {
	private readonly store: IdempotencyStore;
	private readonly now: () => number;
	private readonly ttlMs: number;

	constructor(options: IdempotencyServiceOptions) {
		this.store = options.store;
		this.now = options.now ?? Date.now;
		this.ttlMs = options.ttlMs ?? IDEMPOTENCY_TTL_MS;
	}

	/**
	 * Runs `write` at most once for `(customerId, key)`. `deadlineMs` is how long the write may take before the
	 * outcome is declared unknown.
	 */
	async execute(
		input: { customerId: string; key: string; route: string; requestHash: string; deadlineMs?: number },
		write: () => Promise<IdempotentResult>
	): Promise<IdempotentOutcome> {
		if (!input.key || input.key.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
			throw new IdempotencyError(
				400,
				'invalid_request',
				`Idempotency-Key must be 1 to ${IDEMPOTENCY_KEY_MAX_LENGTH} characters`
			);
		}

		const row = await this.store.insertSubmitting({
			customerId: input.customerId,
			key: input.key,
			route: input.route,
			requestHash: input.requestHash,
			expiresAt: new Date(this.now() + this.ttlMs),
		});
		if (!row) return this.replay(input);

		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			const deadline = new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new DeadlineExceeded()), input.deadlineMs ?? DEFAULT_WRITE_DEADLINE_MS);
			});
			const result = await Promise.race([write(), deadline]);
			await this.store.settle(row.id, {
				state: 'succeeded',
				txHash: result.txHash ?? null,
				response: { status: result.status, body: result.body },
			});
			return { replayed: false, result };
		} catch (error) {
			if (error instanceof LedgerUnavailableError && !error.idempotencyKey) {
				// The payer lock was never taken, so nothing was written: forget the key so a retry can go ahead.
				await this.store.remove(row.id);
				throw error;
			}
			if (wroteNothing(error)) {
				// A payer with no funds (the transaction is rejected before it is broadcast) or an error that declares
				// itself raised before any write: nothing landed. Forget the key so a retry after the fix runs fresh,
				// instead of replaying the failure for a day.
				await this.store.remove(row.id);
				throw error;
			}
			if (error instanceof DeadlineExceeded || isTimeoutError(error)) {
				await this.store.settle(row.id, { state: 'unknown' });
				const unavailable = new LedgerUnavailableError(
					'The ledger write timed out and its outcome is unknown. Retry with the same Idempotency-Key to learn the result; it will not be written twice.'
				);
				unavailable.idempotencyKey = input.key;
				throw unavailable;
			}
			await this.store.settle(row.id, {
				state: 'failed',
				response: { status: statusOf(error), body: failureBody(error) },
			});
			throw error;
		} finally {
			if (timer) clearTimeout(timer);
		}
	}

	private async replay(input: { customerId: string; key: string; requestHash: string }): Promise<IdempotentOutcome> {
		const existing = await this.store.find(input.customerId, input.key);
		if (!existing) {
			// Deleted between the insert and the read (expiry sweep or an unlocked payer): ask the caller to retry.
			throw new IdempotencyError(409, 'idempotency_conflict', 'Please retry the request', input.key);
		}
		if (existing.requestHash !== input.requestHash) {
			throw new IdempotencyError(
				422,
				'idempotency_key_reused',
				'This Idempotency-Key was used with a different request',
				input.key
			);
		}
		if (existing.state === 'succeeded' || existing.state === 'failed') {
			const stored = (existing.response ?? {}) as { status?: number; body?: Record<string, unknown> };
			return {
				replayed: true,
				state: existing.state,
				result: {
					status: stored.status ?? (existing.state === 'succeeded' ? 200 : 500),
					body: stored.body ?? {},
					...(existing.txHash ? { txHash: existing.txHash } : {}),
				},
			};
		}
		if (existing.state === 'unknown') {
			const unavailable = new LedgerUnavailableError(
				'The outcome of the earlier attempt with this Idempotency-Key is not yet known. It will not be written again; retry later.'
			);
			unavailable.idempotencyKey = input.key;
			throw unavailable;
		}
		throw new IdempotencyError(
			409,
			'idempotency_in_flight',
			'A request with this Idempotency-Key is still being processed',
			input.key
		);
	}
}

/** True for failures known to have happened before any ledger write, so the idempotency key is not kept. */
function wroteNothing(error: unknown): boolean {
	if (unfundedPayerFailure(error)) return true;
	return (error as { nothingWritten?: unknown } | null)?.nothingWritten === true;
}

const statusOf = (error: unknown): number => {
	const status = (error as { status?: unknown })?.status;
	return typeof status === 'number' && Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
};
const failureBody = (error: unknown): Record<string, unknown> => {
	// Only errors that carry an HTTP status are meant for the caller; anything else is stored as a generic failure
	if (error instanceof Error && typeof (error as { status?: unknown }).status === 'number') {
		const code = (error as { code?: unknown }).code;
		return { error: error.message, ...(typeof code === 'string' ? { code } : {}) };
	}
	return { error: 'Internal error' };
};

/**
 * TODO(reconciler): settle `unknown` rows, and `submitting` rows older than the write deadline (a crash left
 * them). It is out of scope for this change. For each such row it must:
 *   1. look the write up on the chain: the DID document or DID-Linked Resource version the route would have
 *      created (by DID, resource id or `versionId`), and the status-list resource for revocations;
 *   2. check the payer account's sequence against the sequence recorded when the write started, to tell "landed"
 *      from "never broadcast" (needs the SDK change in action A-063: return the hash/sequence before broadcast);
 *   3. set `succeeded` with the transaction hash and the response to replay, or `failed` when the chain shows
 *      the write cannot have landed (sequence unchanged and the timeout height, once supported, has passed);
 *   4. never set `failed` while the outcome is still possible, and leave a row it cannot decide as `unknown`;
 *   5. delete rows past `expiresAt`.
 */
export async function reconcileIdempotencyKeys(_store: IdempotencyStore): Promise<never> {
	throw new Error('Not implemented: see the TODO above for what the reconciler must check');
}
