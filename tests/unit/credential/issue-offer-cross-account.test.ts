import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// U-59: an offer to another account's Credo DID was silently dropped (the credential was recorded as `issued`).
// It is now refused with 501 before anything is reserved or signed.
const SUBJECT = 'did:cheqd:testnet:5f3b3b2e-0000-4000-8000-0000000000aa';
const ISSUER = 'did:cheqd:testnet:5f3b3b2e-0000-4000-8000-000000000001';

let recorded: unknown;
let ownedBySubjectEngine = false;
const lookups: unknown[] = [];
const routedCalls: unknown[] = [];
const engineCalls: unknown[] = [];

jest.unstable_mockModule('../../../src/database/connection/connection.js', () => ({
	Connection: { instance: { dbConnection: { getRepository: () => ({}) } } },
}));
jest.unstable_mockModule('../../../src/services/identity/engine/db-lookups.js', () => ({
	DbArtifactEngineLookup: class {
		async recordedEngine(artifact: unknown) {
			lookups.push(artifact);
			return recorded;
		}
	},
}));
jest.unstable_mockModule('../../../src/services/identity/index.js', () => ({
	IdentityServiceStrategySetup: class {
		async routed(route: unknown, artifact: unknown) {
			routedCalls.push({ route, artifact });
			return { didExists: async () => ownedBySubjectEngine };
		}
		async engine(route: unknown) {
			engineCalls.push(route);
			// Stop right after the check under test: nothing is stored
			throw new Error('stop after routing');
		}
	},
}));

const { Credentials } = await import('../../../src/services/api/credentials.js');
const { CredoNotSupportedError } = await import('../../../src/services/identity/engine/credo/errors.js');
const { mapEngineError } = await import('../../../src/helpers/engine-errors.js');

const issue = (subjectDid: string, connector?: string) =>
	new Credentials().issueWithRecord(
		{ issuerDid: ISSUER, subjectDid, attributes: {}, format: 'jwt', connector } as never,
		{ customerId: 'c-1' } as never
	);

beforeEach(() => {
	recorded = undefined;
	ownedBySubjectEngine = false;
	lookups.length = 0;
	routedCalls.length = 0;
	engineCalls.length = 0;
});

describe('issuing to a DID another account holds on Credo', () => {
	it('is refused with 501 before the issuer engine is chosen or anything is signed', async () => {
		recorded = 'credo';
		const error = await issue(SUBJECT).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(CredoNotSupportedError);
		expect(mapEngineError(error)).toEqual({
			status: 501,
			code: 'NotSupported',
			error: expect.stringContaining('offering a credential to a DID held by another Studio account'),
		});
		expect(lookups).toEqual([{ kind: 'did', id: SUBJECT }]);
		expect(routedCalls).toEqual([{ route: 'did', artifact: { kind: 'did', id: SUBJECT } }]);
		expect(engineCalls).toEqual([]);
	});

	it('goes ahead for the issuer’s own Credo DID, a Veramo DID, an unrecorded DID and a non-cheqd DID', async () => {
		recorded = 'credo';
		ownedBySubjectEngine = true;
		await expect(issue(SUBJECT)).rejects.toThrow('stop after routing');
		ownedBySubjectEngine = false;
		for (const value of ['veramo', null, undefined]) {
			recorded = value;
			await expect(issue(SUBJECT)).rejects.toThrow('stop after routing');
		}
		lookups.length = 0;
		await expect(issue('did:key:z6Mkholder')).rejects.toThrow('stop after routing');
		expect(lookups).toEqual([]);
	});

	it('does not apply to the Dock connector', async () => {
		recorded = 'credo';
		await issue(SUBJECT, 'dock').catch(() => undefined);
		expect(lookups).toEqual([]);
	});
});
