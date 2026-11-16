import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

let listed: unknown = { total: 2, dids: ['did:cheqd:testnet:org', 'did:cheqd:testnet:agent'] };
const agentDidsAmong = jest.fn(async (_customerId: string, dids: string[]) =>
	dids.filter((did) => did.endsWith(':agent'))
);

jest.unstable_mockModule('../../../../src/services/identity/index.js', () => ({
	IdentityServiceStrategySetup: class {
		agent = {};
		engine = async () => ({ listDids: async () => listed });
	},
}));
jest.unstable_mockModule('../../../../src/services/identity/providers/index.js', () => ({
	DockIdentityService: class {},
}));
jest.unstable_mockModule('../../../../src/services/api/identifier.js', () => ({
	IdentifierService: { instance: { agentDidsAmong } },
}));

const { DIDController } = await import('../../../../src/controllers/api/did.js');

function respond() {
	const response = { statusCode: 0, body: undefined as unknown } as Response & { statusCode: number; body: any };
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

beforeEach(() => {
	agentDidsAmong.mockClear();
});

describe('GET /did/list marks agent DIDs', () => {
	it('adds agentDids to a list of strings and keeps the list itself unchanged', async () => {
		const response = respond();
		await new DIDController().getDids({ query: {} } as unknown as Request, response);
		expect(response.statusCode).toBe(200);
		expect(response.body.dids).toEqual(['did:cheqd:testnet:org', 'did:cheqd:testnet:agent']);
		expect(response.body.agentDids).toEqual(['did:cheqd:testnet:agent']);
		expect(agentDidsAmong).toHaveBeenCalledWith('c-1', ['did:cheqd:testnet:org', 'did:cheqd:testnet:agent']);
	});

	it('works for metadata items, which carry kind themselves', async () => {
		listed = {
			total: 1,
			dids: [{ did: 'did:cheqd:testnet:agent', kind: 'agent', agentDeletedAt: '2026-01-01T00:00:00.000Z' }],
		};
		const response = respond();
		await new DIDController().getDids({ query: { metadata: 'true' } } as unknown as Request, response);
		expect(response.body.dids[0].kind).toBe('agent');
		expect(response.body.agentDids).toEqual(['did:cheqd:testnet:agent']);
	});
});
