import { createPublicKey, verify as cryptoVerify, ECDH, type JsonWebKey, type KeyObject } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import { bases } from 'multiformats/basics';

/**
 * Pure helpers for Token Status Lists (draft-ietf-oauth-status-list): read a list, and check that it was signed by
 * the DID that owns it. Nothing here touches the network or Credo, so every rule is testable on its own. The engine
 * (`status-lists.ts`) supplies the bytes and the DID resolution.
 *
 * Writing a list is Credo's job (the `tokenStatusList` module signs and updates it); reading must not trust Credo
 * to have fetched or checked anything, because `getTokenStatus` runs for lists issued by other tenants and by
 * other parties entirely.
 */

/** Most the decompressed list may be. A 2 bit list of 16 million entries is 4 MiB; this leaves room, not a bomb. */
export const MAX_STATUS_LIST_BYTES = 16 * 1024 * 1024;

export interface DecodedStatusListToken {
	header: { alg?: string; typ?: string; kid?: string; [name: string]: unknown };
	payload: {
		iss?: string;
		sub?: string;
		iat?: number;
		exp?: number;
		ttl?: number;
		status_list?: { bits?: number; lst?: string };
		[name: string]: unknown;
	};
	signingInput: Uint8Array;
	signature: Uint8Array;
}

const b64urlToBytes = (value: string): Uint8Array => new Uint8Array(Buffer.from(value, 'base64url'));

/** Splits a compact JWS and parses its header and payload. Throws on anything that is not a three part JWT. */
export function decodeStatusListToken(jwt: string): DecodedStatusListToken {
	const parts = jwt.trim().split('.');
	if (parts.length !== 3 || parts.some((part) => part.length === 0)) throw new Error('not a compact JWS');
	const parse = (part: string) => {
		const value = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
		if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('not an object');
		return value;
	};
	return {
		header: parse(parts[0]),
		payload: parse(parts[1]),
		signingInput: new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
		signature: b64urlToBytes(parts[2]),
	};
}

export interface StatusListBits {
	bits: 1 | 2 | 4 | 8;
	bytes: Uint8Array;
}

/** Reads `status_list` (`bits` and the zlib compressed `lst`) of a decoded token. */
export function readStatusList(payload: DecodedStatusListToken['payload']): StatusListBits {
	const list = payload.status_list;
	if (!list || typeof list.lst !== 'string') throw new Error('no status_list');
	if (list.bits !== 1 && list.bits !== 2 && list.bits !== 4 && list.bits !== 8) throw new Error('invalid bits');
	const bytes = inflateSync(new Uint8Array(Buffer.from(list.lst, 'base64url')), {
		maxOutputLength: MAX_STATUS_LIST_BYTES,
	});
	return { bits: list.bits, bytes: new Uint8Array(bytes) };
}

/** The status at `index`. The first entry of a byte is in its least significant bits (draft-ietf-oauth-status-list). */
export function statusAt({ bits, bytes }: StatusListBits, index: number): number {
	if (!Number.isInteger(index) || index < 0 || ((index + 1) * bits + 7) >> 3 > bytes.length) {
		throw new RangeError('index out of range');
	}
	const bitOffset = index * bits;
	return (bytes[bitOffset >> 3] >> (bitOffset & 7)) & ((1 << bits) - 1);
}

// ------------------------------------------------------------------------------------------- verification

interface VerificationMethodLike {
	id?: string;
	type?: string;
	controller?: string;
	publicKeyJwk?: JsonWebKey;
	publicKeyMultibase?: string;
	publicKeyBase58?: string;
}

interface DidDocumentLike {
	id?: string;
	verificationMethod?: VerificationMethodLike[];
	assertionMethod?: (string | VerificationMethodLike)[];
	authentication?: (string | VerificationMethodLike)[];
}

const absolute = (did: string, id: string) => (id.startsWith('#') ? `${did}${id}` : id);

/**
 * The verification method a token names in its `kid`, only if the DID document lists it for assertion or
 * authentication. A key that is merely in `verificationMethod` is not authorised to sign statements.
 */
export function findSigningMethod(
	document: DidDocumentLike,
	did: string,
	kid: string | undefined
): VerificationMethodLike | undefined {
	if (!kid) return undefined;
	const wanted = absolute(did, kid);
	if (wanted.split('#')[0] !== did) return undefined;
	const matches = (entry: string | VerificationMethodLike) =>
		absolute(did, typeof entry === 'string' ? entry : (entry.id ?? '')) === wanted;
	const listed = [...(document.assertionMethod ?? []), ...(document.authentication ?? [])];
	if (!listed.some(matches)) return undefined;
	const embedded = listed.find(
		(entry): entry is VerificationMethodLike => typeof entry !== 'string' && matches(entry)
	);
	return embedded ?? document.verificationMethod?.find((method) => absolute(did, method.id ?? '') === wanted);
}

const ED25519_MULTICODEC = [0xed, 0x01];
const P256_MULTICODEC = [0x80, 0x24];

/** A Node public key for the verification method, or null when its key type is not one Studio signs lists with. */
export function publicKeyOf(method: VerificationMethodLike): KeyObject | null {
	try {
		if (method.publicKeyJwk) {
			const { kty, crv } = method.publicKeyJwk;
			if (!((kty === 'EC' && crv === 'P-256') || (kty === 'OKP' && crv === 'Ed25519'))) return null;
			return createPublicKey({ key: method.publicKeyJwk, format: 'jwk' });
		}
		let raw: Uint8Array | undefined;
		if (method.publicKeyMultibase) raw = bases.base58btc.decode(method.publicKeyMultibase);
		else if (method.publicKeyBase58) raw = bases.base58btc.decode(`z${method.publicKeyBase58}`);
		if (!raw) return null;

		if (method.publicKeyBase58 && raw.length === 32) return ed25519Key(raw);
		if (raw[0] === ED25519_MULTICODEC[0] && raw[1] === ED25519_MULTICODEC[1] && raw.length === 34) {
			return ed25519Key(raw.slice(2));
		}
		if (raw[0] === P256_MULTICODEC[0] && raw[1] === P256_MULTICODEC[1] && raw.length === 35) {
			const uncompressed = ECDH.convertKey(
				new Uint8Array(raw.slice(2)),
				'prime256v1',
				undefined,
				undefined,
				'uncompressed'
			);
			return createPublicKey({
				key: {
					kty: 'EC',
					crv: 'P-256',
					x: (uncompressed as Buffer).subarray(1, 33).toString('base64url'),
					y: (uncompressed as Buffer).subarray(33, 65).toString('base64url'),
				},
				format: 'jwk',
			});
		}
		return null;
	} catch {
		return null;
	}
}

function ed25519Key(raw: Uint8Array): KeyObject {
	return createPublicKey({
		key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(raw).toString('base64url') },
		format: 'jwk',
	});
}

/** Checks the signature with the key; the algorithm must be the one the key's type allows (no `alg` confusion). */
export function verifySignature(token: DecodedStatusListToken, key: KeyObject): boolean {
	const { alg } = token.header;
	try {
		if (alg === 'ES256' && key.asymmetricKeyType === 'ec') {
			return cryptoVerify('sha256', token.signingInput, { key, dsaEncoding: 'ieee-p1363' }, token.signature);
		}
		if (alg === 'EdDSA' && key.asymmetricKeyType === 'ed25519') {
			return cryptoVerify(null, token.signingInput, key, token.signature);
		}
	} catch {
		return false;
	}
	return false;
}
