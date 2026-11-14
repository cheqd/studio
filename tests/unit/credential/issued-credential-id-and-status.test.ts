import { beforeEach, describe, expect, it, jest } from '@jest/globals';

type Row = Record<string, any>;
let rows: Row[] = [];
const updates: { where: Row; set: Row }[] = [];

const matches = (row: Row, where: Row): boolean =>
	Object.entries(where).every(([key, want]) => {
		if (want && typeof want === 'object' && (want as any).type === 'in') return (want as any).value.includes(row[key]);
		if (want && typeof want === 'object') return matches(row[key] ?? {}, want);
		return row[key] === want;
	});

jest.unstable_mockModule('../../../src/database/connection/connection.js', () => ({
	Connection: {
		instance: {
			dbConnection: {
				getRepository: () => ({
					findOne: async ({ where }: { where: Row }) => rows.find((row) => matches(row, where)) ?? null,
					find: async ({ where }: { where: Row }) => rows.filter((row) => matches(row, where)),
					update: async (where: Row, set: Row) => {
						updates.push({ where, set });
						return { affected: 1 };
					},
				}),
			},
		},
	},
}));

const { Credentials } = await import('../../../src/services/api/credentials.js');
const customer = { customerId: 'c-1' } as never;
const ID = 'fdde1488-1111-4222-8333-444455556666';
const VC_ID = '43ab0a79-1111-4222-8333-444455556666';
const entry = {
	id: 'did:cheqd:testnet:abc?resourceName=l&resourceType=BitstringStatusListCredential#7',
	statusListIndex: '7',
};

beforeEach(() => {
	updates.length = 0;
	rows = [
		{
			issuedCredentialId: ID,
			providerCredentialId: `urn:uuid:${VC_ID}`,
			providerId: 'studio',
			issuerId: 'did:cheqd:testnet:abc',
			statusIndex: 7,
			status: 'offered',
			offerExpiresAt: new Date(),
			credentialStatus: entry,
			issuedAt: new Date(),
			customer: { customerId: 'c-1' },
		},
	];
});

describe('issued credential id', () => {
	it('is found by its record id', async () => {
		expect((await new Credentials().get(ID, customer))?.issuedCredentialId).toBe(ID);
	});

	it('is also found by the credential id, bare or as a URN', async () => {
		expect((await new Credentials().get(VC_ID, customer))?.issuedCredentialId).toBe(ID);
		expect((await new Credentials().get(`urn:uuid:${VC_ID}`, customer))?.issuedCredentialId).toBe(ID);
	});

	it('is not found for another customer', async () => {
		expect(await new Credentials().get(VC_ID, { customerId: 'c-2' } as never)).toBeNull();
	});
});

describe('issued credential status follows revoke, suspend and reinstate', () => {
	const credential = { issuer: { id: 'did:cheqd:testnet:abc' }, credentialStatus: entry };

	it('records revoked and suspended', async () => {
		expect(await new Credentials().recordStatusChange(credential, 'revoke', customer)).toBe(1);
		expect(updates.at(-1)?.set.status).toBe('revoked');
		await new Credentials().recordStatusChange(credential, 'suspend', customer);
		expect(updates.at(-1)?.set.status).toBe('suspended');
	});

	it('returns an unaccepted offer to offered on reinstate', async () => {
		await new Credentials().recordStatusChange(credential, 'reinstate', customer);
		expect(updates.at(-1)?.set.status).toBe('offered');
	});

	it('leaves rows alone when the status entry does not match, and never throws', async () => {
		expect(
			await new Credentials().recordStatusChange(
				{ ...credential, credentialStatus: { ...entry, id: 'other#7' } },
				'revoke',
				customer
			)
		).toBe(0);
		expect(await new Credentials().recordStatusChange(undefined, 'revoke', customer)).toBe(0);
		expect(updates).toHaveLength(0);
	});
});
