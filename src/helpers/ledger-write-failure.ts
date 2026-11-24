import type { CustomerEntity } from '../database/entities/customer.entity.js';
import type { ITrackOperation, TrackData } from '../types/track.js';
import { LedgerUnavailableError } from '../services/identity/ledger-lock.js';
import { EngineRoutingUnavailableError } from '../services/identity/engine/errors.js';
import { mapEngineError } from './engine-errors.js';

/**
 * Why a ledger write (DID create, update or deactivate, resource create, status list create or update) failed, in
 * plain words (U-30). Stored on the failed attempt's `operation` row as `errorCategory`, so the account's activity
 * can show the attempt; the raw error and the request payload are never stored.
 *
 * - `insufficient_funds`: the payer account has no CHEQ, or too little to pay the fee.
 * - `out_of_gas`: the transaction ran out of gas.
 * - `ledger_unavailable`: the ledger or its RPC could not be reached, timed out, or is busy for this account.
 * - `rejected`: the ledger refused the transaction (for example a failed check or a sequence mismatch).
 * - `other`: anything else (the write may never have reached the ledger).
 */
export const LEDGER_ERROR_CATEGORIES = [
	'insufficient_funds',
	'out_of_gas',
	'ledger_unavailable',
	'rejected',
	'other',
] as const;
export type LedgerErrorCategory = (typeof LEDGER_ERROR_CATEGORIES)[number];

/** The plain-words label for each category, for an activity feed. */
export const LEDGER_ERROR_LABELS: Record<LedgerErrorCategory, string> = {
	insufficient_funds: 'Not enough CHEQ to pay the fee',
	out_of_gas: 'Ran out of gas',
	ledger_unavailable: 'Ledger unavailable',
	rejected: 'Rejected by the ledger',
	other: 'Something else went wrong',
};

/**
 * The stable `code` sent in the API error body for each category. `other` has none, and a ledger that is busy for
 * the account keeps the code it already had (`LedgerUnavailable`, from the engine error mapping).
 */
export const LEDGER_ERROR_CODES: Record<LedgerErrorCategory, string | undefined> = {
	insufficient_funds: 'insufficient_funds',
	out_of_gas: 'out_of_gas',
	ledger_unavailable: 'ledger_unavailable',
	rejected: 'ledger_rejected',
	other: undefined,
};

const INSUFFICIENT_FUNDS = /does not exist on chain|insufficient funds|insufficient fee/i;
const OUT_OF_GAS = /out of gas/i;
const UNAVAILABLE =
	/ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|socket hang up|fetch failed|network error|timed? ?out|was submitted but was not yet found on the chain|\b50[234]\b|bad gateway|service unavailable/i;
const REJECTED =
	/broadcast(ing)? tx failed|transaction failed|tx failed|rejected|signature verification failed|account sequence mismatch|codespace|\bcode[:=]? ?\d+/i;

/** The category of a failed ledger write. Order matters: funds and gas are the most specific chain answers. */
export function ledgerErrorCategory(error: unknown): LedgerErrorCategory {
	if (error instanceof LedgerUnavailableError || error instanceof EngineRoutingUnavailableError) {
		return 'ledger_unavailable';
	}
	const message = (error as Error)?.message || String(error);
	if (INSUFFICIENT_FUNDS.test(message)) return 'insufficient_funds';
	if (OUT_OF_GAS.test(message)) return 'out_of_gas';
	if (UNAVAILABLE.test(message)) return 'ledger_unavailable';
	if (REJECTED.test(message)) return 'rejected';
	return 'other';
}

/**
 * True when the failure is the caller's (a typed engine error answered with a 4xx other than 402, such as "not
 * yours" or "not supported"): nothing was attempted on the ledger, so no failed attempt is recorded.
 */
function isCallerError(error: unknown): boolean {
	const mapped = mapEngineError(error);
	return mapped !== undefined && mapped.status < 500;
}

export interface FailedLedgerWrite {
	category: string;
	name: string;
	customer: CustomerEntity | undefined;
	/** The DID the write was for, if known: gives the attempt its network. Never the payload. */
	did?: string;
	/** The network asked for, when there is no DID yet (DID create). */
	network?: string;
}

export interface FailedLedgerWriteDeps {
	/** Writes the failed `operation` row. */
	insert(operation: ITrackOperation<TrackData>, errorCategory: LedgerErrorCategory): Promise<unknown>;
}

/** The production writer, imported on first use so that unit tests of the callers need no database. */
const liveDeps: FailedLedgerWriteDeps = {
	async insert(operation, errorCategory) {
		const [{ OperationService }, { operationRouting }] = await Promise.all([
			import('../services/api/operation.js'),
			import('../services/track/operation-routing.js'),
		]);
		await OperationService.instance.create(
			operation.category,
			operation.name,
			undefined,
			false,
			false,
			operation.customer,
			{ ...operationRouting(operation), outcome: 'error', errorCategory }
		);
	},
};

/**
 * Records a failed ledger write as an unsuccessful `operation` row with its error category, and returns the
 * category, which the caller uses for the `code` of its error body (undefined for a caller error, which is not
 * recorded). Never throws: a failure to record is logged and the category is still returned. The log line names the
 * operation, the category and the error message, which the API already returns to the caller; the request payload
 * is never logged or stored.
 */
export async function recordFailedLedgerWrite(
	write: FailedLedgerWrite,
	error: unknown,
	deps: FailedLedgerWriteDeps = liveDeps
): Promise<LedgerErrorCategory | undefined> {
	let category: LedgerErrorCategory;
	try {
		if (isCallerError(error)) return undefined;
		category = ledgerErrorCategory(error);
		const message = ((error as Error)?.message || String(error)).slice(0, 500);
		console.warn(`Ledger write ${write.name} failed (${category}): ${message}`);
	} catch {
		return undefined;
	}
	if (!write.customer) return category;
	try {
		await deps.insert(
			{
				category: write.category,
				name: write.name,
				customer: write.customer,
				successful: false,
				// Only used to work out the network column; nothing from `data` is stored
				data: { did: write.did || (write.network ? `did:cheqd:${write.network}:` : '') },
			} as ITrackOperation<TrackData>,
			category
		);
	} catch (recordError) {
		console.warn(`Recording failed ledger write ${write.name} failed: ${(recordError as Error)?.message}`);
	}
	return category;
}

/** `{ code }` for the API error body of a failed ledger write, or nothing when the category has no code. */
export function ledgerErrorCode(category: LedgerErrorCategory | undefined): { code?: string } {
	const code = category ? LEDGER_ERROR_CODES[category] : undefined;
	return code ? { code } : {};
}
