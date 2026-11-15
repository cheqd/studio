import { StatusCodes } from 'http-status-codes';

export type StatusUpdateAction = 'revoke' | 'suspend' | 'reinstate';

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

export type StatusUpdateFailure = { statusCode: number; error: string };

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
	if (value === TARGET_VALUE[action]) {
		return {
			statusCode: StatusCodes.CONFLICT,
			error: `Nothing was changed: the credential is already ${PAST_TENSE[action]}`,
		};
	}
	return {
		statusCode: errorMessage ? StatusCodes.BAD_REQUEST : StatusCodes.INTERNAL_SERVER_ERROR,
		error: `The credential was not ${PAST_TENSE[action]}: the status list was not updated${errorMessage ? `: ${errorMessage}` : ''}. The status list may be recorded against the wrong engine; contact support if this persists`,
	};
}
