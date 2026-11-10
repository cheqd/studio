import { createECDH, createPrivateKey, createPublicKey } from 'node:crypto';
import type { Kms } from '@credo-ts/core';

/** Key types written by `@veramo/kms-local` (TKeyType values we support). */
export type VeramoKeyType = 'Ed25519' | 'Secp256k1' | 'Secp256r1' | 'X25519';

const b64u = (bytes: ArrayLike<number>) => Buffer.from(Array.from(bytes)).toString('base64url');
const fromB64u = (value: string) => new Uint8Array(Buffer.from(value, 'base64url'));
const fromHex = (hex: string) => new Uint8Array(Buffer.from(hex.replace(/^0x/, ''), 'hex'));
const toHex = (bytes: ArrayLike<number>) => Buffer.from(Array.from(bytes)).toString('hex');

// PKCS#8 prefixes for raw 32-byte private keys, used to derive the public key with Node's crypto
const PKCS8_ED25519 = Buffer.from('302e020100300506032b657004220420', 'hex');
const PKCS8_X25519 = Buffer.from('302e020100300506032b656e04220420', 'hex');

function publicXFromRaw(prefix: Buffer, seed: Uint8Array): Uint8Array {
	const key = createPrivateKey({ key: Buffer.from([...prefix, ...seed]), format: 'der', type: 'pkcs8' });
	const jwk = createPublicKey(key).export({ format: 'jwk' }) as { x: string };
	return fromB64u(jwk.x);
}

function assertLength(bytes: Uint8Array, length: number, what: string) {
	if (bytes.length !== length) throw new Error(`${what}: expected ${length} bytes, got ${bytes.length}`);
}

/**
 * Convert a Veramo private key (the decrypted `privateKeyHex` and its `type`) into the private JWK Credo's
 * Node KMS stores. `kid` becomes the Credo key id.
 */
export function veramoKeyToJwk(type: string, privateKeyHex: string, kid: string): Kms.KmsJwkPrivate {
	const raw = fromHex(privateKeyHex);

	if (type === 'Ed25519') {
		// Veramo stores the 64-byte form: 32-byte seed followed by the 32-byte public key
		assertLength(raw, 64, 'Ed25519 private key');
		const seed = raw.slice(0, 32);
		const storedPublic = raw.slice(32);
		const derivedPublic = publicXFromRaw(PKCS8_ED25519, seed);
		if (toHex(derivedPublic) !== toHex(storedPublic)) {
			throw new Error('Ed25519 key is inconsistent: stored public key does not match the seed');
		}
		return { kty: 'OKP', crv: 'Ed25519', d: b64u(seed), x: b64u(derivedPublic), kid } as Kms.KmsJwkPrivate;
	}

	if (type === 'X25519') {
		assertLength(raw, 32, 'X25519 private key');
		return {
			kty: 'OKP',
			crv: 'X25519',
			d: b64u(raw),
			x: b64u(publicXFromRaw(PKCS8_X25519, raw)),
			kid,
		} as Kms.KmsJwkPrivate;
	}

	if (type === 'Secp256k1' || type === 'Secp256r1') {
		assertLength(raw, 32, `${type} private key`);
		const ecdh = createECDH(type === 'Secp256k1' ? 'secp256k1' : 'prime256v1');
		ecdh.setPrivateKey(raw);
		const point = ecdh.getPublicKey(); // uncompressed: 0x04 || x || y
		return {
			kty: 'EC',
			crv: type === 'Secp256k1' ? 'secp256k1' : 'P-256',
			d: b64u(raw),
			x: b64u(point.slice(1, 33)),
			y: b64u(point.slice(33, 65)),
			kid,
		} as Kms.KmsJwkPrivate;
	}

	throw new Error(`Unsupported Veramo key type '${type}'`);
}

/** Convert a Credo private JWK into the Veramo key type and `privateKeyHex` layout, so both stacks can read it. */
export function jwkToVeramoKey(jwk: Kms.KmsJwkPrivate): { type: VeramoKeyType; privateKeyHex: string } {
	const j = jwk as unknown as { kty: string; crv?: string; d?: string; x?: string };
	if (!j.d) throw new Error('JWK has no private component');

	if (j.kty === 'OKP' && j.crv === 'Ed25519') {
		return { type: 'Ed25519', privateKeyHex: toHex([...fromB64u(j.d), ...fromB64u(j.x as string)]) };
	}
	if (j.kty === 'OKP' && j.crv === 'X25519') return { type: 'X25519', privateKeyHex: toHex(fromB64u(j.d)) };
	if (j.kty === 'EC' && j.crv === 'secp256k1') return { type: 'Secp256k1', privateKeyHex: toHex(fromB64u(j.d)) };
	if (j.kty === 'EC' && j.crv === 'P-256') return { type: 'Secp256r1', privateKeyHex: toHex(fromB64u(j.d)) };

	throw new Error(`Key type kty=${j.kty} crv=${j.crv} cannot be stored in the Veramo key store`);
}
