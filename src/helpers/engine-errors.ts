import type { Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { LedgerUnavailableError } from '../services/identity/ledger-lock.js';
import { EngineNotImplementedError } from '../services/identity/engine/credo-engine.js';
import { EngineGoneError, EngineRoutingUnavailableError } from '../services/identity/engine/errors.js';
import {
	CredoConfigurationError,
	CredoNotSupportedError,
	CredoOwnershipError,
	CredoTenantMissingError,
	NotImplementedByEngineError,
} from '../services/identity/engine/credo/errors.js';

/** What a typed engine failure becomes on the wire. `error` is safe to show: no stack, no internal text. */
export interface MappedEngineError {
	status: number;
	error: string;
	/** Machine-readable code; absent only where an older route never had one. */
	code?: string;
	/** Seconds, for a retryable 503 (sent as `Retry-After`). */
	retryAfterSeconds?: number;
}

/**
 * Maps the typed errors the identity engines and the router raise to their HTTP answer, in one place for every
 * controller (engine spec 3.3). Returns undefined for anything else, so the caller keeps its own handling (usually
 * a 500). Only failures that are really the caller's or a retryable condition change status; the body keeps the
 * `{ error }` envelope the legacy routes use and adds `code`.
 *
 *   LedgerUnavailable / EngineRoutingUnavailable -> 503 + Retry-After (nothing was written)
 *   Gone                                          -> 410
 *   NotSupported                                  -> 501
 *   NotImplementedByEngine                        -> 501, without naming the method
 *   CredoOwnershipError                           -> 404 (the same answer for "not yours" and "does not exist")
 *   CredoConfigurationError                       -> 503, without the variable names (they are logged)
 *   CredoTenantMissing                            -> 500, as before
 */
export function mapEngineError(error: unknown): MappedEngineError | undefined {
	if (error instanceof LedgerUnavailableError) {
		return {
			status: StatusCodes.SERVICE_UNAVAILABLE,
			code: error.code,
			// The message of an idempotent write names the key to retry with; the plain one names the payer account
			error: error.idempotencyKey
				? error.message
				: 'The ledger is busy for this account. Nothing was written; retry shortly.',
			retryAfterSeconds: error.retryAfterSeconds,
		};
	}
	if (error instanceof EngineRoutingUnavailableError) {
		return {
			status: StatusCodes.SERVICE_UNAVAILABLE,
			code: error.code,
			error: error.message,
			retryAfterSeconds: error.retryAfterSeconds,
		};
	}
	if (error instanceof EngineGoneError) return { status: StatusCodes.GONE, code: error.code, error: error.message };
	if (error instanceof CredoNotSupportedError) {
		return { status: StatusCodes.NOT_IMPLEMENTED, code: error.code, error: error.message };
	}
	if (error instanceof NotImplementedByEngineError || error instanceof EngineNotImplementedError) {
		return {
			status: StatusCodes.NOT_IMPLEMENTED,
			code: 'NotImplemented',
			error: 'This operation is not available yet for the identity engine of this account.',
		};
	}
	if (error instanceof CredoOwnershipError) {
		return { status: StatusCodes.NOT_FOUND, code: 'not_found', error: error.message };
	}
	if (error instanceof CredoConfigurationError) {
		console.error(`Identity engine is not configured: ${error.problems.join('; ')}`);
		return {
			status: StatusCodes.SERVICE_UNAVAILABLE,
			code: 'engine_unavailable',
			error: 'The identity engine for this account is not available. Contact support.',
		};
	}
	if (error instanceof CredoTenantMissingError) {
		console.error(
			`Request failed: customer.credoTenantId points at Credo tenant ${error.tenantId}, which is missing from the Askar store. It was not recreated.`
		);
		return { status: error.status, code: error.code, error: error.message };
	}
	return undefined;
}

/**
 * Sends the mapped answer for a typed engine error and returns the response, or returns undefined for any other
 * error. Call it first in a controller's `catch`; it also covers the Credo "tenant missing" answer.
 */
export function engineErrorResponse(response: Response, error: unknown): Response | undefined {
	const mapped = mapEngineError(error);
	if (!mapped) return undefined;
	if (mapped.retryAfterSeconds !== undefined) response.setHeader?.('Retry-After', String(mapped.retryAfterSeconds));
	return response.status(mapped.status).json({ error: mapped.error, ...(mapped.code ? { code: mapped.code } : {}) });
}
