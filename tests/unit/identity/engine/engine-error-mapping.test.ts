import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

/**
 * Typed engine errors become their HTTP answer on every route family that reaches an identity engine, with a safe
 * message and no stack. Each family is driven through its real controller (or service) with an engine that throws.
 */
let failure: unknown;
const throwing = () =>
	new Proxy(
		{ name: 'credo' },
		{
			get: (target, name: string) =>
				name === 'then'
					? undefined // not a thenable, or awaiting the engine would never settle
					: name in target
						? (target as Record<string, unknown>)[name]
						: async () => Promise.reject(failure),
		}
	);

jest.unstable_mockModule('../../../../src/database/connection/connection.js', () => ({
	Connection: { instance: { dbConnection: { getRepository: () => ({ save: async (row: unknown) => row }) } } },
}));
jest.unstable_mockModule('../../../../src/services/identity/index.js', () => ({
	IdentityServiceStrategySetup: class {
		agent = {
			resolveDid: async () => ({ didDocument: { id: 'did:cheqd:testnet:abc' }, didDocumentMetadata: {} }),
		};
		engine = async () => throwing();
		routed = async () => throwing();
	},
}));
jest.unstable_mockModule('../../../../src/services/identity/engine/artifact-refs.js', () => ({
	statusListReference: () => undefined,
	statusListArtifactFromCredential: async () => undefined,
	statusListArtifact: async () => undefined,
	credentialArtifact: () => undefined,
	didArtifact: () => undefined,
}));
jest.unstable_mockModule('../../../../src/services/identity/providers/index.js', () => ({
	DockIdentityService: class {},
}));
jest.unstable_mockModule('../../../../src/services/track/tracker.js', () => ({ eventTracker: { emit: () => true } }));
jest.unstable_mockModule('../../../../src/services/api/identifier.js', () => ({
	IdentifierService: { instance: { get: async () => ({ did: 'did:cheqd:testnet:abc' }) } },
}));

const { LedgerUnavailableError } = await import('../../../../src/services/identity/ledger-lock.js');
const { EngineGoneError, EngineRoutingUnavailableError } =
	await import('../../../../src/services/identity/engine/errors.js');
const credoErrors = await import('../../../../src/services/identity/engine/credo/errors.js');
const { mapEngineError, engineErrorResponse } = await import('../../../../src/helpers/engine-errors.js');
const { CredentialController } = await import('../../../../src/controllers/api/credential.js');
const { PresentationController } = await import('../../../../src/controllers/api/presentation.js');
const { ResourceController } = await import('../../../../src/controllers/api/resource.js');
const { DIDController } = await import('../../../../src/controllers/api/did.js');
const { CredentialStatusService } = await import('../../../../src/services/api/credential-status.js');

function respond() {
	const headers: Record<string, string> = {};
	const response = { statusCode: 0, body: undefined as unknown, headers } as Response & {
		statusCode: number;
		body: unknown;
		headers: Record<string, string>;
	};
	response.locals = { customer: { customerId: 'c-1' }, user: {} };
	response.status = ((code: number) => {
		response.statusCode = code;
		return response;
	}) as never;
	response.json = ((body: unknown) => {
		response.body = body;
		return response;
	}) as never;
	response.send = response.json;
	response.setHeader = ((name: string, value: string) => {
		headers[name] = value;
		return response;
	}) as never;
	return response;
}

const secretStack = 'at secret/internal/path.ts:42';
const typed = () => {
	const error = new LedgerUnavailableError('The ledger write for payer cheqd1abc could not start within 60000ms');
	error.stack = secretStack;
	return error;
};

type Call = (response: Response) => Promise<unknown>;
const families: [string, Call][] = [
	[
		'credentials',
		(response) =>
			new CredentialController().revoke(
				{ query: { listType: 'BitstringStatusList' }, body: { credential: 'jwt' } } as unknown as Request,
				response
			),
	],
	[
		'presentations',
		(response) =>
			new PresentationController().createPresentation(
				{ body: { credentials: ['jwt'], holderDid: 'did:key:z6Mk' } } as unknown as Request,
				response
			),
	],
	[
		'resources',
		(response) =>
			new ResourceController().createResource(
				{
					params: { did: 'did:cheqd:testnet:abc' },
					body: { data: 'aGk=', encoding: 'base64', name: 'n', type: 't', version: '1' },
				} as unknown as Request,
				response
			),
	],
	[
		'DIDs',
		(response) =>
			new DIDController().createDid(
				{
					body: { network: 'testnet', options: { verificationMethodType: 'Ed25519VerificationKey2020' } },
				} as unknown as Request,
				response
			),
	],
];

beforeEach(() => {
	jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe.each(families)('%s: typed engine errors', (_family, call) => {
	it.each<[string, () => unknown, number, string]>([
		['a lock timeout', typed, 503, 'LedgerUnavailable'],
		['a routing failure', () => new EngineRoutingUnavailableError(), 503, 'EngineRoutingUnavailable'],
		[
			'a withdrawn operation',
			() => new EngineGoneError('Creating an encrypted status list is no longer supported'),
			410,
			'Gone',
		],
		[
			'an unimplemented engine method',
			() => new credoErrors.NotImplementedByEngineError('credo', 'importKey'),
			501,
			'NotImplemented',
		],
		['an unsupported feature', () => new credoErrors.CredoNotSupportedError('this'), 501, 'NotSupported'],
		['an artefact the caller does not own', () => new credoErrors.CredoOwnershipError('Key abc'), 404, 'not_found'],
	])('%s answers %i with code %s', async (_name, make, status, code) => {
		failure = make();
		const response = respond();
		await call(response);
		expect(response.statusCode).toBe(status);
		expect(response.body).toMatchObject({ code });
		const text = JSON.stringify(response.body);
		expect(text).not.toContain(secretStack);
		expect(text).not.toContain('cheqd1abc');
		expect(text).not.toContain('importKey');
		if (status === 503) expect(response.headers['Retry-After']).toBeDefined();
	});

	it('hides the configuration problems of a misconfigured engine', async () => {
		failure = new credoErrors.CredoConfigurationError(['CREDO_STORE_KEY is missing']);
		const response = respond();
		await call(response);
		expect(response.statusCode).toBe(503);
		expect(JSON.stringify(response.body)).not.toContain('CREDO_STORE_KEY');
	});

	it('keeps a 500 for an error it does not know, as before', async () => {
		failure = new Error('boom');
		const response = respond();
		await call(response);
		expect(response.statusCode).toBe(500);
		expect(JSON.stringify(response.body)).toContain('boom');
		expect(response.body).not.toHaveProperty('code');
	});
});

describe('status lists: typed engine errors', () => {
	const create = () =>
		new CredentialStatusService().createUnencryptedStatusList(
			{ did: 'did:cheqd:testnet:abc', statusListName: 'list' } as never,
			{ listType: 'BitstringStatusList', statusPurpose: 'revocation' } as never,
			{ customerId: 'c-1' } as never,
			{} as never
		);

	it.each<[string, () => unknown, number]>([
		['a lock timeout', typed, 503],
		['a routing failure', () => new EngineRoutingUnavailableError(), 503],
		['a withdrawn operation', () => new EngineGoneError('gone'), 410],
		['an unimplemented engine method', () => new credoErrors.NotImplementedByEngineError('credo', 'x'), 501],
	])('%s', async (_name, make, status) => {
		failure = make();
		const result = await create();
		expect(result.success).toBe(false);
		expect(result.statusCode).toBe(status);
		expect(String(result.error)).not.toContain(secretStack);
		expect(String(result.error)).not.toContain('cheqd1abc');
	});

	it('keeps a 500 for an unknown error', async () => {
		failure = new Error('boom');
		expect((await create()).statusCode).toBe(500);
	});
});

describe('mapEngineError and engineErrorResponse', () => {
	it('keep the idempotency key in the message of a retryable write', () => {
		const error = new LedgerUnavailableError('The ledger write timed out; retry with the same Idempotency-Key');
		error.idempotencyKey = 'k1';
		expect(mapEngineError(error)?.error).toContain('Idempotency-Key');
	});

	it('answer the Credo tenant-missing failure as before', () => {
		const response = respond();
		engineErrorResponse(response, new credoErrors.CredoTenantMissingError('t-1'));
		expect(response.statusCode).toBe(500);
		expect(response.body).toMatchObject({ code: 'credo_tenant_missing' });
		expect(JSON.stringify(response.body)).not.toContain('t-1');
	});

	it('return undefined for anything unmapped', () => {
		expect(mapEngineError(new Error('x'))).toBeUndefined();
		expect(mapEngineError('x')).toBeUndefined();
		expect(engineErrorResponse(respond(), null)).toBeUndefined();
	});
});
