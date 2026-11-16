import 'reflect-metadata';
import { createPublicKey, ECDH, verify as nodeVerify } from 'node:crypto';
import type { AgentContext } from '@credo-ts/core';
import { NodeKeyManagementService } from '@credo-ts/node';
import { PrivateKey, PrivateKeyStore } from '@veramo/data-store';
import { KeyManagementSystem, SecretBox } from '@veramo/kms-local';
import { DataSource } from 'typeorm';
import { beforeAll, describe, expect, jest, test } from '@jest/globals';
import { VeramoKeyManagementStorage } from '../../../../src/services/identity/credo/VeramoKeyManagementStorage.js';

const ctx = { contextCorrelationId: 'default' } as unknown as AgentContext;
const data = new TextEncoder().encode('{"hello":"agent"}');

type Case = {
	veramo: 'Ed25519' | 'Secp256k1' | 'Secp256r1';
	alg: 'EdDSA' | 'ES256K' | 'ES256';
	veramoAlg?: string;
	create: object;
};
const signCases: Case[] = [
	{ veramo: 'Ed25519', alg: 'EdDSA', create: { kty: 'OKP', crv: 'Ed25519' } },
	{ veramo: 'Secp256r1', alg: 'ES256', create: { kty: 'EC', crv: 'P-256' } },
	{ veramo: 'Secp256k1', alg: 'ES256K', create: { kty: 'EC', crv: 'secp256k1' } },
];

/** Build a Node public key from Veramo's `publicKeyHex`, independently of the adapter's conversion code. */
function publicKeyFromVeramo(type: string, publicKeyHex: string) {
	let raw: Buffer = Buffer.from(publicKeyHex, 'hex');
	if (type === 'Ed25519')
		return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') }, format: 'jwk' });
	const crv = type === 'Secp256k1' ? 'secp256k1' : 'P-256';
	// Veramo stores secp256k1 public keys uncompressed (65 bytes) but P-256 compressed (33 bytes)
	if (raw.length === 33)
		raw = ECDH.convertKey(
			new Uint8Array(raw),
			type === 'Secp256k1' ? 'secp256k1' : 'prime256v1',
			undefined,
			undefined,
			'uncompressed'
		) as Buffer;
	expect(raw.length).toBe(65);
	return createPublicKey({
		key: {
			kty: 'EC',
			crv,
			x: raw.subarray(1, 33).toString('base64url'),
			y: raw.subarray(33).toString('base64url'),
		},
		format: 'jwk',
	});
}

function verifyWithNode(type: string, key: ReturnType<typeof createPublicKey>, signature: Uint8Array) {
	if (type === 'Ed25519') return nodeVerify(null, data, key, signature);
	return nodeVerify('sha256', data, { key, dsaEncoding: 'ieee-p1363' }, signature);
}

describe('Veramo key store behind Credo Node KMS', () => {
	let store: PrivateKeyStore;
	let veramo: KeyManagementSystem;
	let credo: NodeKeyManagementService;
	let storage: VeramoKeyManagementStorage;
	const onKeyCreated = jest.fn<() => void>();

	beforeAll(async () => {
		const ds = await new DataSource({ type: 'sqljs', synchronize: true, entities: [PrivateKey] }).initialize();
		const secret = await SecretBox.createSecretKey();
		store = new PrivateKeyStore(ds, new SecretBox(secret));
		veramo = new KeyManagementSystem(store);
		storage = new VeramoKeyManagementStorage({ privateKeyStore: store, onKeyCreated });
		credo = new NodeKeyManagementService(storage);
	});

	describe.each(signCases)('key created by Veramo ($veramo)', ({ veramo: type, alg }) => {
		test('Credo reads it and the public key matches what Veramo stored', async () => {
			const info = await veramo.createKey({ type });
			const { publicJwk } = await credo.getPublicKey(ctx, info.kid).then((jwk) => ({ publicJwk: jwk }));
			expect(publicJwk).not.toBeNull();
			expect((publicJwk as { kid?: string }).kid).toBe(info.kid);

			const fromVeramo = publicKeyFromVeramo(type, info.publicKeyHex).export({ format: 'jwk' }) as Record<
				string,
				string
			>;
			expect(publicJwk).toMatchObject({
				kty: fromVeramo.kty,
				crv: fromVeramo.crv,
				x: fromVeramo.x,
				...(fromVeramo.y ? { y: fromVeramo.y } : {}),
			});
		});

		test('Credo signs with it and an independent verifier accepts the signature', async () => {
			const info = await veramo.createKey({ type });
			const { signature } = await credo.sign(ctx, { keyId: info.kid, algorithm: alg, data });
			expect(verifyWithNode(type, publicKeyFromVeramo(type, info.publicKeyHex), signature)).toBe(true);
		});

		test('Veramo signs with it and Credo verifies the signature', async () => {
			const info = await veramo.createKey({ type });
			const sigString = await veramo.sign({
				keyRef: { kid: info.kid },
				algorithm: alg === 'EdDSA' ? 'EdDSA' : alg,
				data,
			});
			const signature = new Uint8Array(Buffer.from(sigString, 'base64url'));
			const result = await credo.verify(ctx, { key: { keyId: info.kid }, algorithm: alg, data, signature });
			expect(result.verified).toBe(true);
		});
	});

	describe.each(signCases)('key created by Credo ($veramo)', ({ veramo: type, alg, create }) => {
		test('is stored in Veramo layout; Veramo can sign with it; the host hook fires', async () => {
			onKeyCreated.mockClear();
			const { keyId, publicJwk } = await credo.createKey(ctx, { type: create as never });
			expect(onKeyCreated).toHaveBeenCalledTimes(1);
			expect((onKeyCreated.mock.calls[0] as unknown[])[1]).toBe(keyId);

			const stored = await store.getKey({ alias: keyId });
			expect(stored.type).toBe(type);

			const sigString = await veramo.sign({ keyRef: { kid: keyId }, algorithm: alg, data });
			const signature = new Uint8Array(Buffer.from(sigString, 'base64url'));
			const publicKey = createPublicKey({ key: publicJwk as never, format: 'jwk' });
			expect(verifyWithNode(type, publicKey, signature)).toBe(true);
		});
	});

	test('X25519 keys round-trip (key agreement type)', async () => {
		const info = await veramo.createKey({ type: 'X25519' });
		const jwk = (await storage.get(ctx, info.kid)) as unknown as { kty: string; crv: string; x: string };
		expect(jwk).toMatchObject({ kty: 'OKP', crv: 'X25519' });
		expect(Buffer.from(jwk.x, 'base64url').toString('hex')).toBe(info.publicKeyHex);
	});

	test('unknown key id returns null / false', async () => {
		expect(await storage.get(ctx, 'nope')).toBeNull();
		expect(await storage.has(ctx, 'nope')).toBe(false);
	});

	test('delete removes the key', async () => {
		const info = await veramo.createKey({ type: 'Ed25519' });
		expect(await storage.has(ctx, info.kid)).toBe(true);
		expect(await storage.delete(ctx, info.kid)).toBe(true);
		expect(await storage.has(ctx, info.kid)).toBe(false);
	});

	test('a wrong encryption secret fails loudly instead of returning a bad key', async () => {
		const info = await veramo.createKey({ type: 'Secp256r1' });
		const wrong = new VeramoKeyManagementStorage({
			privateKeyStore: new PrivateKeyStore(
				(store as unknown as { dbConnection: DataSource }).dbConnection,
				new SecretBox(await SecretBox.createSecretKey())
			),
		});
		await expect(wrong.get(ctx, info.kid)).rejects.toThrow();
	});
});
