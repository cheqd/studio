import { randomBytes } from 'node:crypto';
import { describe, expect, it } from '@jest/globals';
import { bases } from 'multiformats/basics';
import {
	authenticationMethods,
	buildDefaultDidDocument,
	exportKeyEncodings,
	generateKeyMaterial,
	publicKeyHexFromJwk,
	publicKeyHexFromVerificationMethod,
	veramoTypeFromJwk,
} from '../../../../src/services/identity/engine/credo/key-material.js';

describe('generated keys follow the Veramo key convention', () => {
	it.each([
		['Ed25519', /^[0-9a-f]{64}$/],
		['X25519', /^[0-9a-f]{64}$/],
		['Secp256r1', /^0[23][0-9a-f]{64}$/],
		['Secp256k1', /^0[23][0-9a-f]{64}$/],
	])('%s: kid is the public key hex', (type, pattern) => {
		const key = generateKeyMaterial(type);
		expect(key.publicKeyHex).toMatch(pattern);
		expect(key.kid).toBe(key.publicKeyHex);
		expect(key.privateJwk.kid).toBe(key.kid);
		expect(key.privateJwk.d).toBeTruthy();
		expect(publicKeyHexFromJwk(key.privateJwk)).toBe(key.publicKeyHex);
		expect(veramoTypeFromJwk(key.privateJwk)).toBe(type);
	});

	it('every key is different', () => {
		expect(generateKeyMaterial('Ed25519').kid).not.toBe(generateKeyMaterial('Ed25519').kid);
	});
});

describe('public key hex from each verification method encoding', () => {
	const ed = generateKeyMaterial('Ed25519');
	const p256 = generateKeyMaterial('Secp256r1');

	it('reads Ed25519VerificationKey2018 (publicKeyBase58)', () => {
		const publicKeyBase58 = bases.base58btc.encode(new Uint8Array(Buffer.from(ed.publicKeyHex, 'hex'))).slice(1);
		expect(publicKeyHexFromVerificationMethod({ publicKeyBase58 })).toBe(ed.publicKeyHex);
	});

	it('reads Ed25519VerificationKey2020 and Multikey (publicKeyMultibase), Ed25519 and P-256', () => {
		const multibase = (prefix: number[], hex: string) =>
			bases.base58btc.encode(new Uint8Array([...prefix, ...Buffer.from(hex, 'hex')]));
		expect(
			publicKeyHexFromVerificationMethod({ publicKeyMultibase: multibase([0xed, 0x01], ed.publicKeyHex) })
		).toBe(ed.publicKeyHex);
		expect(
			publicKeyHexFromVerificationMethod({ publicKeyMultibase: multibase([0x80, 0x24], p256.publicKeyHex) })
		).toBe(p256.publicKeyHex);
	});

	it('reads JsonWebKey (publicKeyJwk), Ed25519 and P-256', () => {
		const { d: _d1, ...edPublic } = ed.privateJwk;
		const { d: _d2, ...p256Public } = p256.privateJwk;
		expect(publicKeyHexFromVerificationMethod({ publicKeyJwk: edPublic })).toBe(ed.publicKeyHex);
		expect(publicKeyHexFromVerificationMethod({ publicKeyJwk: p256Public })).toBe(p256.publicKeyHex);
	});

	it('returns null, never a wrong key, for anything it does not understand', () => {
		expect(publicKeyHexFromVerificationMethod({})).toBeNull();
		expect(publicKeyHexFromVerificationMethod({ publicKeyBase58: '0OIl' })).toBeNull();
		expect(publicKeyHexFromVerificationMethod({ publicKeyMultibase: 'uAAAA' })).toBeNull();
		expect(
			publicKeyHexFromVerificationMethod({
				publicKeyMultibase: bases.base58btc.encode(new Uint8Array([0xe7, 0x01, 1, 2])),
			})
		).toBeNull();
		expect(publicKeyHexFromVerificationMethod({ publicKeyJwk: { kty: 'RSA', n: 'x', e: 'AQAB' } })).toBeNull();
	});
});

describe('authenticationMethods', () => {
	it('resolves id references and embedded methods, with relative ids', () => {
		const did = 'did:cheqd:testnet:abc';
		const ed = generateKeyMaterial('Ed25519');
		const jwk = generateKeyMaterial('Secp256r1');
		const doc = buildDefaultDidDocument(did, jwk, ed);
		const methods = authenticationMethods(doc);
		expect(methods.map((m) => [m.relativeId, m.publicKeyHex])).toEqual([
			['#key-1', jwk.publicKeyHex],
			['#key-2', ed.publicKeyHex],
		]);

		const embedded = authenticationMethods({
			id: did,
			authentication: [
				{
					id: '#k',
					type: 'x',
					publicKeyBase58: bases.base58btc
						.encode(new Uint8Array(Buffer.from(ed.publicKeyHex, 'hex')))
						.slice(1),
				},
			],
		});
		expect(embedded[0]).toMatchObject({ id: `${did}#k`, relativeId: '#k', publicKeyHex: ed.publicKeyHex });
	});
});

describe('DID export encodings', () => {
	it.each(['Ed25519', 'Secp256r1'] as const)(
		'are byte for byte what the Veramo export writes for a %s key',
		async (type) => {
			const { toMultibaseRaw } = await import('@cheqd/sdk');
			const { bytesToBase58 } = await import('@veramo/utils');
			const key = generateKeyMaterial(type);
			const privateKeyHex = randomBytes(type === 'Ed25519' ? 64 : 32).toString('hex');
			const publicBytes = new Uint8Array(Buffer.from(key.publicKeyHex, 'hex'));
			const privateBytes = new Uint8Array(Buffer.from(privateKeyHex, 'hex'));
			expect(exportKeyEncodings(key.publicKeyHex, privateKeyHex)).toEqual({
				publicKeyMultibase: toMultibaseRaw(publicBytes),
				privateKeyMultibase: toMultibaseRaw(privateBytes),
				publicKeyBase58: bytesToBase58(publicBytes),
				privateKeyBase58: bytesToBase58(privateBytes),
			});
		}
	);
});
