import { StatusCodes } from 'http-status-codes';
import { Cheqd } from '@cheqd/did-provider-cheqd';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';

export type StatusUpdateAction = 'revoke' | 'suspend' | 'reinstate';

/**
 * Stable `code` values for a status change that would change nothing. Every such request answers 409, on either
 * engine, for credentials and accreditations alike.
 */
export type StatusUpdateConflictCode = 'already_revoked' | 'already_suspended' | 'not_suspended' | 'credential_revoked';

const TARGET_VALUE: Record<StatusUpdateAction, number> = { revoke: 1, suspend: 2, reinstate: 0 };
const PAST_TENSE: Record<StatusUpdateAction, string> = {
	revoke: 'revoked',
	suspend: 'suspended',
	reinstate: 'reinstated',
};
const FIELD: Record<StatusUpdateAction, 'revoked' | 'suspended' | 'unsuspended'> = {
	revoke: 'revoked',
	suspend: 'suspended',
	reinstate: 'unsuspended',
};

export type StatusUpdateFailure = { statusCode: number; error: string; code?: StatusUpdateConflictCode };

const CONFLICT_MESSAGE: Record<StatusUpdateConflictCode, string> = {
	already_revoked: 'Nothing was changed: the credential is already revoked',
	already_suspended: 'Nothing was changed: the credential is already suspended',
	not_suspended: 'Nothing was changed: the credential is not suspended, so there is nothing to reinstate',
	credential_revoked: 'Nothing was changed: the credential is revoked, and revocation cannot be undone',
};

const NO_OP_CODE: Record<StatusUpdateAction, StatusUpdateConflictCode> = {
	revoke: 'already_revoked',
	suspend: 'already_suspended',
	reinstate: 'not_suspended',
};

function conflict(code: StatusUpdateConflictCode): StatusUpdateFailure {
	return { statusCode: StatusCodes.CONFLICT, error: CONFLICT_MESSAGE[code], code };
}

const flags = (value: unknown): boolean[] | undefined => {
	if (typeof value === 'boolean') return [value];
	if (Array.isArray(value)) return value.map((item) => item === true);
	return undefined;
};

/**
 * Decides whether a revoke, suspend or reinstate really changed the status list. Engines answer with a result
 * object, never an HTTP status, and a result of `updated: false` with an empty error used to be sent as a 200, so
 * the caller was told it worked. Returns the failure to send (never a 2xx), or null when at least one entry was
 * updated. A result with no update signal at all is left alone: it is not one this check understands.
 */
export function statusUpdateFailure(
	action: StatusUpdateAction,
	result: Record<string, unknown> | undefined | null
): StatusUpdateFailure | null {
	if (!result) return null;
	const reported = flags(result.updated) ?? flags(result[FIELD[action]]);
	const errorValue = result.error as { message?: string } | string | undefined;
	const errorMessage = errorValue ? (typeof errorValue === 'string' ? errorValue : errorValue.message) : undefined;

	if (!reported) {
		if (errorMessage) return { statusCode: StatusCodes.BAD_REQUEST, error: errorMessage };
		return null;
	}
	if (reported.some(Boolean)) return null;

	const value = Array.isArray(result.statusValues)
		? (result.statusValues as unknown[])[0]
		: (result.statusValue as unknown);
	if (value === TARGET_VALUE[action]) return conflict(NO_OP_CODE[action]);
	return {
		statusCode: errorMessage ? StatusCodes.BAD_REQUEST : StatusCodes.INTERNAL_SERVER_ERROR,
		error: `The credential was not ${PAST_TENSE[action]}: the status list was not updated${errorMessage ? `: ${errorMessage}` : ''}. The status list may be recorded against the wrong engine; contact support if this persists`,
	};
}

type CurrentStatus = 'valid' | 'revoked' | 'suspended';

/** The 409 for asking `action` of a credential that is `current`, or null when the change is a real one. */
export function statusTransitionConflict(
	action: StatusUpdateAction,
	current: CurrentStatus
): StatusUpdateFailure | null {
	switch (action) {
		case 'revoke':
			return current === 'revoked' ? conflict('already_revoked') : null;
		case 'suspend':
			if (current === 'suspended') return conflict('already_suspended');
			return current === 'revoked' ? conflict('credential_revoked') : null;
		case 'reinstate':
			if (current === 'suspended') return null;
			return conflict(current === 'revoked' ? 'credential_revoked' : 'not_suspended');
	}
}

/** The two status reads every engine offers; the routed service of either engine satisfies it. */
export type StatusReader = {
	checkBitstringStatusList(did: string, entry: never, customer: CustomerEntity): Promise<unknown>;
	checkStatusList2021(did: string, options: never, customer: CustomerEntity): Promise<unknown>;
};

type Entry = Record<string, unknown>;

async function decode(credential: unknown): Promise<{ issuer: string; entries: Entry[] } | null> {
	const body = (typeof credential === 'string' ? await Cheqd.decodeCredentialJWT(credential) : credential) as Record<
		string,
		unknown
	> | null;
	if (!body || typeof body !== 'object') return null;
	const issuerValue = body.issuer as string | { id?: string } | undefined;
	const issuer = typeof issuerValue === 'string' ? issuerValue : issuerValue?.id;
	if (!issuer) return null;
	const status = body.credentialStatus;
	const entries = (Array.isArray(status) ? status : status ? [status] : []) as Entry[];
	return { issuer, entries };
}

/**
 * Reads the credential's current status before a revoke, suspend or reinstate and answers 409 when the change
 * would do nothing (or would undo a revocation). Neither engine reports every such case itself: on a
 * StatusList2021 list the Veramo plugin answers `{ revoked: true }` for a credential that was already revoked, and
 * on a Bitstring list both engines would move a revoked credential back to valid or suspended. The read goes to the
 * same engine that would make the change.
 *
 * Returns null whenever the status cannot be read (an undecodable credential, no status entry, an encrypted list,
 * a read that fails): the update then runs and reports its own outcome.
 */
export async function statusUpdateConflict(
	action: StatusUpdateAction,
	credential: unknown,
	listType: string,
	reader: Partial<StatusReader>,
	customer: CustomerEntity,
	symmetricKey?: string
): Promise<StatusUpdateFailure | null> {
	// An encrypted list needs the key and a threshold decryption to read; leave it to the update
	if (symmetricKey) return null;
	try {
		const decoded = await decode(credential);
		if (!decoded) return null;
		const { issuer, entries } = decoded;

		if (listType === 'BitstringStatusList') {
			const entry = entries.find((e) => e.type === 'BitstringStatusListEntry');
			if (!entry || !reader.checkBitstringStatusList) return null;
			const read = await reader.checkBitstringStatusList(issuer, entry as never, customer);
			if (!read || Array.isArray(read)) return null;
			const value = (read as { status?: unknown }).status;
			const current: CurrentStatus | undefined =
				value === 0 ? 'valid' : value === 1 ? 'revoked' : value === 2 ? 'suspended' : undefined;
			return current ? statusTransitionConflict(action, current) : null;
		}

		const purpose = action === 'revoke' ? 'revocation' : 'suspension';
		const entry = entries.find((e) => e.type === 'StatusList2021Entry' && e.statusPurpose === purpose);
		if (!entry || !reader.checkStatusList2021) return null;
		const listUrl = String(entry.statusListCredential ?? entry.id ?? '').split('#')[0];
		const statusListName = new URL(listUrl).searchParams.get('resourceName');
		if (!statusListName) return null;
		const read = (await reader.checkStatusList2021(
			issuer,
			{ statusListName, statusPurpose: purpose, statusListIndex: entry.statusListIndex } as never,
			customer
		)) as { revoked?: unknown; suspended?: unknown } | null;
		const set = purpose === 'revocation' ? read?.revoked : read?.suspended;
		if (typeof set !== 'boolean') return null;
		// A StatusList2021 credential keeps revocation and suspension on separate lists
		const current: CurrentStatus = set ? (purpose === 'revocation' ? 'revoked' : 'suspended') : 'valid';
		return statusTransitionConflict(action, current);
	} catch {
		return null;
	}
}

/** The response body for a refused status change: the message, plus the stable `code` when there is one. */
export function statusFailureBody(failure: StatusUpdateFailure): { error: string; code?: StatusUpdateConflictCode } {
	return failure.code ? { error: failure.error, code: failure.code } : { error: failure.error };
}
