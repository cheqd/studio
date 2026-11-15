import { Connection } from '../../../database/connection/connection.js';
import { EngineRoutingUnavailableError, isMissingSchemaError, logRoutingFailure } from './errors.js';
import type { ArtifactRef } from './types.js';

/**
 * Finds the artifact an operation acts on, so the router can use the engine recorded on it (engine spec 4.1.1).
 * Callers know a DID and a status-list name, or a credential, but not the `statusRegistry.registryId`. These
 * helpers do that lookup. With no external database, no row, or a schema that predates the table, they return
 * `undefined`, which the router reads as "no existing artifact". A query that FAILS is different: the artefact may
 * be recorded as Credo, so the lookup throws `EngineRoutingUnavailableError` (503) rather than let the router
 * answer with the default engine.
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
	} catch (error) {
		if (isMissingSchemaError(error)) return undefined;
		logRoutingFailure('artifact', error);
		throw new EngineRoutingUnavailableError(undefined, error);
	}
}

type CredentialLike = object | string | undefined | null;

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
 * The issuer DID and status-list name a credential's status entry points at. Accepts a credential object or a
 * compact JWT; for a list of credentials the first one decides. Anything that cannot be read gives `undefined`.
 */
export function statusListReference(
	credential: CredentialLike | CredentialLike[]
): { issuer: string; resourceName: string } | undefined {
	try {
		const first = Array.isArray(credential) ? credential[0] : credential;
		const decoded = typeof first === 'string' ? decodeJwtPayload(first) : asRecord(first);
		if (!decoded) return undefined;
		const body = asRecord(decoded.vc) ?? decoded;

		const issuerRaw = body.issuer ?? decoded.iss;
		const issuer = typeof issuerRaw === 'string' ? issuerRaw : asRecord(issuerRaw)?.id;
		const entries = Array.isArray(body.credentialStatus) ? body.credentialStatus : [body.credentialStatus];
		for (const entry of entries) {
			const status = asRecord(entry);
			const location = status?.statusListCredential ?? status?.id;
			if (typeof issuer !== 'string' || typeof location !== 'string') continue;
			const resourceName = new URL(location).searchParams.get('resourceName');
			if (resourceName) return { issuer, resourceName };
		}
	} catch {
		/* best effort */
	}
	return undefined;
}

/** The status list a credential points at, as `statusRegistry.registryId`. */
export async function statusListArtifactFromCredential(
	credential: CredentialLike | CredentialLike[],
	customerId?: string
): Promise<ArtifactRef | undefined> {
	if (!usesPostgres()) return undefined;
	const reference = statusListReference(credential);
	return reference ? statusListArtifact(reference.issuer, reference.resourceName, customerId) : undefined;
}
