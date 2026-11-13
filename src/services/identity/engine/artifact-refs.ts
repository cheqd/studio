import { Connection } from '../../../database/connection/connection.js';
import type { ArtifactRef } from './types.js';

/**
 * Finds the artifact an operation acts on, so the router can use the engine recorded on it (engine spec 4.1.1).
 * Callers know a DID and a status-list name, or a credential, but not the `statusRegistry.registryId`. These
 * helpers do that lookup. Every one of them is best effort: with no external database, no row, or a failing query
 * they return `undefined`, which the router reads as "no existing artifact" and answers with the default engine.
 * They never throw and never make a request fail.
 */

const usesPostgres = () => process.env.ENABLE_EXTERNAL_DB === 'true';

export function didArtifact(did: string | undefined): ArtifactRef | undefined {
	return did ? { kind: 'did', id: did } : undefined;
}

export function credentialArtifact(issuedCredentialId: string | undefined): ArtifactRef | undefined {
	return issuedCredentialId ? { kind: 'credential', id: issuedCredentialId } : undefined;
}

/** The newest status list of `did` with this name, as `statusRegistry.registryId`. */
export async function statusListArtifact(
	did: string | undefined,
	statusListName: string | undefined,
	customerId?: string
): Promise<ArtifactRef | undefined> {
	if (!usesPostgres() || !did || !statusListName) return undefined;
	try {
		const rows: { registryId?: string }[] = customerId
			? await Connection.instance.dbConnection.query(
					`SELECT "registryId" FROM "statusRegistry" WHERE "issuerId" = $1 AND "registryName" = $2 AND "customerId" = $3 ORDER BY "createdAt" DESC LIMIT 1`,
					[did, statusListName, customerId]
				)
			: await Connection.instance.dbConnection.query(
					`SELECT "registryId" FROM "statusRegistry" WHERE "issuerId" = $1 AND "registryName" = $2 ORDER BY "createdAt" DESC LIMIT 1`,
					[did, statusListName]
				);
		const registryId = rows[0]?.registryId;
		return registryId ? { kind: 'status-list', id: registryId } : undefined;
	} catch {
		return undefined;
	}
}

type CredentialLike = Record<string, unknown> | string | undefined | null;

function decodeJwtPayload(jwt: string): Record<string, unknown> | undefined {
	try {
		const payload = jwt.split('.')[1];
		if (!payload) return undefined;
		return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
	} catch {
		return undefined;
	}
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

/**
 * The status list a credential points at, found from its issuer and the `resourceName` in its status entry.
 * Accepts a credential object or a compact JWT; for a list of credentials the first one decides. Anything that
 * cannot be read gives `undefined`.
 */
export async function statusListArtifactFromCredential(
	credential: CredentialLike | CredentialLike[],
	customerId?: string
): Promise<ArtifactRef | undefined> {
	if (!usesPostgres()) return undefined;
	try {
		const first = Array.isArray(credential) ? credential[0] : credential;
		let body = typeof first === 'string' ? decodeJwtPayload(first) : asRecord(first);
		if (!body) return undefined;
		body = asRecord(body.vc) ?? body;

		const issuerRaw = body.issuer ?? (typeof first === 'string' ? decodeJwtPayload(first)?.iss : undefined);
		const issuer = typeof issuerRaw === 'string' ? issuerRaw : asRecord(issuerRaw)?.id;
		const entries = Array.isArray(body.credentialStatus) ? body.credentialStatus : [body.credentialStatus];
		for (const entry of entries) {
			const status = asRecord(entry);
			const location = status?.statusListCredential ?? status?.id;
			if (typeof issuer !== 'string' || typeof location !== 'string') continue;
			const resourceName = new URL(location).searchParams.get('resourceName');
			if (resourceName) return await statusListArtifact(issuer, resourceName, customerId);
		}
	} catch {
		/* best effort */
	}
	return undefined;
}
