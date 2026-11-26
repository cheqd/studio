import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const saved: any[] = [];
const rows = new Map<string, any>();
const deleteMock = jest.fn(async (where: any) => {
	rows.delete(where.issuedCredentialId);
});
const updateMock = jest.fn(async (where: any, patch: any) => {
	Object.assign(rows.get(where.issuedCredentialId) ?? {}, patch);
});
let failure: Error;

jest.unstable_mockModule('../../../src/database/connection/connection.js', () => ({
	Connection: {
		instance: {
			dbConnection: {
				getRepository: () => ({
					save: async (entity: any) => {
						saved.push(entity);
						rows.set(entity.issuedCredentialId, entity);
						return entity;
					},
					delete: deleteMock,
					update: updateMock,
					findOne: async () => null,
				}),
			},
		},
	},
}));
jest.unstable_mockModule('../../../src/services/identity/index.js', () => ({
	IdentityServiceStrategySetup: class {
		async engine() {
			return {
				name: 'credo',
				createCredential: async () => {
					throw failure;
				},
			};
		}
	},
}));

const { Credentials } = await import('../../../src/services/api/credentials.js');

const request = {
	issuerDid: 'did:cheqd:testnet:5f3b3b2e-0000-4000-8000-000000000001',
	subjectDid: 'did:key:z6Mk',
	attributes: {},
	format: 'jwt',
} as never;

describe('a failure after the tracking row is created', () => {
	beforeEach(() => {
		saved.length = 0;
		rows.clear();
		deleteMock.mockClear();
		updateMock.mockClear();
		failure = new Error('signing failed');
	});

	it('removes the row and leaves no unknown row', async () => {
		await expect(new Credentials().issueWithRecord(request, { customerId: 'c-1' } as never)).rejects.toThrow(
			'signing failed'
		);
		expect(saved).toHaveLength(1);
		expect(deleteMock).toHaveBeenCalledTimes(1);
		expect([...rows.values()].filter((row) => row.status === 'unknown')).toEqual([]);
		expect(rows.size).toBe(0);
	});

	it('records the failure as unknown, and still raises it, when the row cannot be removed', async () => {
		deleteMock.mockRejectedValueOnce(new Error('db down'));
		await expect(new Credentials().issueWithRecord(request, { customerId: 'c-1' } as never)).rejects.toThrow(
			'signing failed'
		);
		expect([...rows.values()].map((row) => [row.status, row.lastError])).toEqual([['unknown', 'signing failed']]);
	});
});
