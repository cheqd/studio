import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { KeyController } from '../../../../src/controllers/api/key.js';
import { IdentityServiceStrategySetup } from '../../../../src/services/identity/index.js';
import { eventTracker } from '../../../../src/services/track/tracker.js';
import { EngineRouter } from '../../../../src/services/identity/engine/engine-router.js';
import type { IdentityEngine } from '../../../../src/services/identity/engine/identity-engine.js';
import type { IIdentityService } from '../../../../src/services/identity/index.js';
import type { CustomerEntity } from '../../../../src/database/entities/customer.entity.js';

const customer = { customerId: 'c1', name: 'n' } as CustomerEntity;
const createdAt = new Date('2026-11-13T00:00:00Z');

// The row Veramo returns after KeyService.update: the full entity, with the customer attached
const veramoKey = (type: string, kid: string) => ({
	kid,
	kms: 'postgres',
	type,
	publicKeyHex: kid,
	meta: { algorithms: ['EdDSA', 'Ed25519'] },
	publicKeyAlias: null,
	createdAt,
	updatedAt: null,
	customer,
});
// The narrower record the Credo store returns
const credoKey = (type: string, kid: string) => ({
	kid,
	kms: 'postgres',
	type,
	publicKeyHex: kid,
	meta: null,
	publicKeyAlias: undefined,
	createdAt,
});

function fakeEngine(name: 'veramo' | 'credo', key: (type: string, kid: string) => object) {
	return {
		name,
		createKey: jest.fn(async (type: string) => key(type, `${name}-${type}`)),
		importKey: jest.fn(async (type: string) => key(type, `${name}-${type}`)),
		getKey: jest.fn(async (kid: string) => key('Ed25519', kid)),
	} as unknown as IdentityEngine & {
		createKey: jest.Mock<(...args: never[]) => Promise<unknown>>;
		importKey: jest.Mock;
		getKey: jest.Mock;
	};
}

let veramo: ReturnType<typeof fakeEngine>;
let credo: ReturnType<typeof fakeEngine>;

beforeEach(() => {
	// The operation tracker writes to the database; the response is what matters here
	jest.spyOn(eventTracker, 'emit').mockImplementation(() => true);
	jest.spyOn(console, 'info').mockImplementation(() => undefined);
	veramo = fakeEngine('veramo', veramoKey);
	credo = fakeEngine('credo', credoKey);
	// The real router with fake lookups and engines: the controller reaches it through `setup.engine(...)`
	const router = new EngineRouter(
		{ recordedEngine: async () => null },
		{ flaggedEngine: async () => null },
		{ veramo: () => veramo, credo: () => credo }
	);
	// Building the Veramo service needs a fee payer and a database; the routed engines are fakes here
	jest.spyOn(IdentityServiceStrategySetup.prototype, 'setupIdentityStrategy').mockImplementation(() => undefined);
	jest.spyOn(IdentityServiceStrategySetup.prototype, 'engine').mockImplementation(async (route, artifact, hints) =>
		router.engineFor(
			{
				route,
				artifact,
				keyType: hints?.keyType,
				encryptedStatusList: hints?.encryptedStatusList,
				creates: hints?.creates,
			},
			{} as IIdentityService
		)
	);
});

afterEach(() => {
	jest.restoreAllMocks();
});

async function post(query: Record<string, string | undefined>) {
	const request = { query, body: {}, params: {} } as unknown as Request;
	const response = {
		locals: { customer, user: {} },
		statusCode: 0,
		body: undefined as unknown,
	} as unknown as Response & {
		statusCode: number;
		body: unknown;
	};
	response.status = ((code: number) => ((response.statusCode = code), response)) as never;
	response.json = ((body: unknown) => ((response.body = body), response)) as never;
	await new KeyController().createKey(request, response);
	return response;
}

describe('POST /key/create engine selection', () => {
	it('sends a new Ed25519 key (and the default type) to Credo: no new key is created on Veramo', async () => {
		for (const query of [{ type: 'Ed25519' }, {}]) {
			const response = await post(query);
			expect(response.statusCode).toBe(200);
		}
		expect(credo.createKey).toHaveBeenCalledTimes(2);
		expect(veramo.createKey).not.toHaveBeenCalled();
	});

	it.each(['Secp256r1', 'P-256', 'JsonWebKey'])('sends %s to Credo, whatever the flag says', async (type) => {
		const response = await post({ type });
		expect(response.statusCode).toBe(200);
		expect(credo.createKey).toHaveBeenCalledWith(type, customer);
		expect(veramo.createKey).not.toHaveBeenCalled();
	});

	it('gives an Ed25519 key created by Credo the same response as Veramo', async () => {
		jest.mocked(IdentityServiceStrategySetup.prototype.engine).mockResolvedValue(credo);
		const fromCredo = await post({ type: 'Ed25519' });
		expect(JSON.parse(JSON.stringify(fromCredo.body))).toEqual(
			JSON.parse(JSON.stringify(veramoKey('Ed25519', 'credo-Ed25519')))
		);
	});

	it('answers 500 with the existing body shape when the engine fails', async () => {
		credo.createKey.mockImplementationOnce(async () => {
			throw new Error('boom');
		});
		const response = await post({ type: 'Ed25519' });
		expect(response.statusCode).toBe(500);
		expect(response.body).toEqual({ error: 'Internal error: boom' });
	});
});

async function postImport(body: Record<string, unknown>) {
	const request = { query: {}, body, params: {} } as unknown as Request;
	const response = {
		locals: { customer, user: {} },
		statusCode: 0,
		body: undefined as unknown,
	} as unknown as Response & {
		statusCode: number;
		body: unknown;
	};
	response.status = ((code: number) => ((response.statusCode = code), response)) as never;
	response.json = ((body: unknown) => ((response.body = body), response)) as never;
	await new KeyController().importKey(request, response);
	return response;
}

describe('POST /key/import engine selection', () => {
	// Not a real key: the engines are fakes and never read it
	const privateKeyHex = 'ab'.repeat(32);

	it('sends an imported key (and the default type) to Credo, never to Veramo', async () => {
		for (const body of [{ type: 'Ed25519', privateKeyHex, alias: 'a' }, { privateKeyHex }]) {
			const response = await postImport(body);
			expect(response.statusCode).toBe(200);
		}
		expect(credo.importKey).toHaveBeenNthCalledWith(1, 'Ed25519', privateKeyHex, customer, 'a');
		expect(credo.importKey).toHaveBeenNthCalledWith(2, 'Ed25519', privateKeyHex, customer, undefined);
		expect(veramo.importKey).not.toHaveBeenCalled();
	});

	it('gives a key imported by Credo the same response as Veramo', async () => {
		const response = await postImport({ type: 'Ed25519', privateKeyHex });
		expect(JSON.parse(JSON.stringify(response.body))).toEqual(
			JSON.parse(JSON.stringify(veramoKey('Ed25519', 'credo-Ed25519')))
		);
	});

	it('answers 501 NotSupported for a key type the engine cannot hold, and 404 for a key another customer holds', async () => {
		const { CredoNotSupportedError, CredoOwnershipError } =
			await import('../../../../src/services/identity/engine/credo/errors.js');
		credo.importKey.mockImplementationOnce(async () => {
			throw new CredoNotSupportedError("importing keys of type 'Bls12381G2'");
		});
		const unsupported = await postImport({ type: 'Bls12381G2', privateKeyHex });
		expect(unsupported.statusCode).toBe(501);
		expect(unsupported.body).toMatchObject({ code: 'NotSupported' });

		credo.importKey.mockImplementationOnce(async () => {
			throw new CredoOwnershipError('Key abc');
		});
		const taken = await postImport({ type: 'Ed25519', privateKeyHex });
		expect(taken.statusCode).toBe(404);
		expect(taken.body).toEqual({ error: 'Key abc not found in wallet', code: 'not_found' });
	});
});
