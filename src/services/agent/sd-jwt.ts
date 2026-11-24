import { randomBytes } from 'node:crypto';
import { SDJwtInstance } from '@sd-jwt/core';
import { sha256Hasher } from '@cheqd/agent-identity-ap2';
import { fromString, toString } from 'uint8arrays';
import type { EngineSigningAlg } from '../identity/engine/types.js';

export interface DidSigner {
	did: string;
	kid: string;
	alg: EngineSigningAlg;
	sign(data: Uint8Array): Promise<Uint8Array>;
}

/**
 * Issues an SD-JWT VC signed by a DID key held in the engine. The private key stays in the engine: it is handed
 * the signing input and returns the signature. `claims` must already carry `iss`, `vct` and the rest; nothing is
 * made selectively disclosable (the issued token is the signed JWT and an empty disclosure list).
 */
export async function issueSdJwtVc(signer: DidSigner, claims: Record<string, unknown>): Promise<string> {
	const instance = new SDJwtInstance<Record<string, unknown>>({
		signer: async (data: string) => toString(await signer.sign(fromString(data)), 'base64url'),
		signAlg: signer.alg,
		hasher: sha256Hasher,
		hashAlg: 'sha-256',
		saltGenerator: (length: number) => randomBytes(length).toString('base64url'),
	});
	return instance.issue(claims, undefined, { header: { typ: 'dc+sd-jwt', kid: signer.kid } });
}

export interface DecodedSdJwt {
	header: Record<string, unknown>;
	payload: Record<string, unknown>;
}

/** Reads the issuer-signed JWT of an SD-JWT without verifying it. Use only to find out whom to verify against. */
export function decodeSdJwtUnverified(compact: string): DecodedSdJwt | null {
	const jwt = compact.split('~')[0] ?? '';
	const parts = jwt.split('.');
	if (parts.length !== 3) return null;
	try {
		const header = JSON.parse(toString(fromString(parts[0] as string, 'base64url')));
		const payload = JSON.parse(toString(fromString(parts[1] as string, 'base64url')));
		if (typeof header !== 'object' || header === null || typeof payload !== 'object' || payload === null)
			return null;
		return { header, payload };
	} catch {
		return null;
	}
}
