import { describe, expect, it, jest } from '@jest/globals';
import { createStatusListSession } from '../../../../src/services/identity/engine/credo/status-lists-session.js';

// In Credo, `tokenStatusList` is a default module: its API is a property of the (tenant) agent, not an entry of
// `agent.modules` (which holds only the modules Studio adds, such as `cheqd`). The session must read it there.
describe('createStatusListSession', () => {
	const agentWith = (tokenStatusList: unknown) =>
		({
			context: {},
			dependencyManager: { resolve: jest.fn() },
			modules: {},
			tokenStatusList,
		}) as never;

	it('creates a Token Status List through agent.tokenStatusList', async () => {
		const createTokenStatusList = jest.fn(async () => ({ statusList: 'jwt-1' }));
		const session = createStatusListSession(agentWith({ createTokenStatusList }));
		const out = await session.createTokenStatusList({
			didUrl: 'did:cheqd:testnet:x#key-1',
			alg: 'ES256',
			uri: 'https://resolver.example/list',
			bits: 1,
			size: 8,
			ttlSeconds: 60,
		} as never);
		expect(out).toBe('jwt-1');
		expect(createTokenStatusList).toHaveBeenCalledTimes(1);
	});

	it('updates a Token Status List through agent.tokenStatusList', async () => {
		const updateTokenStatusList = jest.fn(async () => ({ statusList: 'jwt-2' }));
		const session = createStatusListSession(agentWith({ updateTokenStatusList }));
		const out = await session.updateTokenStatusList({
			didUrl: 'did:cheqd:testnet:x#key-1',
			alg: 'ES256',
			token: 'jwt-1',
			updates: [{ index: 0, status: 1 }],
		} as never);
		expect(out).toBe('jwt-2');
	});
});
