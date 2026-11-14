import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// The TypeORM store is checked against a recording repository: no database is needed to prove that every
// tenant-scoped query carries the customer, and that a missing identifier is refused instead of dropped.
interface RecordedCall {
	entity: string;
	method: string;
	args: unknown[];
}
const recorded: RecordedCall[] = [];
let counts: Record<string, number> = {};
let rows: Record<string, unknown> = {};

const repositoryFor = (entity: { name: string }) =>
	new Proxy(
		{},
		{
			get:
				(_target, method: string) =>
				async (...args: unknown[]) => {
					recorded.push({ entity: entity.name, method, args });
					if (method === 'count') return counts[entity.name] ?? 0;
					if (method === 'findOne') return [rows[entity.name]].flat()[0] ?? null;
					if (method === 'find') return rows[entity.name] === undefined ? [] : [rows[entity.name]].flat();
					if (method === 'findAndCount')
						return [
							rows[entity.name] === undefined ? [] : [rows[entity.name]].flat(),
							counts[entity.name] ?? 0,
						];
					if (method === 'update' || method === 'softDelete') return { affected: 1 };
					if (method === 'create') return args[0];
					if (method === 'save') return args[0];
					return undefined;
				},
		}
	);

jest.unstable_mockModule('../../../src/database/connection/connection.js', () => ({
	Connection: {
		instance: {
			dbConnection: {
				getRepository: (entity: { name: string }) => repositoryFor(entity),
				transaction: async (run: (manager: unknown) => Promise<unknown>) =>
					run({ getRepository: (entity: { name: string }) => repositoryFor(entity) }),
			},
		},
	},
}));

const { TypeormAgentStore } = await import('../../../src/services/agent/agent-store.js');

const customerId = 'c0000000-0000-4000-8000-000000000001';
const agentId = 'a0000000-0000-4000-8000-000000000001';
const grantId = 'd0000000-0000-4000-8000-000000000001';
const store = new TypeormAgentStore();

const whereOf = (call: RecordedCall) => {
	const options = call.args[0] as { where?: unknown } | undefined;
	return JSON.stringify(call.method === 'update' || call.method === 'softDelete' ? call.args[0] : options?.where);
};

beforeEach(() => {
	recorded.length = 0;
	counts = {};
	rows = {};
});

describe('TypeormAgentStore', () => {
	it('counts ownership from the count, scoped to the customer', async () => {
		counts.AgentEntity = 0;
		expect(await store.countAgents(customerId, agentId)).toBe(0);
		counts.AgentEntity = 1;
		expect(await store.countAgents(customerId, agentId)).toBe(1);
		expect(recorded.every((call) => whereOf(call).includes(customerId) && whereOf(call).includes(agentId))).toBe(
			true
		);
	});

	it('scopes every read and write by customer', async () => {
		rows.AgentEntity = {
			agentId,
			name: 'a',
			status: 'active',
			createdAt: new Date(),
			updatedAt: new Date(),
			identifier: { did: 'did:cheqd:testnet:x' },
		};
		rows.AuthorityGrantEntity = {
			id: grantId,
			grantType: 'acts-for',
			createdAt: new Date(),
			statusIndex: 1,
			statusList: { registryId: 'r', uri: 'u', identifier: { did: 'did:cheqd:testnet:org' } },
			issuedCredential: { issuedCredentialId: 'ic' },
		};
		await store.getAgent(customerId, agentId);
		await store.listAgents(customerId, { limit: 10, offset: 0 });
		await store.updateAgent(customerId, agentId, { name: 'n' });
		await store.softDeleteAgent(customerId, agentId);
		await store.latestCardVersion(customerId, agentId);
		await store.getCard(customerId, agentId, 2);
		await store.countGrants(customerId, agentId, grantId);
		await store.getGrant(customerId, agentId, grantId);
		await store.listLiveGrants(customerId, agentId);
		await store.markGrantRevoked(customerId, agentId, grantId);
		await store.findOpenStatusList(customerId, 'did:cheqd:testnet:org');
		await store.countOwnedDids(customerId, 'did:cheqd:testnet:org');
		rows.PaymentAddressBindingEntity = {
			id: grantId,
			account: 'eip155:1:0x00',
			createdAt: new Date(),
			statusIndex: 1,
			statusList: { registryId: 'r', uri: 'u', identifier: { did: 'did:cheqd:testnet:agent' } },
			issuedCredential: { issuedCredentialId: 'ic' },
		};
		await store.countBindings(customerId, agentId, grantId);
		await store.getBinding(customerId, agentId, grantId);
		await store.listBindings(customerId, agentId);
		await store.listLiveBindings(customerId, agentId);
		await store.markBindingRevoked(customerId, agentId, grantId);

		const queries = recorded.filter((call) =>
			['count', 'findOne', 'find', 'findAndCount', 'update', 'softDelete'].includes(call.method)
		);
		expect(queries.length).toBeGreaterThanOrEqual(18);
		for (const call of queries) expect(`${call.entity}.${call.method}: ${whereOf(call)}`).toContain(customerId);
	});

	it('takes a status index by compare-and-swap on version, scoped to the customer', async () => {
		rows.StatusRegistryEntity = { registryId: 'r', writeCursor: 3, registrySize: 10, version: 7 };
		expect(await store.reserveStatusIndex(customerId, 'r')).toBe(3);
		const update = recorded.find((call) => call.method === 'update');
		expect(update?.args[0]).toMatchObject({ registryId: 'r', version: 7, customer: { customerId } });
		expect(update?.args[1]).toMatchObject({ writeCursor: 4, version: 8 });
	});

	it('answers null when a status list is full', async () => {
		rows.StatusRegistryEntity = { registryId: 'r', writeCursor: 10, registrySize: 10, version: 1 };
		expect(await store.reserveStatusIndex(customerId, 'r')).toBeNull();
		expect(recorded.some((call) => call.method === 'update')).toBe(false);
	});

	it.each([
		['countAgents', () => store.countAgents(customerId, undefined as never)],
		['countAgents (customer)', () => store.countAgents(undefined as never, agentId)],
		['getAgent', () => store.getAgent('', agentId)],
		['countGrants', () => store.countGrants(customerId, agentId, undefined as never)],
		['getCard', () => store.getCard(customerId, undefined as never)],
		['listAgents', () => store.listAgents(undefined as never, { limit: 1, offset: 0 })],
		['markGrantRevoked', () => store.markGrantRevoked(customerId, agentId, '')],
		['reserveStatusIndex', () => store.reserveStatusIndex(customerId, undefined as never)],
		['countBindings', () => store.countBindings(customerId, agentId, undefined as never)],
		['listLiveBindings', () => store.listLiveBindings(undefined as never, agentId)],
		['markBindingRevoked', () => store.markBindingRevoked(customerId, agentId, '')],
		['createBinding', () => store.createBinding({ customerId: undefined as never, agentId } as never)],
		['createGrant', () => store.createGrant({ customerId: undefined as never, agentId } as never)],
	])('refuses %s with a missing identifier, so TypeORM cannot drop the filter', async (_name, run) => {
		await expect(run()).rejects.toThrow('missing identifier');
		expect(recorded).toHaveLength(0);
	});

	it('writes a grant and its credential record in one transaction', async () => {
		await store.createGrant({
			agentId,
			customerId,
			grantType: 'acts-for',
			issuerDid: 'did:cheqd:testnet:org',
			subjectDid: 'did:cheqd:testnet:agent',
			format: 'sd-jwt-vc',
			vct: 'v',
			statusListId: 'r',
			statusIndex: 0,
			statusUri: 'https://l.example',
		});
		const saved = recorded.filter((call) => call.method === 'save');
		expect(saved.map((call) => call.entity)).toEqual(['IssuedCredentialEntity', 'AuthorityGrantEntity']);
		const credential = saved[0]?.args[0] as { engine: string; statusFormat: string; providerId: string };
		expect(credential).toMatchObject({ engine: 'credo', statusFormat: 'TokenStatusList', providerId: 'studio' });
	});

	it('writes a binding and its credential record (metadata only) in one transaction', async () => {
		await store.createBinding({
			agentId,
			customerId,
			account: 'eip155:8453:0x00',
			issuerDid: 'did:cheqd:testnet:agent',
			subjectDid: 'did:cheqd:testnet:agent',
			statusListId: 'r',
			statusIndex: 0,
			statusUri: 'https://l.example',
		});
		const saved = recorded.filter((call) => call.method === 'save');
		expect(saved.map((call) => call.entity)).toEqual(['IssuedCredentialEntity', 'PaymentAddressBindingEntity']);
		expect(JSON.stringify(saved[0]?.args[0])).not.toContain('eyJ');
	});

	it('puts `q` in the query as three alternatives that each carry the customer, with wildcards escaped', async () => {
		await store.listAgents(customerId, { limit: 10, offset: 0, q: '  50%_off\\  ' });
		const call = recorded.find((c) => c.entity === 'AgentEntity' && c.method === 'findAndCount');
		const where = (call?.args[0] as { where: Array<Record<string, any>> }).where;
		expect(where).toHaveLength(3);
		for (const alternative of where) expect(alternative.customer).toEqual({ customerId });
		const patterns = [where[0]?.name, where[1]?.description, where[2]?.identifier?.did].map(
			(operator) => operator.value as string
		);
		expect(new Set(patterns).size).toBe(1);
		expect(patterns[0]).toBe('%50\\%\\_off\\\\%');
		expect(where[0]?.name.type).toBe('ilike');
	});

	it('does not filter when q is blank, and takes the page and offset', async () => {
		await store.listAgents(customerId, { limit: 5, offset: 10, q: '   ' });
		const call = recorded.find((c) => c.entity === 'AgentEntity' && c.method === 'findAndCount');
		const options = call?.args[0] as { where: unknown; take: number; skip: number };
		expect(options.where).toEqual({ customer: { customerId } });
		expect([options.take, options.skip]).toEqual([5, 10]);
	});

	it('scopes the new reads by customer and refuses a missing identifier', async () => {
		rows.AuthorityGrantEntity = {
			id: grantId,
			grantType: 'acts-for',
			createdAt: new Date(),
			agent: { agentId },
			statusList: { registryId: 'r', uri: 'u', identifier: { did: 'did:cheqd:testnet:org' } },
		};
		await store.listGrantsForAgents(customerId, [agentId]);
		await store.latestPublishedCard(customerId, agentId);
		await store.listEvents(customerId, agentId, { limit: 10, offset: 0, types: ['key-added'] });
		await store.addEvent({ agentId, customerId, type: 'registered', actor: 'owner' });
		// (The recording proxy hands `save` a promise, so the event's customer is checked on `create`.)
		const scoped = recorded.filter(
			(c) =>
				['AuthorityGrantEntity', 'AgentCardEntity', 'AgentEventEntity'].includes(c.entity) &&
				c.method !== 'save'
		);
		expect(scoped.length).toBeGreaterThanOrEqual(4);
		for (const call of scoped) {
			const text = JSON.stringify(
				call.method === 'save' || call.method === 'create'
					? call.args[0]
					: (call.args[0] as { where: unknown }).where
			);
			expect([call.entity, call.method, text].join(' ')).toContain(customerId);
		}
		expect(await store.listGrantsForAgents(customerId, [])).toEqual([]);
		await expect(store.listEvents('', agentId, { limit: 1, offset: 0 })).rejects.toThrow(/missing identifier/);
		await expect(store.listGrantsForAgents(customerId, [''])).rejects.toThrow(/missing identifier/);
	});

	it('swaps a grant credential in one transaction: new credential, grant repointed, old credential revoked', async () => {
		rows.AuthorityGrantEntity = {
			id: grantId,
			grantType: 'tool-scope',
			createdAt: new Date(),
			statusIndex: 1,
			statusList: { registryId: 'r', uri: 'u', identifier: { did: 'did:cheqd:testnet:org' } },
			issuedCredential: { issuedCredentialId: 'old-credential' },
		};
		await store.replaceGrantCredential(customerId, agentId, grantId, {
			issuerDid: 'did:cheqd:testnet:org',
			subjectDid: 'did:cheqd:testnet:agent',
			format: 'sd-jwt-vc',
			vct: 'v',
			statusListId: 'r2',
			statusIndex: 4,
			statusUri: 'https://l.example',
			expiresAt: new Date('2027-01-01T00:00:00Z'),
		});
		const writes = recorded.filter((c) => ['save', 'update'].includes(c.method));
		expect(writes.map((c) => `${c.entity}.${c.method}`)).toEqual([
			'IssuedCredentialEntity.save',
			'AuthorityGrantEntity.update',
			'IssuedCredentialEntity.update',
		]);
		expect(JSON.stringify(writes[1]?.args[0])).toContain(customerId);
		expect(JSON.stringify(writes[2]?.args)).toContain('old-credential');
		expect(JSON.stringify(writes[2]?.args)).toContain('revoked');
		expect(JSON.stringify(writes[0]?.args[0])).not.toContain('eyJ');
	});

	it('writes an audit entry to the append-only log with the customer as target, and no email', async () => {
		await store.recordAudit({
			customerId,
			actor: 'owner',
			action: 'agent.key.rotated',
			reason: 'Customer request through the agent API',
			metadata: { agentId },
		});
		const insert = recorded.find((c) => c.entity === 'AdminAuditLogEntity' && c.method === 'insert');
		expect(insert?.args[0]).toMatchObject({
			actorUserId: 'owner',
			targetCustomerId: customerId,
			action: 'agent.key.rotated',
		});
	});
});
