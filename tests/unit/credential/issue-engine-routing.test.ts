import { describe, expect, it, jest } from '@jest/globals';

const calls: { route: unknown; artifact: unknown; hints: unknown }[] = [];

jest.unstable_mockModule('../../../src/database/connection/connection.js', () => ({
	Connection: { instance: { dbConnection: { getRepository: () => ({}) } } },
}));
jest.unstable_mockModule('../../../src/services/identity/index.js', () => ({
	IdentityServiceStrategySetup: class {
		async engine(route: unknown, artifact: unknown, hints: unknown) {
			calls.push({ route, artifact, hints });
			// Stop right after the engine is chosen: nothing is stored
			throw new Error('stop after routing');
		}
	},
}));

const { Credentials } = await import('../../../src/services/api/credentials.js');

describe('credential issuance routing', () => {
	it('routes by the issuer DID, falling back to the credential flag only when the issuer has no record', async () => {
		const issuerDid = 'did:cheqd:testnet:5f3b3b2e-0000-4000-8000-000000000001';
		await expect(
			new Credentials().issueWithRecord(
				{ issuerDid, subjectDid: 'did:key:z6Mk', attributes: {}, format: 'jwt' } as never,
				{ customerId: 'c-1' } as never
			)
		).rejects.toThrow('stop after routing');
		expect(calls).toEqual([
			{
				route: 'credential',
				artifact: { kind: 'did', id: issuerDid },
				hints: { flagWhenUnrecorded: true },
			},
		]);
	});
});
