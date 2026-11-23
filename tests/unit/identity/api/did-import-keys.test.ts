import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { bases } from 'multiformats/basics';

// POST /did/import hands the engine the keys it decrypted, never the encrypted request values.

const DID = 'did:cheqd:testnet:6f1e5c2a-3b4d-4e5f-8a9b-0c1d2e3f4a5b';

const importDid = jest.fn(async (did: string) => ({ did, provider: 'did:cheqd:testnet', keys: [], services: [] }));
let didDocument: Record<string, unknown> | null = null;

jest.unstable_mockModule('../../../../src/services/identity/index.js', () => ({
	IdentityServiceStrategySetup: class {
		agent = { resolveDid: async () => ({ didDocument }) };
		engine = async () => ({ importDid });
	},
}));
jest.unstable_mockModule('../../../../src/services/identity/providers/index.js', () => ({
	DockIdentityService: class {},
}));
jest.unstable_mockModule('../../../../src/services/track/tracker.js', () => ({
	eventTracker: { emit: () => true },
}));

const { DIDController } = await import('../../../../src/controllers/api/did.js');
const { deriveSymmetricKeyFromSecret } = await import('../../../../src/helpers/helpers.js');

function respond() {
	const response = { statusCode: 0, body: undefined as unknown } as Response & { statusCode: number; body: unknown };
	response.locals = { customer: { customerId: 'c-1' }, user: {} };
	response.status = ((code: number) => {
		response.statusCode = code;
		return response;
	}) as never;
	response.json = ((body: unknown) => {
		response.body = body;
		return response;
	}) as never;
	return response;
}

/** The client-side encryption `decryptPrivateKey` undoes: AES-GCM under a key derived from the shared secret. */
async function encrypt(privateKeyHex: string) {
	const salt = randomBytes(16).toString('hex');
	const iv = new Uint8Array(randomBytes(12));
	const key = await deriveSymmetricKeyFromSecret(process.env.CREDS_DECRYPTION_SECRET as string, salt);
	const ciphertext = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		new Uint8Array(Buffer.from(privateKeyHex, 'hex'))
	);
	return { privateKeyHex: Buffer.from(ciphertext).toString('hex'), ivHex: Buffer.from(iv).toString('hex'), salt };
}

beforeAll(() => {
	process.env.CREDS_DECRYPTION_SECRET = randomBytes(32).toString('hex');
});

beforeEach(() => {
	importDid.mockClear();
});

describe('POST /did/import', () => {
	it('passes the decrypted private key to the engine', async () => {
		const jwk = generateKeyPairSync('ed25519').privateKey.export({ format: 'jwk' }) as Record<string, string>;
		const privateKeyHex = Buffer.from(jwk.d, 'base64url').toString('hex');
		const publicKey = Buffer.from(jwk.x, 'base64url');
		didDocument = {
			id: DID,
			verificationMethod: [
				{
					id: `${DID}#key-1`,
					type: 'Ed25519VerificationKey2020',
					controller: DID,
					publicKeyMultibase: bases.base58btc.encode(new Uint8Array([0xed, 0x01, ...publicKey])),
				},
			],
			authentication: [`${DID}#key-1`],
		};
		const encrypted = await encrypt(privateKeyHex);
		const response = respond();
		await new DIDController().importDid(
			{ body: { did: DID, keys: [{ type: 'Ed25519', encrypted: true, ...encrypted }] } } as unknown as Request,
			response
		);

		expect(response.statusCode).toBe(200);
		expect(importDid).toHaveBeenCalledWith(
			DID,
			[{ type: 'Ed25519', privateKeyHex }],
			undefined,
			response.locals.customer
		);
		expect(JSON.stringify(importDid.mock.calls)).not.toContain(encrypted.privateKeyHex);
	});

	it('passes plain keys through with the default type', async () => {
		const response = respond();
		const privateKeyHex = randomBytes(32).toString('hex');
		await new DIDController().importDid(
			{ body: { did: DID, keys: [{ encrypted: false, privateKeyHex }] } } as unknown as Request,
			response
		);
		expect(response.statusCode).toBe(200);
		expect(importDid).toHaveBeenCalledWith(DID, [{ type: 'Ed25519', privateKeyHex }], undefined, expect.anything());
	});
});
