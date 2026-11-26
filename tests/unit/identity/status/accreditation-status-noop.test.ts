import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

// U-58: accreditations share the status-change path with credentials, so a no-op answers 409 with the same `code`.
const ISSUER = 'did:cheqd:testnet:11111111-1111-4111-8111-111111111111';
const DID_URL = `${ISSUER}/resources/aaaaaaaa-1111-4111-8111-111111111111`;
const accreditation = {
	type: ['VerifiableCredential', 'VerifiableAccreditationToAttest'],
	issuer: { id: ISSUER },
	credentialSubject: { id: 'did:cheqd:testnet:22222222-2222-4222-8222-222222222222' },
	credentialStatus: {
		type: 'BitstringStatusListEntry',
		statusPurpose: 'message',
		statusListIndex: '7',
		statusListCredential: `https://resolver.cheqd.net/1.0/identifiers/${ISSUER}?resourceName=acc&resourceType=BitstringStatusListCredential`,
	},
};

let recorded: 'credo' | 'veramo' = 'credo';
const engines: Record<string, Record<string, jest.Mock>> = {};
const make = (status: number) => ({
	revokeCredentials: jest.fn(async () => ({ updated: true, statusValue: 1 })),
	suspendCredentials: jest.fn(async () => ({ updated: true, statusValue: 2 })),
	reinstateCredentials: jest.fn(async () => ({ updated: true, statusValue: 0 })),
	checkBitstringStatusList: jest.fn(async () => ({ status, purpose: 'message', valid: status === 0 })),
	checkStatusList2021: jest.fn(async () => ({})),
});

jest.unstable_mockModule('../../../../src/services/identity/index.js', () => ({
	IdentityServiceStrategySetup: class {
		agent = { resolve: async () => ({ json: async () => accreditation }) };
		routed = async () => engines[recorded];
		engine = async () => engines[recorded];
	},
}));
jest.unstable_mockModule('../../../../src/services/identity/engine/artifact-refs.js', () => ({
	statusListArtifactFromCredential: async () => ({ kind: 'status-list', id: 'r-1' }),
	statusListArtifact: async () => undefined,
	statusListReference: () => undefined,
	credentialArtifact: () => undefined,
	didArtifact: () => undefined,
}));
jest.unstable_mockModule('../../../../src/services/identity/providers/index.js', () => ({
	DockIdentityService: class {},
}));
jest.unstable_mockModule('../../../../src/services/track/tracker.js', () => ({ eventTracker: { emit: () => true } }));

const { AccreditationController } = await import('../../../../src/controllers/api/accreditation.js');

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

const run = async (action: 'revoke' | 'suspend' | 'reinstate') => {
	const response = respond();
	const request = { query: { publish: true }, body: { didUrl: DID_URL } } as unknown as Request;
	await (new AccreditationController() as never as Record<string, (q: Request, r: Response) => Promise<unknown>>)[
		action
	](request, response);
	return response;
};

beforeEach(() => {
	recorded = 'credo';
});

describe('accreditation status changes that would change nothing', () => {
	it.each<['revoke' | 'suspend' | 'reinstate', number, string, string]>([
		['revoke', 1, 'already_revoked', 'revokeCredentials'],
		['suspend', 2, 'already_suspended', 'suspendCredentials'],
		['reinstate', 0, 'not_suspended', 'reinstateCredentials'],
		['reinstate', 1, 'credential_revoked', 'reinstateCredentials'],
	])('%s at status %i answers 409 %s on both engines', async (action, status, code, method) => {
		for (const engine of ['veramo', 'credo'] as const) {
			recorded = engine;
			engines[engine] = make(status);
			const response = await run(action);
			expect(response.statusCode).toBe(409);
			expect(response.body).toEqual({ error: expect.stringMatching(/^Nothing was changed/), code });
			expect(engines[engine][method]).not.toHaveBeenCalled();
		}
	});

	it('still changes the status when it is a real change', async () => {
		engines.credo = make(0);
		const response = await run('revoke');
		expect(response.statusCode).toBe(200);
		expect(engines.credo.revokeCredentials).toHaveBeenCalledTimes(1);
	});
});
