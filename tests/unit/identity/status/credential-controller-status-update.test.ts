import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

// Revoke, suspend and reinstate are routed by the engine recorded on the status list. These tests fake the two
// engines and check that the recorded one gets the call and that a no-op is never sent as a 200.
type Fake = {
	name: string;
	revokeCredentials: jest.Mock;
	suspendCredentials: jest.Mock;
	reinstateCredentials: jest.Mock;
};
const make = (name: string, outcome: Record<string, unknown>): Fake => ({
	name,
	revokeCredentials: jest.fn(async () => outcome),
	suspendCredentials: jest.fn(async () => outcome),
	reinstateCredentials: jest.fn(async () => outcome),
});
let recorded: 'credo' | 'veramo' = 'credo';
const engines: Record<string, Fake> = {};

jest.unstable_mockModule('../../../../src/services/identity/index.js', () => ({
	IdentityServiceStrategySetup: class {
		agent = {};
		routed = async () => engines[recorded];
		engine = async () => engines[recorded];
	},
}));
jest.unstable_mockModule('../../../../src/services/identity/engine/artifact-refs.js', () => ({
	statusListReference: () => undefined,
	statusListArtifact: async () => undefined,
	statusListArtifactFromCredential: async () => ({ kind: 'status-list', id: 'r-1' }),
	credentialArtifact: async () => undefined,
	didArtifact: () => undefined,
}));
jest.unstable_mockModule('../../../../src/services/identity/providers/index.js', () => ({
	DockIdentityService: class {},
}));
jest.unstable_mockModule('../../../../src/services/track/tracker.js', () => ({ eventTracker: { emit: () => true } }));

const { CredentialController } = await import('../../../../src/controllers/api/credential.js');

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
const request = { query: { listType: 'BitstringStatusList' }, body: { credential: 'jwt' } } as unknown as Request;
const run = async (action: 'revoke' | 'suspend' | 'reinstate') => {
	const response = respond();
	await (new CredentialController() as never as Record<string, (q: Request, r: Response) => Promise<unknown>>)[
		action
	](request, response);
	return response;
};

beforeEach(() => {
	recorded = 'credo';
	engines.credo = make('credo', { updated: true, statusValue: 1 });
	engines.veramo = make('veramo', { updated: false, statusValue: 3 });
});

describe('credential status updates', () => {
	it.each<['revoke' | 'suspend' | 'reinstate', 'revokeCredentials' | 'suspendCredentials' | 'reinstateCredentials']>([
		['revoke', 'revokeCredentials'],
		['suspend', 'suspendCredentials'],
		['reinstate', 'reinstateCredentials'],
	])('%s goes to the engine recorded on the list and answers 200 when it updated', async (action, method) => {
		const response = await run(action);
		expect(engines.credo[method]).toHaveBeenCalledTimes(1);
		expect(engines.veramo[method]).not.toHaveBeenCalled();
		expect(response.statusCode).toBe(200);
		expect(response.body).toMatchObject({ updated: true });
	});

	it.each(['revoke', 'suspend', 'reinstate'] as const)(
		'%s answers a non-2xx with a message when nothing was updated, on either engine',
		async (action) => {
			for (const engine of ['veramo', 'credo'] as const) {
				recorded = engine;
				engines[engine] = make(engine, { updated: false, statusValue: 3 });
				const response = await run(action);
				expect(response.statusCode).toBeGreaterThanOrEqual(400);
				expect((response.body as { error: string }).error).toMatch(/not (revoked|suspended|reinstated)/);
			}
		}
	);
});

describe('status changes that would change nothing (U-58)', () => {
	const objectCredential = {
		issuer: 'did:cheqd:testnet:11111111-1111-4111-8111-111111111111',
		credentialStatus: {
			type: 'BitstringStatusListEntry',
			statusPurpose: 'message',
			statusListIndex: '5',
			statusListCredential:
				'https://resolver.cheqd.net/1.0/identifiers/did:cheqd:testnet:11111111-1111-4111-8111-111111111111?resourceName=bits&resourceType=BitstringStatusListCredential',
		},
	};
	const runWith = async (action: 'revoke' | 'suspend' | 'reinstate') => {
		const response = respond();
		const req = {
			query: { listType: 'BitstringStatusList' },
			body: { credential: objectCredential },
		} as unknown as Request;
		await (new CredentialController() as never as Record<string, (q: Request, r: Response) => Promise<unknown>>)[
			action
		](req, response);
		return response;
	};

	it.each<['revoke' | 'suspend' | 'reinstate', number, string]>([
		['revoke', 1, 'already_revoked'],
		['suspend', 2, 'already_suspended'],
		['suspend', 1, 'credential_revoked'],
		['reinstate', 0, 'not_suspended'],
		['reinstate', 1, 'credential_revoked'],
	])('%s when the status is %i answers 409 %s on both engines without writing', async (action, status, code) => {
		for (const engine of ['veramo', 'credo'] as const) {
			recorded = engine;
			const fake = make(engine, { updated: true, statusValue: 1 }) as Fake & Record<string, jest.Mock>;
			fake.checkBitstringStatusList = jest.fn(async () => ({ status, purpose: 'message', valid: status === 0 }));
			fake.checkStatusList2021 = jest.fn(async () => ({}));
			engines[engine] = fake;
			const response = await runWith(action);
			expect(response.statusCode).toBe(409);
			expect(response.body).toEqual({ error: expect.stringMatching(/^Nothing was changed/), code });
			const method = {
				revoke: 'revokeCredentials',
				suspend: 'suspendCredentials',
				reinstate: 'reinstateCredentials',
			}[action];
			expect(fake[method]).not.toHaveBeenCalled();
		}
	});

	it('answers 409 with a code when the engine itself reports the no-op', async () => {
		for (const engine of ['veramo', 'credo'] as const) {
			recorded = engine;
			// No status read available: the engine's own answer decides
			engines[engine] = make(engine, {
				updated: false,
				statusValue: 1,
				error: { message: 'Credential already has status value 1 (revoked)' },
			});
			const response = await runWith('revoke');
			expect(response.statusCode).toBe(409);
			expect(response.body).toMatchObject({ code: 'already_revoked' });
		}
	});
});
