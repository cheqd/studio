import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VeramoEngine } from '../../../../src/services/identity/engine/veramo-engine.js';
import type { IIdentityService } from '../../../../src/services/identity/index.js';
import type { CustomerEntity } from '../../../../src/database/entities/customer.entity.js';

/**
 * The Veramo engine runs the chain walk AccreditationService always ran, against the Veramo identity service. These
 * tests pin that: every call lands on the same service method with the same arguments, the 30 second cache still
 * applies, and no depth limit is added.
 */
const customer = { customerId: 'cust-veramo-accreditation' } as unknown as CustomerEntity;
const GOV = 'did:cheqd:testnet:cccccccc-0000-4000-8000-000000000001';
const ACC = 'did:cheqd:testnet:cccccccc-0000-4000-8000-000000000002';
const ROOT_URL = `${GOV}/resources/c1111111-1111-4111-8111-111111111111`;
const SCHEMA = { schemaId: 'https://schema.org/Learn', types: ['Learn'] };

const root = {
	type: ['VerifiableCredential', 'VerifiableAuthorizationForTrustChain'],
	issuer: { id: GOV },
	credentialSubject: { id: ACC, accreditedFor: [SCHEMA] },
};
const leaf = {
	type: ['VerifiableCredential', 'VerifiableAccreditationToAttest'],
	issuer: { id: ACC },
	credentialSubject: { id: 'did:cheqd:testnet:cccccccc-0000-4000-8000-000000000003', accreditedFor: [SCHEMA] },
	termsOfUse: { parentAccreditation: ROOT_URL, rootAuthorization: `${ACC}?root` },
};

function service(documents: Record<string, unknown>, verify: unknown = { verified: true }) {
	const resolve = jest.fn(async (didUrl: string) => ({
		json: async () => documents[didUrl] ?? { dereferencingMetadata: { error: 'notFound' } },
	}));
	const resolveDid = jest.fn(async () => ({ didDocument: {}, didDocumentMetadata: {}, didResolutionMetadata: {} }));
	const verifyCredential = jest.fn(async () => verify);
	return {
		resolve,
		resolveDid,
		verifyCredential,
		service: { resolve, resolveDid, verifyCredential } as unknown as IIdentityService,
	};
}

describe('VeramoEngine.verifyAccreditation', () => {
	let leafUrl: string;
	beforeEach(() => {
		// A fresh URL per test: the resolve cache is shared across the process and lives 30 seconds
		leafUrl = `${ACC}/resources/${crypto.randomUUID()}`;
	});

	const request = () => ({
		subjectDid: leaf.credentialSubject.id,
		didUrl: leafUrl,
		accreditedFor: [SCHEMA],
		verifyStatus: true,
		allowDeactivatedDid: false,
	});

	it('walks the chain through the Veramo service, passing the verification options and the customer', async () => {
		const fake = service({ [leafUrl]: leaf, [ROOT_URL]: root });
		const result = await new VeramoEngine(fake.service).verifyAccreditation(
			{ ...request(), policies: { credentialStatus: true } },
			customer
		);
		expect(result).toMatchObject({
			success: true,
			status: 200,
			data: { accreditorDids: [], rootAuthorization: ACC },
		});
		expect(fake.verifyCredential).toHaveBeenCalledTimes(2);
		expect(fake.verifyCredential).toHaveBeenCalledWith(
			leaf,
			{ verifyStatus: true, policies: { credentialStatus: true } },
			customer
		);
		expect(fake.resolveDid).toHaveBeenCalledWith(ACC);
		expect(fake.resolveDid).toHaveBeenCalledWith(GOV);
	});

	it('words a revoked link the way it always has', async () => {
		const fake = service(
			{ [leafUrl]: leaf, [ROOT_URL]: root },
			{ verified: false, valid: false, message: 'revoked' }
		);
		const result = await new VeramoEngine(fake.service).verifyAccreditation(request(), customer);
		expect(result).toMatchObject({
			success: false,
			status: 200,
			error: `Error on verifying accreditation ${leafUrl}: ${ACC} is revoked in the trust chain`,
		});
	});

	it('answers 404 for a link that is not found and does not cache the miss', async () => {
		const fake = service({ [leafUrl]: leaf });
		const engine = new VeramoEngine(fake.service);
		// A customer of its own, so nothing the other tests cached is found
		const fresh = { customerId: crypto.randomUUID() } as unknown as CustomerEntity;
		const first = await engine.verifyAccreditation(request(), fresh);
		expect(first).toMatchObject({ success: false, status: 404 });
		fake.resolve.mockClear();
		await engine.verifyAccreditation(request(), fresh);
		// The leaf came from the cache, the missing parent was asked for again
		expect(fake.resolve.mock.calls.map(([url]) => url)).toEqual([ROOT_URL]);
	});

	it('keeps the cache per customer', async () => {
		const fake = service({ [leafUrl]: leaf, [ROOT_URL]: root });
		const engine = new VeramoEngine(fake.service);
		await engine.verifyAccreditation(request(), customer);
		fake.resolve.mockClear();
		await engine.verifyAccreditation(request(), { customerId: 'someone-else' } as unknown as CustomerEntity);
		expect(fake.resolve).toHaveBeenCalledWith(leafUrl);
	});
});

describe('VeramoEngine.findLatestResourcesVersionsByType', () => {
	it('delegates to the service unchanged', async () => {
		const findLatest = jest.fn(async () => ({ total: 0, resources: [] }));
		const engine = new VeramoEngine({
			findLatestResourcesVersionsByType: findLatest,
		} as unknown as IIdentityService);
		await engine.findLatestResourcesVersionsByType('T', customer, 'testnet', 'did:x', 2, 5);
		expect(findLatest).toHaveBeenCalledWith('T', customer, 'testnet', 'did:x', 2, 5);
	});
});
