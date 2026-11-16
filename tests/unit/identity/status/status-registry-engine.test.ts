import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Which engine the router picks for the new status list; the service must store exactly that on the row.
let chosen: 'veramo' | 'credo' = 'credo';
const saved: Record<string, unknown>[] = [];

jest.unstable_mockModule('../../../../src/database/connection/connection.js', () => ({
	Connection: {
		instance: {
			dbConnection: {
				getRepository: () => ({
					save: async (row: Record<string, unknown>) => {
						saved.push(row);
						return row;
					},
				}),
			},
		},
	},
}));
jest.unstable_mockModule('../../../../src/services/identity/index.js', () => ({
	IdentityServiceStrategySetup: class {
		async engine() {
			return {
				name: chosen,
				broadcastBitstringStatusList: async () => ({
					resourceMetadata: { resourceName: 'list', resourceType: 'BitstringStatusListCredential' },
				}),
				createUnencryptedBitstringStatusList: async () => ({
					resource: { metadata: { length: 131072 } },
					resourceMetadata: { resourceName: 'list', resourceType: 'BitstringStatusListCredential' },
				}),
			};
		}
	},
}));
jest.unstable_mockModule('../../../../src/services/api/identifier.js', () => ({
	IdentifierService: { instance: { get: async () => ({ did: 'did:cheqd:testnet:abc' }) } },
}));
jest.unstable_mockModule('../../../../src/services/track/tracker.js', () => ({ eventTracker: { emit: () => true } }));

const { CredentialStatusService } = await import('../../../../src/services/api/credential-status.js');

const customer = { customerId: 'c-1' } as never;
const body = { did: 'did:cheqd:testnet:abc', statusListName: 'list' } as never;
const query = { listType: 'BitstringStatusList', statusPurpose: 'revocation' } as never;

beforeEach(() => {
	saved.length = 0;
});

describe('status registry rows record the engine that created the list', () => {
	it('stores engine credo for a list created through Credo', async () => {
		chosen = 'credo';
		const result = await new CredentialStatusService().createUnencryptedStatusList(body, query, customer);
		expect(result.error).toBeUndefined();
		expect(result.success).toBe(true);
		expect(saved[0]?.engine).toBe('credo');
	});

	it('stores engine veramo for a list created through Veramo', async () => {
		chosen = 'veramo';
		await new CredentialStatusService().createUnencryptedStatusList(body, query, customer);
		expect(saved[0]?.engine).toBe('veramo');
	});
});
