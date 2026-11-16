import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTestDatabase, type TestDatabase } from './helpers/credo-database.js';

/**
 * READ-ONLY test of the Credo engine's accreditation verification against real Studio accreditations on the public
 * cheqd TESTNET, and a comparison with what the Veramo engine says about the same inputs. Nothing is written to the
 * ledger and no fee payer is needed. It needs the network and the data to still be there (testnet has been reset
 * before): three trust chain authorisations Studio issued as JWT credentials (`JwtProof2020`, Bitstring status entry),
 * later revoked, the ones credo-ts#39's `cheqd-live-credentials.e2e.test.ts` reads.
 *
 *   docker run -d --rm --name credo-acc-it-db -e POSTGRES_PASSWORD=postgres -p 54341:5432 postgres:16
 *   CREDO_TEST_DATABASE_URL=postgres://postgres:postgres@localhost:54341/postgres \
 *     npx tsx --import ./tests/integration/hooks/register-credo.mjs --test tests/integration/credo-accreditation.test.ts
 *
 * Optional: CREDO_LIVE_TESTNET_RPC_URL (default https://rpc.cheqd.network:443) and CREDO_LIVE_RESOLVER_URL (default
 * https://resolver.cheqd.net/1.0/identifiers/). Without CREDO_TEST_DATABASE_URL the suite is skipped.
 */
const adminUrl = process.env.CREDO_TEST_DATABASE_URL;
const skip = adminUrl ? false : 'set CREDO_TEST_DATABASE_URL to run (see the comment at the top of this file)';
const rpcUrl = process.env.CREDO_LIVE_TESTNET_RPC_URL || 'https://rpc.cheqd.network:443';
const resolverUrl = process.env.CREDO_LIVE_RESOLVER_URL || 'https://resolver.cheqd.net/1.0/identifiers/';

const ISSUER = 'did:cheqd:testnet:11ceabbd-1fdc-46c0-a15d-534c07926d2b';
const SUBJECT = 'did:cheqd:testnet:15b74787-6e48-4fd5-8020-eab24e990578';
const SCHEMA = { schemaId: 'https://schema.org/Learn', types: ['Learn'] };
const accreditations = [
	{ resource: '7591292e-c7d7-4008-883f-74a4d5f177fe', index: 218 },
	{ resource: '4034d169-9b32-46bc-95d2-ce537f27846a', index: 219 },
	{ resource: '9caa57b8-75ab-4520-bbd6-984fc28478da', index: 220 },
];
const urlOf = (resource: string) => `${ISSUER}/resources/${resource}`;

describe('Credo accreditations against real Studio accreditations on testnet (read-only)', { skip }, () => {
	let db: TestDatabase;
	// biome-ignore lint/suspicious/noExplicitAny: Studio's modules are imported dynamically by the helper
	let studio: any;
	// biome-ignore lint/suspicious/noExplicitAny: ditto
	let veramo: any;
	const alice = { customerId: randomUUID() } as never;
	const bob = { customerId: randomUUID() } as never;

	before(async () => {
		process.env.RESOLVER_URL = resolverUrl;
		db = await createTestDatabase(adminUrl as string, { rpcUrl });
		studio = db.studio;
		await db.insertCustomer((alice as { customerId: string }).customerId, 'alice');
		await db.insertCustomer((bob as { customerId: string }).customerId, 'bob');

		// The service AccreditationService verifies with: the Veramo agent that needs no customer key or payment account
		const { IdentityServiceStrategySetup } = await import('../../src/services/identity/index.js');
		const { VeramoEngine } = await import('../../src/services/identity/engine/veramo-engine.js');
		veramo = new VeramoEngine(IdentityServiceStrategySetup.unauthorized);
	});

	after(async () => {
		await db?.teardown();
	});

	const request = (didUrl: string, overrides: Record<string, unknown> = {}) => ({
		subjectDid: SUBJECT,
		didUrl,
		accreditedFor: [SCHEMA],
		verifyStatus: true,
		allowDeactivatedDid: false,
		...overrides,
	});

	for (const { resource, index } of accreditations) {
		it(`resolves ${resource}, verifies it without the status check, and reads its status as revoked`, async () => {
			const didUrl = urlOf(resource);
			const credential = await (await studio.engine.resolve(didUrl)).json();
			assert.equal(credential.credentialStatus.statusListIndex, String(index));
			assert.equal(credential.proof.type, 'JwtProof2020');

			// Step one: signature, data model and issuer, with the status check off (Credo throws for a JWT with a status entry)
			const unchecked = await studio.engine.verifyAccreditation(request(didUrl, { verifyStatus: false }), alice);
			assert.equal(unchecked.success, true, unchecked.error);
			assert.equal(unchecked.data.rootAuthorization, SUBJECT);
			assert.deepEqual(unchecked.data.accreditorDids, []);

			// Step two: the status entry on its own
			const status = await studio.engine.verifyCredential(credential, { verifyStatus: true }, alice);
			assert.equal(status.verified, false);
			assert.equal(status.error.errorCode, 'revoked');

			// And through the chain walk: revoked, in the words the Veramo path uses
			const checked = await studio.engine.verifyAccreditation(request(didUrl), alice);
			assert.equal(checked.success, false);
			assert.equal(checked.status, 200);
			assert.equal(
				checked.error,
				`Error on verifying accreditation ${didUrl}: ${ISSUER} is revoked in the trust chain`
			);
		});

		it(`gives the same verdict as the Veramo engine for ${resource}`, async () => {
			const didUrl = urlOf(resource);
			const cases: [string, Record<string, unknown>][] = [
				['with status', {}],
				['without status', { verifyStatus: false }],
				['wrong subject', { subjectDid: ISSUER }],
				['wrong schema', { accreditedFor: [{ schemaId: 'https://schema.org/Other', types: ['Other'] }] }],
				['unexpected root', { rootAuthorization: `${ISSUER}?resourceName=other` }],
			];
			for (const [label, overrides] of cases) {
				const credo = await studio.engine.verifyAccreditation(request(didUrl, overrides), alice);
				const veramoResult = await veramo.verifyAccreditation(request(didUrl, overrides), alice);
				// Compare the verdict and the text; the verification detail inside `data` differs by engine and is reported separately
				const verdict = (r: { success: boolean; status: number; error?: string }) => ({
					success: r.success,
					status: r.status,
					error: r.error,
				});
				console.log(`[${resource} ${label}] credo=${JSON.stringify(verdict(credo))}`);
				console.log(`[${resource} ${label}] veramo=${JSON.stringify(verdict(veramoResult))}`);
				assert.deepEqual(verdict(credo), verdict(veramoResult), `${label}: the engines disagree`);
				assert.deepEqual(
					credo.data?.accreditorDids,
					veramoResult.data?.accreditorDids,
					`${label}: accreditors`
				);
				assert.deepEqual(credo.data?.rootAuthorization, veramoResult.data?.rootAuthorization, `${label}: root`);
			}
		});
	}

	it('answers 404 for an accreditation that does not exist, as Veramo does', async () => {
		const didUrl = urlOf('11111111-1111-4111-8111-111111111111');
		const credo = await studio.engine.verifyAccreditation(request(didUrl), alice);
		const veramoResult = await veramo.verifyAccreditation(request(didUrl), alice);
		assert.equal(credo.status, 404);
		assert.deepEqual(
			{ success: credo.success, status: credo.status, error: credo.error },
			{ success: veramoResult.success, status: veramoResult.status, error: veramoResult.error }
		);
	});

	it('lists nothing for a customer who has issued nothing, and never another customer’s resources', async () => {
		const aliceList = await studio.engine.findLatestResourcesVersionsByType(
			'VerifiableAuthorizationForTrustChain',
			alice
		);
		const bobList = await studio.engine.findLatestResourcesVersionsByType(
			'VerifiableAuthorizationForTrustChain',
			bob,
			'testnet',
			ISSUER
		);
		assert.deepEqual(aliceList, { total: 0, resources: [] });
		assert.deepEqual(bobList, { total: 0, resources: [] });
	});
});
