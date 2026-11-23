import { createPrivateKey, createPublicKey, generateKeyPairSync } from 'node:crypto';
import { bases } from 'multiformats/basics';
import { veramoKeyToJwk } from '../../credo/keyConversion.js';
import type { EngineDidDocument, EngineKeyType } from '../types.js';

/**
 * Key material helpers for the Credo engine. No Credo runtime imports (`keyConversion.ts` imports Credo types only):
 * the same code feeds the runtime and the unit tests.
 *
 * Studio's key ids follow Veramo: `kid` is the public key as hex (Ed25519: the 32 raw bytes; P-256 and secp256k1:
 * the 33-byte compressed point). The Credo engine keeps that convention, so a key it creates is addressable the
 * same way as one Veramo created (`publicKeyHexs` in requests, `controllerKeyId` in identifiers) and Veramo can
 * still read it if Studio rolls back.
 */

export interface PrivateJwk {
	kty: string;
	crv: string;
	d: string;
	x: string;
	y?: string;
	kid?: string;
	[member: string]: unknown;
}

export interface GeneratedKey {
	type: EngineKeyType;
	/** Veramo-style key id: the public key as hex */
	kid: string;
	publicKeyHex: string;
	privateJwk: PrivateJwk;
}

const b64uToBytes = (value: string) => new Uint8Array(Buffer.from(value, 'base64url'));
const toHex = (bytes: ArrayLike<number>) => Buffer.from(Array.from(bytes)).toString('hex');

/** The compressed SEC1 point for an EC public key: 02 or 03, then x. */
function compressedPoint(x: string, y: string): string {
	const yBytes = b64uToBytes(y);
	const prefix = (yBytes[yBytes.length - 1] & 1) === 0 ? '02' : '03';
	return prefix + toHex(b64uToBytes(x));
}

/** The Veramo-style public key hex for a public or private JWK (Ed25519, X25519, P-256, secp256k1). */
export function publicKeyHexFromJwk(jwk: { kty?: string; crv?: string; x?: string; y?: string }): string {
	if (jwk.kty === 'OKP' && (jwk.crv === 'Ed25519' || jwk.crv === 'X25519') && jwk.x) {
		return toHex(b64uToBytes(jwk.x));
	}
	if (jwk.kty === 'EC' && (jwk.crv === 'P-256' || jwk.crv === 'secp256k1') && jwk.x && jwk.y) {
		return compressedPoint(jwk.x, jwk.y);
	}
	throw new Error(`Unsupported key: kty=${jwk.kty} crv=${jwk.crv}`);
}

/** Generates a key pair and returns it ready for `kms.importKey` with `keyId: kid`. */
export function generateKeyMaterial(type: EngineKeyType | string): GeneratedKey {
	let jwk: Record<string, string>;
	switch (type) {
		case 'Ed25519':
			jwk = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' }) as Record<string, string>;
			break;
		case 'X25519':
			jwk = generateKeyPairSync('x25519').privateKey.export({ format: 'jwk' }) as Record<string, string>;
			break;
		case 'Secp256r1':
			jwk = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({
				format: 'jwk',
			}) as Record<string, string>;
			break;
		case 'Secp256k1':
			jwk = generateKeyPairSync('ec', { namedCurve: 'secp256k1' }).privateKey.export({ format: 'jwk' }) as Record<
				string,
				string
			>;
			break;
		default:
			throw new Error(`Unsupported key type '${type}'. Supported: Ed25519, Secp256k1, Secp256r1, X25519`);
	}
	const publicKeyHex = publicKeyHexFromJwk(jwk);
	return {
		type: type as EngineKeyType,
		kid: publicKeyHex,
		publicKeyHex,
		privateJwk: { ...(jwk as unknown as PrivateJwk), kid: publicKeyHex },
	};
}

/** The key types a customer can import. The same set the key store can hold in Veramo's layout. */
export const IMPORTABLE_KEY_TYPES: readonly EngineKeyType[] = ['Ed25519', 'Secp256k1', 'Secp256r1', 'X25519'];

const ED25519_PKCS8_PREFIX = '302e020100300506032b657004220420';

/**
 * Key material for a private key the customer supplies as hex, in the layout `POST /key/import` and `/did/import`
 * accept: Ed25519 as the 32-byte seed or Veramo's 64-byte seed-plus-public-key form, the others as the 32-byte
 * secret. The `kid` follows the same convention as a generated key (the public key hex).
 *
 * Errors never quote the key: the message says only what is wrong with it.
 */
export function keyMaterialFromPrivateKeyHex(type: EngineKeyType, privateKeyHex: string): GeneratedKey {
	const hex = privateKeyHex.replace(/^0x/i, '').toLowerCase();
	if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-f]+$/.test(hex)) {
		throw new Error(`The ${type} private key is not a hexadecimal string of whole bytes`);
	}

	let veramoHex = hex;
	if (type === 'Ed25519' && hex.length === 64) {
		// A bare seed: append the public key, which is the form Veramo stores and `veramoKeyToJwk` reads
		const privateKey = createPrivateKey({
			key: Buffer.from(ED25519_PKCS8_PREFIX + hex, 'hex'),
			format: 'der',
			type: 'pkcs8',
		});
		const { x } = createPublicKey(privateKey).export({ format: 'jwk' }) as { x: string };
		veramoHex = hex + Buffer.from(x, 'base64url').toString('hex');
	}

	let jwk: PrivateJwk;
	try {
		jwk = veramoKeyToJwk(type, veramoHex, 'import') as unknown as PrivateJwk;
	} catch (error) {
		// The conversion's own messages name lengths and consistency only; Node's curve errors are replaced
		const reason =
			error instanceof Error && /expected|inconsistent/.test(error.message) ? `: ${error.message}` : '';
		throw new Error(`The private key is not a valid ${type} key${reason}`);
	}
	const publicKeyHex = publicKeyHexFromJwk(jwk);
	return { type, kid: publicKeyHex, publicKeyHex, privateJwk: { ...jwk, kid: publicKeyHex } };
}

const MULTIBASE_KEY_HEADER = [0xed, 0x01];

/**
 * The encodings of a key pair in a DID export, byte for byte what the Veramo export writes: `@cheqd/sdk`
 * `toMultibaseRaw` (which prefixes the Ed25519 multicodec header whatever the key type) and unprefixed base58btc.
 */
export function exportKeyEncodings(publicKeyHex: string, privateKeyHex: string) {
	const publicKey = new Uint8Array(Buffer.from(publicKeyHex, 'hex'));
	const privateKey = new Uint8Array(Buffer.from(privateKeyHex, 'hex'));
	const multibase = (bytes: Uint8Array) =>
		bases.base58btc.encode(new Uint8Array([...MULTIBASE_KEY_HEADER, ...bytes]));
	const base58 = (bytes: Uint8Array) => bases.base58btc.encode(bytes).slice(1);
	return {
		publicKeyMultibase: multibase(publicKey),
		privateKeyMultibase: multibase(privateKey),
		publicKeyBase58: base58(publicKey),
		privateKeyBase58: base58(privateKey),
	};
}

/** Veramo key type for a JWK, as stored in the `key` table. */
export function veramoTypeFromJwk(jwk: { kty?: string; crv?: string }): EngineKeyType {
	if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519') return 'Ed25519';
	if (jwk.kty === 'OKP' && jwk.crv === 'X25519') return 'X25519';
	if (jwk.kty === 'EC' && jwk.crv === 'P-256') return 'Secp256r1';
	if (jwk.kty === 'EC' && jwk.crv === 'secp256k1') return 'Secp256k1';
	throw new Error(`Unsupported key: kty=${jwk.kty} crv=${jwk.crv}`);
}

const MULTICODEC_ED25519 = [0xed, 0x01];
const MULTICODEC_P256 = [0x80, 0x24];

/**
 * The public key hex a verification method carries, in the same convention as the `key` table. Understands the
 * three encodings the public API accepts: `publicKeyBase58` (`Ed25519VerificationKey2018`), `publicKeyMultibase`
 * (`Ed25519VerificationKey2020`, `Multikey`) and `publicKeyJwk` (`JsonWebKey2020`, `JsonWebKey`).
 * Returns `null` for a method with no recognisable key, so the caller can refuse it.
 */
export function publicKeyHexFromVerificationMethod(vm: Record<string, unknown>): string | null {
	try {
		if (typeof vm.publicKeyBase58 === 'string') {
			return toHex(bases.base58btc.decode(`z${vm.publicKeyBase58}`));
		}
		if (typeof vm.publicKeyMultibase === 'string') {
			if (!vm.publicKeyMultibase.startsWith('z')) return null; // only base58btc is used on cheqd
			const bytes = bases.base58btc.decode(vm.publicKeyMultibase);
			if (bytes[0] === MULTICODEC_ED25519[0] && bytes[1] === MULTICODEC_ED25519[1] && bytes.length === 34) {
				return toHex(bytes.slice(2));
			}
			if (bytes[0] === MULTICODEC_P256[0] && bytes[1] === MULTICODEC_P256[1] && bytes.length === 35) {
				return toHex(bytes.slice(2));
			}
			return null;
		}
		if (vm.publicKeyJwk && typeof vm.publicKeyJwk === 'object') {
			return publicKeyHexFromJwk(vm.publicKeyJwk as Record<string, string>);
		}
	} catch {
		return null;
	}
	return null;
}

export interface SigningMethod {
	/** Absolute verification method id, `did#fragment` */
	id: string;
	/** The id relative to the DID, `#fragment`, which is what Credo's `didDocumentRelativeKeyId` expects */
	relativeId: string;
	publicKeyHex: string | null;
	method: Record<string, unknown>;
}

/**
 * The verification methods a did:cheqd write must be signed for: every entry of `authentication`, as an id or as
 * an embedded method.
 */
export function authenticationMethods(didDocument: EngineDidDocument): SigningMethod[] {
	const did = didDocument.id;
	const all = (didDocument.verificationMethod as Record<string, unknown>[] | undefined) ?? [];
	const entries = (didDocument.authentication as (string | Record<string, unknown>)[] | undefined) ?? [];
	const absolute = (id: string) => (id.startsWith('#') ? `${did}${id}` : id);

	return entries.map((entry) => {
		const reference = typeof entry === 'string' ? absolute(entry) : absolute(String(entry.id));
		const method =
			typeof entry === 'string'
				? all.find((vm) => absolute(String(vm.id)) === reference)
				: (entry as Record<string, unknown>);
		return {
			id: reference,
			relativeId: reference.startsWith(did) ? reference.slice(did.length) : reference,
			publicKeyHex: method ? publicKeyHexFromVerificationMethod(method) : null,
			method: method ?? {},
		};
	});
}

/**
 * The default did:cheqd document for an agent: a P-256 `JsonWebKey` (the default signing key, for JWS and SD-JWT
 * with ES256) and an Ed25519 `Multikey` (Data Integrity and AnonCreds), per the keys-and-formats decision (D1).
 * On chain the two use the names the node already knows: `JsonWebKey2020` and `Ed25519VerificationKey2020`, whose
 * multibase encoding is the Multikey encoding. The resolver and Credo present them as `JsonWebKey` and `Multikey`.
 * Both are in `authentication` (all of them sign every write) and `assertionMethod`.
 */
export function buildDefaultDidDocument(
	did: string,
	p256: { privateJwk: PrivateJwk },
	ed25519: { publicKeyHex: string },
	services: Record<string, unknown>[] = []
): EngineDidDocument {
	const jwkId = `${did}#key-1`;
	const edId = `${did}#key-2`;
	const { x, y, crv, kty } = p256.privateJwk;
	const multibase = bases.base58btc.encode(
		new Uint8Array([...MULTICODEC_ED25519, ...Buffer.from(ed25519.publicKeyHex, 'hex')])
	);
	return {
		'@context': [
			'https://www.w3.org/ns/did/v1',
			'https://w3id.org/security/suites/jws-2020/v1',
			'https://w3id.org/security/suites/ed25519-2020/v1',
		],
		id: did,
		controller: [did],
		verificationMethod: [
			{ id: jwkId, type: 'JsonWebKey2020', controller: did, publicKeyJwk: { kty, crv, x, y } },
			{ id: edId, type: 'Ed25519VerificationKey2020', controller: did, publicKeyMultibase: multibase },
		],
		authentication: [jwkId, edId],
		assertionMethod: [jwkId, edId],
		...(services.length > 0 ? { service: services } : {}),
	};
}
