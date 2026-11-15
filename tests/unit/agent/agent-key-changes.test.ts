import { describe, expect, it } from '@jest/globals';
import { base58btc } from 'multiformats/bases/base58';
import { generateKeyPairSync } from 'node:crypto';
import {
	buildAgentDidDocument,
	documentWithNewKey,
	ed25519MultibaseFromPublicKeyHex,
	nextKeyFragment,
	p256MultibaseFromJwk,
	relationshipIds,
} from '../../../src/services/agent/agent-keys.js';
import type { EngineDidDocument } from '../../../src/services/identity/engine/types.js';
import { viewKeys } from '../../../src/services/agent/agent-key-view.js';

const hex = (bytes: { toString(encoding: 'hex'): string }) => bytes.toString('hex');
const ed25519Hex = () => {
	const jwk = generateKeyPairSync('ed25519').publicKey.export({ format: 'jwk' }) as { x: string };
	return hex(Buffer.from(jwk.x, 'base64url'));
};
const p256Hex = () => {
	const jwk = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ format: 'jwk' }) as {
		x: string;
		y: string;
	};
	return `04${Buffer.from(jwk.x, 'base64url').toString('hex')}${Buffer.from(jwk.y, 'base64url').toString('hex')}`;
};

const document = () =>
	buildAgentDidDocument({
		network: 'testnet',
		id: '7c2b990c-3d05-4ebf-91af-f4f4d0091d2e',
		p256PublicKeyHex: p256Hex(),
		ed25519PublicKeyHex: ed25519Hex(),
	});
const DID = 'did:cheqd:testnet:7c2b990c-3d05-4ebf-91af-f4f4d0091d2e';
const none = { createdAt: new Map<string, Date>(), rotatedAt: new Map<string, Date>() };
const registered = new Date('2026-01-01T00:00:00Z');

describe('nextKeyFragment', () => {
	it('takes the next free number', () => {
		expect(nextKeyFragment(document())).toBe('key-3');
		const rotated = documentWithNewKey(document(), { fragment: 'key-3', type: 'P-256', publicKeyHex: p256Hex() });
		expect(nextKeyFragment(rotated)).toBe('key-4');
	});
});

describe('documentWithNewKey', () => {
	it('rotates: the new key takes the old one place, and the old method stays for verification', () => {
		const before = document();
		const next = documentWithNewKey(
			before,
			{ fragment: 'key-3', type: 'P-256', publicKeyHex: p256Hex() },
			`${DID}#key-1`
		);
		expect(next.authentication).toEqual([`${DID}#key-3`, `${DID}#key-2`]);
		expect(next.assertionMethod).toEqual([`${DID}#key-3`, `${DID}#key-2`]);
		const ids = (next.verificationMethod as Array<{ id: string; type: string }>).map((m) => m.id);
		expect(ids).toEqual([`${DID}#key-1`, `${DID}#key-2`, `${DID}#key-3`]);
		// The input is not changed
		expect((before.verificationMethod as unknown[]).length).toBe(2);
	});

	it('adds: the key joins authentication and assertionMethod, nothing is replaced', () => {
		const next = documentWithNewKey(document(), { fragment: 'key-3', type: 'Ed25519', publicKeyHex: ed25519Hex() });
		expect(relationshipIds(next, 'authentication')).toEqual([`${DID}#key-1`, `${DID}#key-2`, `${DID}#key-3`]);
		expect(relationshipIds(next, 'assertionMethod')).toContain(`${DID}#key-3`);
		const added = (next.verificationMethod as Array<Record<string, unknown>>).find((m) => m.id === `${DID}#key-3`);
		expect(added).toMatchObject({ type: 'Ed25519VerificationKey2020', controller: DID });
		expect(String(added?.publicKeyMultibase)).toMatch(/^z6Mk/);
	});

	it('keeps services and writes the ledger method names for resolver names', () => {
		const resolved: EngineDidDocument = {
			...document(),
			service: [{ id: `${DID}#svc`, type: 'LinkedDomains', serviceEndpoint: 'https://example.org' }],
		};
		(resolved.verificationMethod as Array<{ type: string }>)[0]!.type = 'JsonWebKey';
		(resolved.verificationMethod as Array<{ type: string }>)[1]!.type = 'Multikey';
		const next = documentWithNewKey(
			resolved,
			{ fragment: 'key-3', type: 'P-256', publicKeyHex: p256Hex() },
			`${DID}#key-1`
		);
		expect(next.service).toEqual(resolved.service);
		expect((next.verificationMethod as Array<{ type: string }>).map((m) => m.type)).toEqual([
			'JsonWebKey2020',
			'Ed25519VerificationKey2020',
			'JsonWebKey2020',
		]);
	});

	it('understands relative references and embedded entries', () => {
		const base = document();
		const doc = { ...base, authentication: ['#key-1', { id: `${DID}#key-2`, type: 'x' }] };
		const next = documentWithNewKey(
			doc,
			{ fragment: 'key-3', type: 'Ed25519', publicKeyHex: ed25519Hex() },
			`${DID}#key-2`
		);
		expect(relationshipIds(next, 'authentication')).toEqual([`${DID}#key-1`, `${DID}#key-3`]);
	});
});

describe('viewKeys', () => {
	it('reports both keys of a fresh agent as active, with what each signs for', () => {
		const keys = viewKeys(document(), false, none, registered);
		expect(keys.map((k) => [k.type, k.algorithm, k.status, k.rotatedAt])).toEqual([
			['P-256', 'ES256', 'active', null],
			['Ed25519', 'EdDSA', 'active', null],
		]);
		expect(keys[0]!.usedBy).toEqual(['did', 'a2a', 'ap2']);
		expect(keys[1]!.usedBy).toEqual(['did', 'a2a', 'kya-os']);
		expect(keys.every((k) => k.createdAt === registered)).toBe(true);
	});

	it('marks a rotated key rotated, with when, and gives it no uses', () => {
		const rotated = documentWithNewKey(
			document(),
			{ fragment: 'key-3', type: 'P-256', publicKeyHex: p256Hex() },
			`${DID}#key-1`
		);
		const when = new Date('2026-06-01T00:00:00Z');
		const keys = viewKeys(
			rotated,
			false,
			{ createdAt: new Map([[`${DID}#key-3`, when]]), rotatedAt: new Map([[`${DID}#key-1`, when]]) },
			registered
		);
		const old = keys.find((k) => k.keyId === `${DID}#key-1`)!;
		expect(old).toMatchObject({ status: 'rotated', usedBy: [], rotatedAt: when });
		expect(keys.find((k) => k.keyId === `${DID}#key-3`)).toMatchObject({ status: 'active', createdAt: when });
	});

	it('marks every key revoked on a deactivated DID', () => {
		expect(viewKeys(document(), true, none, registered).map((k) => k.status)).toEqual(['revoked', 'revoked']);
	});

	it('exposes public material only', () => {
		const text = JSON.stringify(viewKeys(document(), false, none, registered));
		expect(text).not.toMatch(/"d"|private|secret/i);
	});
});

describe('multibase encodings', () => {
	it('encodes an Ed25519 key with the 0xed01 prefix and a P-256 key with the 0x8024 prefix', () => {
		const raw = ed25519Hex();
		expect(ed25519MultibaseFromPublicKeyHex(raw)).toMatch(/^z6Mk/);
		const jwk = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({
			format: 'jwk',
		}) as Record<string, unknown>;
		const multibase = p256MultibaseFromJwk(jwk);
		expect(multibase).toMatch(/^zDn/);
		const decoded = base58btc.decode(multibase);
		expect([...decoded.subarray(0, 2)]).toEqual([0x80, 0x24]);
		expect(decoded.length).toBe(35);
	});
});
