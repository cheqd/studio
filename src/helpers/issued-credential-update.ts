/**
 * Allow-list for `PUT /credentials/issued/:id`.
 *
 * Only these fields may be changed by a caller. Everything else on the record (engine, status format, customer,
 * identifiers, status registry and so on) is controlled by the server and is rejected, not ignored, so a client
 * that sends it learns that it had no effect.
 */

export const UPDATABLE_ISSUED_CREDENTIAL_STATUSES = ['issued', 'suspended', 'revoked'] as const;

export interface ValidatedIssuedCredentialUpdate {
	providerCredentialId?: string;
	status?: (typeof UPDATABLE_ISSUED_CREDENTIAL_STATUSES)[number];
	metadata?: Record<string, unknown>;
}

export type IssuedCredentialUpdateResult =
	| { ok: true; value: ValidatedIssuedCredentialUpdate }
	| { ok: false; error: string };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

export function validateIssuedCredentialUpdate(body: unknown): IssuedCredentialUpdateResult {
	if (!isPlainObject(body)) return { ok: false, error: 'Request body must be a JSON object' };

	// `providerMetadata` is the documented name; it is stored in the `metadata` column
	const allowed = new Set(['providerCredentialId', 'status', 'providerMetadata', 'metadata']);
	const unknown = Object.keys(body).filter((key) => !allowed.has(key));
	if (unknown.length > 0) return { ok: false, error: `Unsupported field(s): ${unknown.join(', ')}` };
	if ('providerMetadata' in body && 'metadata' in body) {
		return { ok: false, error: 'Send either providerMetadata or metadata, not both' };
	}

	const value: ValidatedIssuedCredentialUpdate = {};

	if ('providerCredentialId' in body) {
		const id = body.providerCredentialId;
		if (typeof id !== 'string' || id.length === 0 || id.length > 2048) {
			return { ok: false, error: 'providerCredentialId must be a non-empty string of at most 2048 characters' };
		}
		value.providerCredentialId = id;
	}

	if ('status' in body) {
		const status = body.status;
		if (!UPDATABLE_ISSUED_CREDENTIAL_STATUSES.includes(status as never)) {
			return { ok: false, error: `status must be one of: ${UPDATABLE_ISSUED_CREDENTIAL_STATUSES.join(', ')}` };
		}
		value.status = status as ValidatedIssuedCredentialUpdate['status'];
	}

	const metadata = 'providerMetadata' in body ? body.providerMetadata : body.metadata;
	if ('providerMetadata' in body || 'metadata' in body) {
		if (!isPlainObject(metadata)) return { ok: false, error: 'providerMetadata must be an object' };
		value.metadata = metadata;
	}

	return { ok: true, value };
}
