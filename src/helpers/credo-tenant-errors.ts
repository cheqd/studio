import type { Response } from 'express';
import { CredoTenantMissingError } from '../services/identity/engine/credo/errors.js';

/**
 * If `error` is the Credo "tenant record missing" failure, answers `500 { error, code: 'credo_tenant_missing' }` (a
 * fixed message that names no id) and logs the tenant id server-side, then returns the response. Returns undefined
 * for any other error, so the caller keeps its own handling. Shared by the agent routes and every other route that
 * reaches the Credo engine, so the operator sees one body and one log line wherever it happens.
 */
export function credoTenantMissingResponse(response: Response, error: unknown): Response | undefined {
	if (!(error instanceof CredoTenantMissingError)) return undefined;
	// Operator problem, not the caller's: say so specifically and log what is needed to fix it.
	console.error(
		`Request failed: customer.credoTenantId points at Credo tenant ${error.tenantId}, which is missing from the Askar store. It was not recreated.`
	);
	return response.status(error.status).json({ error: error.message, code: error.code });
}
