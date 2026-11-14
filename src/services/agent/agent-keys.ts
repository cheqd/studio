import { ECDH, createPublicKey } from 'node:crypto';
import { concat, fromString, toString } from 'uint8arrays';
import { base58btc } from 'multiformats/bases/base58';
import type { AgentNetwork } from '../../types/agent.js';
import type { EngineDidDocument } from '../identity/engine/types.js';

export type PublicJwk = Record<string, unknown> & { kty: string };

const b64url = (bytes: Uint8Array) => toString(bytes, 'base64url');
const fromHex = (hex: string): Uint8Array => fromString(hex.replace(/^0x/, ''), 'base16');

/** P-256 public key as a JWK, from the hex the engine reports: compressed (33 bytes), uncompressed (65) or raw x||y (64). */
export function p256JwkFromPublicKeyHex(publicKeyHex: string): PublicJwk {
	const bytes = fromHex(publicKeyHex);
	let uncompressed: Uint8Array;
	if (bytes.length === 64) {
		uncompressed = concat([Uint8Array.of(0x04), bytes]);
	} else if (bytes.length === 65 && bytes[0] === 0x04) {
		uncompressed = bytes;
	} else if (bytes.length === 33 && (bytes[0] === 0x02 || bytes[0] === 0x03)) {
		uncompressed = new Uint8Array(
			ECDH.convertKey(bytes as never, 'prime256v1', undefined, undefined, 'uncompressed') as unknown as Uint8Array
		);
	} else {
		throw new Error(`Unsupported P-256 public key length: ${bytes.length}`);
	}
	return {
		kty: 'EC',
		crv: 'P-256',
		x: b64url(uncompressed.subarray(1, 33)),
		y: b64url(uncompressed.subarray(33, 65)),
	};
}

/** Ed25519 public key (32 bytes hex) as a multibase string with the 0xed01 multicodec prefix (`z6Mk...`). */
export function ed25519MultibaseFromPublicKeyHex(publicKeyHex: string): string {
	const raw = fromHex(publicKeyHex);
	if (raw.length !== 32) throw new Error(`Unsupported Ed25519 public key length: ${raw.length}`);
	return base58btc.encode(concat([Uint8Array.of(0xed, 0x01), raw]));
}

/** Ed25519 public key as a JWK, from a multibase string (the inverse of the function above) or raw JWK parts. */
export function ed25519JwkFromMultibase(multibase: string): PublicJwk {
	const decoded = base58btc.decode(multibase);
	if (decoded.length !== 34 || decoded[0] !== 0xed || decoded[1] !== 0x01) {
		throw new Error('Not an Ed25519 multibase key');
	}
	return { kty: 'OKP', crv: 'Ed25519', x: b64url(decoded.subarray(2)) };
}

export interface AgentDidDocumentInput {
	network: AgentNetwork;
	/** The method-specific id (a UUID). */
	id: string;
	p256PublicKeyHex: string;
	ed25519PublicKeyHex: string;
}

export const AGENT_P256_FRAGMENT = 'key-1';
export const AGENT_ED25519_FRAGMENT = 'key-2';

/**
 * The agent's DID document (keys-and-formats decision, D1): a P-256 key as the default signing method and an
 * Ed25519 key beside it. The ledger still takes the on-chain names (`JsonWebKey2020` and
 * `Ed25519VerificationKey2020`); the resolver maps them to `JsonWebKey` and `Multikey` on the way out.
 */
export function buildAgentDidDocument(input: AgentDidDocumentInput): EngineDidDocument {
	const did = `did:cheqd:${input.network}:${input.id}`;
	const p256 = `${did}#${AGENT_P256_FRAGMENT}`;
	const ed25519 = `${did}#${AGENT_ED25519_FRAGMENT}`;
	return {
		'@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/suites/jws-2020/v1'],
		id: did,
		controller: [did],
		verificationMethod: [
			{
				id: p256,
				type: 'JsonWebKey2020',
				controller: did,
				publicKeyJwk: p256JwkFromPublicKeyHex(input.p256PublicKeyHex),
			},
			{
				id: ed25519,
				type: 'Ed25519VerificationKey2020',
				controller: did,
				publicKeyMultibase: ed25519MultibaseFromPublicKeyHex(input.ed25519PublicKeyHex),
			},
		],
		// P-256 first: it is the default signing key.
		authentication: [p256, ed25519],
		assertionMethod: [p256, ed25519],
	};
}

export interface ResolvedAgentKey {
	/** Full DID URL of the verification method. */
	kid: string;
	alg: 'ES256' | 'EdDSA';
	jwk: PublicJwk;
}

export interface VerificationMethodLike {
	id?: unknown;
	publicKeyJwk?: Record<string, unknown>;
	publicKeyMultibase?: unknown;
}

/** Reads a verification method as a key this service can sign or verify with. Returns null for anything else. */
export function keyFromVerificationMethod(did: string, method: VerificationMethodLike): ResolvedAgentKey | null {
	if (typeof method.id !== 'string') return null;
	const kid = method.id.startsWith('#') ? `${did}${method.id}` : method.id;
	const jwk = method.publicKeyJwk;
	if (jwk && jwk.kty === 'EC' && jwk.crv === 'P-256') return { kid, alg: 'ES256', jwk: jwk as PublicJwk };
	if (jwk && jwk.kty === 'OKP' && jwk.crv === 'Ed25519') return { kid, alg: 'EdDSA', jwk: jwk as PublicJwk };
	if (typeof method.publicKeyMultibase === 'string') {
		try {
			return { kid, alg: 'EdDSA', jwk: ed25519JwkFromMultibase(method.publicKeyMultibase) };
		} catch {
			return null;
		}
	}
	return null;
}

/** All keys of a DID document, P-256 first (the default signing key). */
export function keysFromDidDocument(document: EngineDidDocument): ResolvedAgentKey[] {
	const methods = (document.verificationMethod as VerificationMethodLike[] | undefined) ?? [];
	const keys = methods
		.map((method) => keyFromVerificationMethod(document.id, method))
		.filter((key): key is ResolvedAgentKey => key !== null);
	return [...keys.filter((k) => k.alg === 'ES256'), ...keys.filter((k) => k.alg === 'EdDSA')];
}

/** Sanity check that a JWK is importable by Node (used before a key is trusted for verification). */
export function isImportableJwk(jwk: Record<string, unknown>): boolean {
	try {
		createPublicKey({ key: jwk as never, format: 'jwk' });
		return true;
	} catch {
		return false;
	}
}

// --- Key listing, rotation and addition ------------------------------------------------------------------

export type AgentKeyType = 'Ed25519' | 'P-256';

/** The DID document relationships a verification method can be listed under. */
const RELATIONSHIPS = ['authentication', 'assertionMethod', 'capabilityInvocation', 'capabilityDelegation'] as const;

const entryId = (entry: unknown): string | undefined =>
	typeof entry === 'string' ? entry : ((entry as { id?: string } | null)?.id ?? undefined);

/** The full DID URL of a reference that may be relative (`#key-1`). */
const absolute = (did: string, id: string) => (id.startsWith('#') ? `${did}${id}` : id);

/** The ids listed under a relationship, as full DID URLs. */
export function relationshipIds(document: EngineDidDocument, relationship: (typeof RELATIONSHIPS)[number]): string[] {
	const listed = document[relationship];
	if (!Array.isArray(listed)) return [];
	return listed
		.map(entryId)
		.filter((id): id is string => typeof id === 'string')
		.map((id) => absolute(document.id, id));
}

/** P-256 public key as multibase (`zDn...`, compressed point with the 0x8024 multicodec prefix). */
export function p256MultibaseFromJwk(jwk: Record<string, unknown>): string {
	const x = fromString(String(jwk.x), 'base64url');
	const y = fromString(String(jwk.y), 'base64url');
	const prefix = (y[y.length - 1] as number) % 2 === 0 ? 0x02 : 0x03;
	return base58btc.encode(concat([Uint8Array.of(0x80, 0x24, prefix), x]));
}

export function publicKeyMultibaseFor(key: ResolvedAgentKey): string {
	if (key.alg === 'EdDSA')
		return base58btc.encode(concat([Uint8Array.of(0xed, 0x01), fromString(String(key.jwk.x), 'base64url')]));
	return p256MultibaseFromJwk(key.jwk);
}

/** The next free `#key-N` fragment of a DID document (`key-3` when `key-1` and `key-2` exist). */
export function nextKeyFragment(document: EngineDidDocument): string {
	const methods = (document.verificationMethod as VerificationMethodLike[] | undefined) ?? [];
	let highest = 0;
	for (const method of methods) {
		const match = typeof method.id === 'string' ? /#key-(\d+)$/.exec(method.id) : null;
		if (match) highest = Math.max(highest, Number(match[1]));
	}
	return `key-${highest + 1}`;
}

/** The ledger takes the on-chain method type names; a resolved document may carry the resolver's names. */
function onChainMethod(method: Record<string, unknown>): Record<string, unknown> {
	if (method.type === 'JsonWebKey') return { ...method, type: 'JsonWebKey2020' };
	if (method.type === 'Multikey') return { ...method, type: 'Ed25519VerificationKey2020' };
	return method;
}

export interface NewDidKey {
	fragment: string;
	type: AgentKeyType;
	publicKeyHex: string;
}

/**
 * A copy of the DID document with one more verification method.
 *  - `replaces`: the new key takes the old key's place in every relationship that listed it, and the old method
 *    stays in `verificationMethod` so credentials issued before the rotation can still be verified.
 *  - no `replaces`: the key is added to `authentication` and `assertionMethod`.
 * Everything else (services, controllers, other methods) is kept as resolved.
 */
export function documentWithNewKey(document: EngineDidDocument, key: NewDidKey, replaces?: string): EngineDidDocument {
	const did = document.id;
	const kid = `${did}#${key.fragment}`;
	const method: Record<string, unknown> =
		key.type === 'P-256'
			? {
					id: kid,
					type: 'JsonWebKey2020',
					controller: did,
					publicKeyJwk: p256JwkFromPublicKeyHex(key.publicKeyHex),
				}
			: {
					id: kid,
					type: 'Ed25519VerificationKey2020',
					controller: did,
					publicKeyMultibase: ed25519MultibaseFromPublicKeyHex(key.publicKeyHex),
				};
	const next: EngineDidDocument = {
		...document,
		verificationMethod: [
			...((document.verificationMethod as Record<string, unknown>[] | undefined) ?? []).map(onChainMethod),
			method,
		],
	};
	for (const relationship of RELATIONSHIPS) {
		const listed = document[relationship];
		if (replaces) {
			if (!Array.isArray(listed)) continue;
			next[relationship] = listed.map((entry) => {
				const id = entryId(entry);
				return id !== undefined && absolute(did, id) === replaces ? kid : entry;
			});
		} else if (relationship === 'authentication' || relationship === 'assertionMethod') {
			next[relationship] = [...(Array.isArray(listed) ? listed : []), kid];
		}
	}
	return next;
}
