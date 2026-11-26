import { describe, expect, it, jest } from '@jest/globals';

const signed: { format: unknown; context: unknown }[] = [];

jest.unstable_mockModule('../../../src/database/connection/connection.js', () => ({
	Connection: { instance: { dbConnection: { getRepository: () => ({}) } } },
}));
jest.unstable_mockModule('../../../src/services/identity/index.js', () => ({
	IdentityServiceStrategySetup: class {
		async engine() {
			return {
				async createCredential(credential: { '@context': unknown }, format: unknown) {
					signed.push({ format, context: credential['@context'] });
					// Stop once the engine has been asked to sign: nothing is published
					throw new Error('stop after signing');
				},
			};
		}
	},
}));

const { Credentials, credentialContexts } = await import('../../../src/services/api/credentials.js');

const issuerDid = 'did:cheqd:testnet:5f3b3b2e-0000-4000-8000-000000000001';
const customer = { customerId: 'c-1' } as never;

async function issue(request: Record<string, unknown>) {
	const credentials = new Credentials();
	const rows: { format: unknown }[] = [];
	const spied = credentials as unknown as { create: (c: unknown, row: { format: unknown }) => Promise<unknown> };
	jest.spyOn(spied, 'create').mockImplementation(async (_c, row) => {
		rows.push(row);
		return { issuedCredentialId: 'ic-1', retryCount: 0, ...row };
	});
	await credentials
		.issueWithRecord({ issuerDid, subjectDid: 'did:key:z6Mk', attributes: {}, ...request } as never, customer)
		.catch(() => undefined);
	return rows;
}

describe('credential issuance defaults', () => {
	it('signs a request with no format as VC-JWT, as documented, and records jwt on the row', async () => {
		signed.length = 0;
		const rows = await issue({});
		expect(signed[0]?.format).toBe('jwt');
		expect(rows[0]?.format).toBe('jwt');
	});

	it('keeps an explicit format', async () => {
		signed.length = 0;
		const rows = await issue({ format: 'jsonld' });
		expect(signed[0]?.format).toBe('jsonld');
		expect(rows[0]?.format).toBe('jsonld');
	});

	it('puts the base credentials context first, before the caller contexts', async () => {
		signed.length = 0;
		await issue({ format: 'jsonld', '@context': ['https://www.w3.org/2018/credentials/examples/v1'] });
		expect(signed[0]?.context).toEqual([
			'https://www.w3.org/2018/credentials/v1',
			'https://www.w3.org/2018/credentials/examples/v1',
		]);
	});
});

describe('credentialContexts', () => {
	it('returns only the base context when none is given', () => {
		expect(credentialContexts(undefined)).toEqual(['https://www.w3.org/2018/credentials/v1']);
	});

	it('does not repeat the base context when the caller already sent it', () => {
		expect(
			credentialContexts(['https://schema.org', 'https://www.w3.org/2018/credentials/v1', 'https://schema.org'])
		).toEqual(['https://www.w3.org/2018/credentials/v1', 'https://schema.org']);
	});
});
