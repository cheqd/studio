import { StatusCodes } from 'http-status-codes';

/** A caller-supplied API key that is unknown, does not match, or has been revoked. */
export class InvalidAPIKeyError extends Error {
	constructor(message = 'Invalid API key') {
		super(message);
		this.name = 'InvalidAPIKeyError';
	}
}

/**
 * Maps a failure while verifying an API key to a response. A bad key is the caller's problem (401); anything else is
 * ours (500), and its details stay in the server log rather than the response body.
 */
export function apiKeyVerificationFailure(error: unknown): { status: number; error: string } {
	if (error instanceof InvalidAPIKeyError) {
		return { status: StatusCodes.UNAUTHORIZED, error: `Unauthorized error: ${error.message}.` };
	}
	return { status: StatusCodes.INTERNAL_SERVER_ERROR, error: 'Internal error: Could not verify the API key.' };
}
