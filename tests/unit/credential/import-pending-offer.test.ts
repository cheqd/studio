import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Importing a credential that is still waiting for the holder as an offer used to fail with 500: the offer's copy is
 * already in the data store under the same hash. Importing it now accepts that offer; importing a credential the
 * store already holds succeeds with the stored hash.
 */

const holderDid = 'did:cheqd:testnet:0f0e0d0c-0000-4000-8000-000000000002';
const issuerDid = 'did:cheqd:testnet:5f3b3b2e-0000-4000-8000-000000000001';
const customer = { customerId: 'c-1' } as never;

const jwtCredential = (jwt: string) => ({
	'@context': ['https://www.w3.org/2018/credentials/v1'],
	type: ['VerifiableCredential'],
	issuer: { id: issuerDid },
	issuanceDate: '2026-11-25T00:00:00Z',
	credentialSubject: { id: holderDid, name: 'Ada' },
	proof: { type: 'JwtProof2020', jwt },
});

let offers: any[];
const saved: any[] = [];
const saveCredential = jest.fn<(credential: unknown) => Promise<string>>();
const retrieveCredential = jest.fn<(hash: string) => Promise<unknown>>();

jest.unstable_mockModule('../../../src/database/connection/connection.js', () => ({
	Connection: {
		instance: {
			dbConnection: {
				getRepository: () => ({
					find: async ({ where }: any) =>
						offers.filter((offer) => offer.subjectId === where.subjectId && offer.status === where.status),
					save: async (entity: any) => {
						saved.push({ ...entity });
						return entity;
					},
				}),
			},
		},
	},
}));
jest.unstable_mockModule('../../../src/services/identity/index.js', () => ({
	IdentityServiceStrategySetup: class {
		agent = { saveCredential, retrieveCredential };
		async routed(kind: string) {
			if (kind === 'did') return { listDids: async () => ({ dids: [holderDid] }) };
			return { verifyCredential: async () => ({ verified: true }) };
		}
	},
}));

process.env.ENABLE_EXTERNAL_DB ??= 'false';
process.env.EXTERNAL_DB_ENCRYPTION_KEY ??= '0'.repeat(64);
const { ReceivedCredentials, credentialFingerprint } =
	await import('../../../src/services/api/received-credentials.js');
const { computeEntryHash } = await import('@veramo/utils');

describe('importing a credential that has a pending offer', () => {
	beforeEach(() => {
		saved.length = 0;
		saveCredential.mockReset();
		retrieveCredential.mockReset();
		offers = [
			{
				issuedCredentialId: 'ic-1',
				subjectId: holderDid,
				status: 'offered',
				veramoHash: 'hash-of-offer',
				veramoCredential: { raw: jwtCredential('h.offered.s') },
			},
		];
	});

	it('accepts the offer instead of saving the credential again', async () => {
		saveCredential.mockRejectedValue(new Error('duplicate key value violates unique constraint'));
		const result = await new ReceivedCredentials().importCredential(
			jwtCredential('h.offered.s') as never,
			customer,
			holderDid
		);
		expect(result.success).toBe(true);
		expect(result.credentialHash).toBe('hash-of-offer');
		expect(saveCredential).not.toHaveBeenCalled();
		expect(saved.map((row) => [row.issuedCredentialId, row.status])).toEqual([['ic-1', 'issued']]);
		expect(saved[0].subjectAcceptedAt).toBeInstanceOf(Date);
	});

	it('saves a different credential as before and leaves the offer pending', async () => {
		saveCredential.mockResolvedValue('hash-of-import');
		const result = await new ReceivedCredentials().importCredential(
			jwtCredential('h.other.s') as never,
			customer,
			holderDid
		);
		expect(result.credentialHash).toBe('hash-of-import');
		expect(saveCredential).toHaveBeenCalledTimes(1);
		expect(saved).toEqual([]);
		expect(offers[0].status).toBe('offered');
	});

	it('succeeds with the stored hash when the store already holds the credential', async () => {
		offers = [];
		const credential = jwtCredential('h.stored.s');
		saveCredential.mockRejectedValue(new Error('duplicate key value violates unique constraint'));
		retrieveCredential.mockImplementation(async (hash) =>
			hash === computeEntryHash(credential) ? credential : null
		);
		const result = await new ReceivedCredentials().importCredential(credential as never, customer, holderDid);
		expect(result.success).toBe(true);
		expect(result.credentialHash).toBe(computeEntryHash(credential));
	});

	it('still fails when saving fails for another reason', async () => {
		offers = [];
		saveCredential.mockRejectedValue(new Error('database unavailable'));
		retrieveCredential.mockResolvedValue(null);
		await expect(
			new ReceivedCredentials().importCredential(jwtCredential('h.new.s') as never, customer, holderDid)
		).rejects.toThrow('database unavailable');
	});
});

describe('credentialFingerprint', () => {
	it('is the same for a JWT credential given as a string or as an object with proof.jwt', () => {
		expect(credentialFingerprint('h.p.s')).toBe(credentialFingerprint(jwtCredential('h.p.s') as never));
	});

	it('matches a JSON-LD proof whatever the key order', () => {
		const a = { proof: { type: 'Ed25519Signature2020', proofValue: 'z1', created: 't' } };
		const b = { proof: { created: 't', proofValue: 'z1', type: 'Ed25519Signature2020' } };
		expect(credentialFingerprint(a as never)).toBe(credentialFingerprint(b as never));
		expect(credentialFingerprint({ proof: { proofValue: 'z2' } } as never)).not.toBe(
			credentialFingerprint(a as never)
		);
	});

	it('is undefined for a credential without a proof', () => {
		expect(credentialFingerprint({} as never)).toBeUndefined();
	});
});
