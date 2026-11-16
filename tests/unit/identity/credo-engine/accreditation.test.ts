import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { CredoEngine } from '../../../../src/services/identity/engine/credo/credo-engine.js';
import { CredoOwnershipError } from '../../../../src/services/identity/engine/credo/errors.js';
import { decodeJwt } from '../../../../src/services/identity/engine/credo/jwt-vc.js';
import type { EngineDidDocument, JsonObject } from '../../../../src/services/identity/engine/types.js';
import { validStatus } from './credential-fakes.js';
import { customer, FakeRuntime, FakeStore } from './fakes.js';

const alice = customer('alice');
const bob = customer('bob');
const RESOLVER = 'https://resolver.cheqd.net/1.0/identifiers/';

const ROOT = 'did:cheqd:testnet:aaaaaaaa-0000-4000-8000-000000000001'; // issues the root authorisation
const GOV = 'did:cheqd:testnet:aaaaaaaa-0000-4000-8000-000000000002'; // authorised by ROOT, accredits
const ACC = 'did:cheqd:testnet:aaaaaaaa-0000-4000-8000-000000000003'; // accredited by GOV, attests
const USER = 'did:cheqd:testnet:aaaaaaaa-0000-4000-8000-000000000004'; // attested by ACC
const SCHEMA = { schemaId: 'https://schema.org/Learn', types: ['Learn'] };
const ROOT_AUTH = `${GOV}?resourceName=root-authorisation`;

const url = (did: string, name: string) => `${did}/resources/${name}`;
const A1 = url(ROOT, '11111111-1111-4111-8111-111111111111');
const A2 = url(GOV, '22222222-2222-4222-8222-222222222222');
const A3 = url(ACC, '33333333-3333-4333-8333-333333333333');

type Doc = Record<string, unknown>;

function accreditation(options: {
	issuer: string;
	subject: string;
	type: string;
	parent?: string;
	accreditedFor?: unknown[];
	status?: boolean;
}): Doc {
	const doc: Doc = {
		'@context': ['https://www.w3.org/2018/credentials/v1'],
		type: ['VerifiableCredential', options.type],
		issuer: { id: options.issuer },
		issuanceDate: '2026-11-06T14:05:19.000Z',
		credentialSubject: { id: options.subject, accreditedFor: options.accreditedFor ?? [SCHEMA] },
	};
	if (options.parent)
		doc.termsOfUse = {
			type: 'AccreditationPolicy',
			parentAccreditation: options.parent,
			rootAuthorization: ROOT_AUTH,
		};
	if (options.status) {
		doc.credentialStatus = {
			id: `${RESOLVER}${options.issuer}?resourceName=list&resourceType=BitstringStatusListCredential#7`,
			type: 'BitstringStatusListEntry',
			statusPurpose: 'message',
			statusListIndex: '7',
			statusListCredential: `${RESOLVER}${options.issuer}?resourceName=list&resourceType=BitstringStatusListCredential`,
		};
	}
	return doc;
}

const root = () => accreditation({ issuer: ROOT, subject: GOV, type: 'VerifiableAuthorizationForTrustChain' });
const accredit = () =>
	accreditation({ issuer: GOV, subject: ACC, type: 'VerifiableAccreditationToAccredit', parent: A1 });
const attest = () => accreditation({ issuer: ACC, subject: USER, type: 'VerifiableAccreditationToAttest', parent: A2 });

interface Harness {
	engine: CredoEngine;
	store: FakeStore;
	runtime: FakeRuntime;
	/** Documents the resolver serves, by DID URL. A URL that is not here answers with dereferencing metadata. */
	served: Map<string, Doc>;
	fetched: string[];
}

function harness(): Harness {
	const store = new FakeStore();
	const runtime = new FakeRuntime();
	const served = new Map<string, Doc>();
	const fetched: string[] = [];
	const fetchImpl = (async (input: string | URL | Request) => {
		const address = String(input);
		fetched.push(address);
		const found = served.get(address.slice(RESOLVER.length));
		return new Response(
			JSON.stringify(found ?? { dereferencingMetadata: { error: 'notFound' }, contentStream: null }),
			{ status: found ? 200 : 404, headers: { 'content-type': 'application/json' } }
		);
	}) as typeof fetch;
	const engine = new CredoEngine({ store, runtime, withPayerLock: (_a, work) => work(), fetch: fetchImpl });
	store.addPayer('alice', 'testnet');
	store.addPayer('bob', 'testnet');
	return { engine, store, runtime, served, fetched };
}

function serveChain(h: Harness, overrides: { [url: string]: Doc } = {}) {
	h.served.set(A1, overrides[A1] ?? root());
	h.served.set(A2, overrides[A2] ?? accredit());
	h.served.set(A3, overrides[A3] ?? attest());
}

const request = (overrides: Partial<Parameters<CredoEngine['verifyAccreditation']>[0]> = {}) => ({
	subjectDid: USER,
	didUrl: A3,
	accreditedFor: [SCHEMA],
	verifyStatus: true,
	allowDeactivatedDid: false,
	...overrides,
});

describe('CredoEngine.verifyAccreditation', () => {
	let h: Harness;
	beforeEach(() => {
		h = harness();
		serveChain(h);
	});

	it('walks a three link chain to the root and reports the accreditors and the root', async () => {
		const result = await h.engine.verifyAccreditation(request(), alice);
		expect(result).toMatchObject({
			success: true,
			status: 200,
			data: { accreditorDids: [GOV], rootAuthorization: GOV, verified: true },
		});
		expect(h.fetched).toEqual([A3, A2, A1].map((u) => `${RESOLVER}${u}`));
		expect(h.runtime.credentialState.verifyCredentialCalls).toHaveLength(3);
		expect(
			h.runtime.credentialState.verifyCredentialCalls.every((c) => c.tenantId === h.store.tenants.get('alice'))
		).toBe(true);
	});

	it('verifies first with Credo status switched off, then reads the status entry on its own', async () => {
		h.served.set(
			A2,
			accreditation({
				issuer: GOV,
				subject: ACC,
				type: 'VerifiableAccreditationToAccredit',
				parent: A1,
				status: true,
			})
		);
		h.runtime.credentialState.status = [{ ...validStatus('u'), statusPurpose: 'message' }];
		const result = await h.engine.verifyAccreditation(request(), alice);
		expect(result.success).toBe(true);
		// Only the link that has a status entry reads a status list, and it is read through the status call, not Credo's check
		expect(h.runtime.credentialState.statusCalls).toHaveLength(1);
		expect(h.runtime.credentialState.statusCalls[0].credential).toMatchObject({ issuer: GOV });
	});

	it('does not read status when it was not asked for', async () => {
		h.served.set(
			A2,
			accreditation({
				issuer: GOV,
				subject: ACC,
				type: 'VerifiableAccreditationToAccredit',
				parent: A1,
				status: true,
			})
		);
		const result = await h.engine.verifyAccreditation(request({ verifyStatus: false }), alice);
		expect(result.success).toBe(true);
		expect(h.runtime.credentialState.statusCalls).toEqual([]);
	});

	it.each([
		['revoked', { revoked: true, valid: false }],
		['suspended', { suspended: true, valid: false }],
	])('fails a chain with a %s accreditation, worded as the Veramo path words it', async (word, flags) => {
		h.served.set(
			A2,
			accreditation({
				issuer: GOV,
				subject: ACC,
				type: 'VerifiableAccreditationToAccredit',
				parent: A1,
				status: true,
			})
		);
		h.runtime.credentialState.status = [{ ...validStatus('u'), ...flags }];
		const result = await h.engine.verifyAccreditation(request(), alice);
		expect(result).toMatchObject({
			success: false,
			status: 200,
			error: `Error on verifying accreditation ${A2}: ${GOV} is ${word} in the trust chain`,
		});
	});

	it('fails closed when the status list cannot be read', async () => {
		h.served.set(
			A3,
			accreditation({
				issuer: ACC,
				subject: USER,
				type: 'VerifiableAccreditationToAttest',
				parent: A2,
				status: true,
			})
		);
		h.runtime.credentialState.status = new Error('list is unreachable');
		const result = await h.engine.verifyAccreditation(request(), alice);
		expect(result.success).toBe(false);
		expect(result.error).toContain('The credential status could not be read: list is unreachable');
	});

	it('reports a failed signature as the verification error', async () => {
		h.runtime.credentialState.verification = {
			isValid: false,
			checks: [{ name: 'signature', isValid: false, error: 'Invalid JWS signature' }],
		};
		const result = await h.engine.verifyAccreditation(request(), alice);
		expect(result).toMatchObject({
			success: false,
			status: 200,
			error: `Error on verifying accreditation ${A3}: Invalid JWS signature`,
		});
	});

	it('refuses an accreditation that does not cover the schema asked for (401)', async () => {
		const result = await h.engine.verifyAccreditation(
			request({ accreditedFor: [{ schemaId: 'https://schema.org/Other', types: ['Learn'] }] }),
			alice
		);
		expect(result).toMatchObject({ success: false, status: 401 });
		expect(result.error).toContain('does not have the permissions for the given schema');
	});

	it('refuses an accreditation whose type list is missing a type of the schema (401)', async () => {
		const result = await h.engine.verifyAccreditation(
			request({ accreditedFor: [{ schemaId: SCHEMA.schemaId, types: ['Learn', 'Teach'] }] }),
			alice
		);
		expect(result.status).toBe(401);
	});

	it('refuses an accreditation issued to a different subject (400)', async () => {
		const result = await h.engine.verifyAccreditation(request({ subjectDid: ACC }), alice);
		expect(result).toMatchObject({ success: false, status: 400 });
		expect(result.error).toContain(`Expected accreditation to be linked to subject DID ${ACC}`);
	});

	it('checks each link against the schemas the link below it was accredited for', async () => {
		// The accreditor was only accredited for another schema
		h.served.set(
			A2,
			accreditation({
				issuer: GOV,
				subject: ACC,
				type: 'VerifiableAccreditationToAccredit',
				parent: A1,
				accreditedFor: [{ schemaId: 'https://schema.org/Other', types: ['Other'] }],
			})
		);
		const result = await h.engine.verifyAccreditation(request(), alice);
		expect(result).toMatchObject({ success: false, status: 401 });
		expect(result.error).toContain(A2);
	});

	it('fails when an issuer DID in the chain is deactivated, unless that is allowed', async () => {
		h.runtime.credentialState.resolutions.set(GOV, {
			didDocument: { id: GOV } as EngineDidDocument,
			didDocumentMetadata: { deactivated: true },
			didResolutionMetadata: {},
		});
		const refused = await h.engine.verifyAccreditation(request(), alice);
		expect(refused).toMatchObject({ success: false, status: 200 });
		expect(refused.error).toContain('are deactivated in the trust chain');

		const allowed = await h.engine.verifyAccreditation(request({ allowDeactivatedDid: true }), alice);
		expect(allowed.success).toBe(true);
	});

	it('answers 404 when a link cannot be found', async () => {
		h.served.delete(A2);
		const result = await h.engine.verifyAccreditation(request(), alice);
		expect(result).toMatchObject({ success: false, status: 404 });
		expect(result.error).toBe(`Error on verifying accreditation ${A2}: DID URL ${A2} is not found`);
	});

	it('only ever sends a DID URL to the resolver, never an address the credential names', async () => {
		h.served.set(
			A3,
			accreditation({
				issuer: ACC,
				subject: USER,
				type: 'VerifiableAccreditationToAttest',
				parent: 'https://evil.example/x',
			})
		);
		const result = await h.engine.verifyAccreditation(request(), alice);
		expect(result).toMatchObject({ success: false, status: 404 });
		expect(h.fetched).toEqual([`${RESOLVER}${A3}`]);
	});

	it('refuses a chain that leads back to a link it has already passed through', async () => {
		h.served.set(
			A2,
			accreditation({ issuer: GOV, subject: ACC, type: 'VerifiableAccreditationToAccredit', parent: A3 })
		);
		h.served.set(
			A3,
			accreditation({ issuer: ACC, subject: USER, type: 'VerifiableAccreditationToAttest', parent: A2 })
		);
		// Each link names the other as its parent, so the subjects would not match for long; make them consistent
		h.served.set(
			A2,
			accreditation({ issuer: GOV, subject: ACC, type: 'VerifiableAccreditationToAccredit', parent: A3 })
		);
		h.served.set(
			A3,
			accreditation({ issuer: ACC, subject: GOV, type: 'VerifiableAccreditationToAccredit', parent: A2 })
		);
		const result = await h.engine.verifyAccreditation(request({ subjectDid: GOV }), alice);
		expect(result).toMatchObject({ success: false, status: 400 });
		expect(result.error).toContain('refers back to an accreditation it has already passed through');
		expect(h.fetched.length).toBeLessThanOrEqual(3);
	});

	it('refuses a link that names itself as its parent', async () => {
		h.served.set(
			A3,
			accreditation({ issuer: ACC, subject: ACC, type: 'VerifiableAccreditationToAccredit', parent: A3 })
		);
		const result = await h.engine.verifyAccreditation(request({ subjectDid: ACC }), alice);
		expect(result).toMatchObject({ success: false, status: 400 });
		expect(result.error).toContain('already passed through');
	});

	it('stops a chain that is longer than the limit', async () => {
		const links = Array.from({ length: 14 }, (_, i) =>
			url(`did:cheqd:testnet:bbbbbbbb-0000-4000-8000-0000000000${String(i).padStart(2, '0')}`, `r${i}`)
		);
		const dids = links.map((link) => link.split('/')[0]);
		links.forEach((link, i) => {
			h.served.set(
				link,
				accreditation({
					issuer: dids[i],
					subject: i === 0 ? USER : dids[i - 1],
					type: 'VerifiableAccreditationToAccredit',
					parent: links[i + 1],
				})
			);
		});
		const result = await h.engine.verifyAccreditation(request({ didUrl: links[0] }), alice);
		expect(result).toMatchObject({ success: false, status: 400 });
		expect(result.error).toContain('longer than the 10 links');
		expect(h.fetched.length).toBe(10);
	});

	it('refuses an unexpected root authorisation', async () => {
		const result = await h.engine.verifyAccreditation(request({ rootAuthorization: `${ROOT}?other` }), alice);
		expect(result).toMatchObject({ success: false, status: 200 });
		expect(result.error).toContain('Expected accreditation to be linked to root accreditation');
	});

	it('reads an unreadable resolver answer as an error, not as "not found"', async () => {
		const broken = new CredoEngine({
			store: h.store,
			runtime: h.runtime,
			withPayerLock: (_a, work) => work(),
			fetch: (async () => new Response('<html>bad gateway</html>', { status: 502 })) as typeof fetch,
		});
		await expect(broken.verifyAccreditation(request(), alice)).rejects.toThrow('unreadable answer (HTTP 502)');
	});

	it('needs a customer', async () => {
		await expect(h.engine.verifyAccreditation(request(), undefined as never)).rejects.toThrow('Customer not found');
	});
});

describe('CredoEngine.findLatestResourcesVersionsByType', () => {
	it('lists only the calling customer’s resources of the type, and never another customer’s', async () => {
		const h = harness();
		const type = 'VerifiableAccreditationToAccredit';
		h.store.resources.push(
			{ customerId: 'alice', did: GOV, resourceId: 'r1', resourceType: type },
			{ customerId: 'alice', did: GOV, resourceId: 'r2', resourceType: 'VerifiableAccreditationToAttest' },
			{ customerId: 'bob', did: ACC, resourceId: 'r3', resourceType: type }
		);
		const mine = await h.engine.findLatestResourcesVersionsByType(type, alice);
		expect(mine.resources.map((r) => r.resourceId)).toEqual(['r1']);
		const theirs = await h.engine.findLatestResourcesVersionsByType(type, bob);
		expect(theirs.resources.map((r) => r.resourceId)).toEqual(['r3']);
		// Naming the other customer's DID finds nothing, the same as naming a DID that does not exist
		const crossTenant = await h.engine.findLatestResourcesVersionsByType(type, bob, undefined, GOV);
		const missing = await h.engine.findLatestResourcesVersionsByType(type, bob, undefined, ROOT);
		expect(crossTenant).toEqual(missing);
		expect(crossTenant.total).toBe(0);
	});

	it('needs a customer', async () => {
		await expect(harness().engine.findLatestResourcesVersionsByType('x', undefined as never)).rejects.toThrow(
			'Customer not found'
		);
	});
});

describe('issuing and changing the status of an accreditation on Credo', () => {
	/** A runtime that can read one status list, the way the ledger would serve it. */
	class ListRuntime extends FakeRuntime {
		async readResource(didUrl: string) {
			if (!didUrl.includes('resourceName=list')) return { error: 'notFound' };
			return {
				resource: {
					bitstringStatusListCredential: {
						credentialSubject: { type: 'BitstringStatusList', statusPurpose: ['message'] },
					},
					metadata: {
						encrypted: false,
						encoding: 'base64url',
						length: 131072,
						statusSize: 2,
						statusMessages: [
							{ status: '0x0', message: 'valid' },
							{ status: '0x1', message: 'revoked' },
							{ status: '0x2', message: 'suspended' },
							{ status: '0x3', message: 'unknown' },
						],
					},
				},
				resourceMetadata: {
					id: randomUUID(),
					collectionId: 'c',
					name: 'list',
					version: '1.0',
					resourceType: 'BitstringStatusListCredential',
					mediaType: 'application/json',
				},
			};
		}
	}

	async function issuerDid(store: FakeStore, runtime: FakeRuntime, engine: CredoEngine, who: typeof alice) {
		const did = `did:cheqd:testnet:${randomUUID()}`;
		const key = await engine.createKey('Ed25519', who);
		const { privateJwk } = runtime.imported.find((entry) => entry.keyId === key.kid) as never;
		const { d: _d, kid: _kid, ...publicKeyJwk } = privateJwk as Record<string, unknown>;
		const method = { id: `${did}#key-1`, type: 'JsonWebKey2020', controller: did, publicKeyJwk };
		const document: EngineDidDocument = {
			id: did,
			verificationMethod: [method],
			authentication: [method.id],
			assertionMethod: [method.id],
		};
		await engine.createDid('testnet', document, who);
		runtime.credentialState.resolutions.set(did, {
			didDocument: document,
			didDocumentMetadata: {},
			didResolutionMetadata: {},
		});
		return did;
	}

	const payload = (did: string, termsOfUse: JsonObject): JsonObject => ({
		'@context': ['https://www.w3.org/2018/credentials/v1'],
		type: ['VerifiableCredential', 'VerifiableAccreditationToAccredit'],
		issuer: { id: did },
		credentialSubject: { id: ACC, accreditedFor: [SCHEMA] },
		termsOfUse,
	});

	let store: FakeStore;
	let runtime: ListRuntime;
	let engine: CredoEngine;
	beforeEach(() => {
		store = new FakeStore();
		runtime = new ListRuntime();
		engine = new CredoEngine({ store, runtime, withPayerLock: (_a, work) => work() });
		store.addPayer('alice', 'testnet');
	});

	it('issues an accreditation with its terms of use and the Bitstring entry Veramo would write', async () => {
		const did = await issuerDid(store, runtime, engine, alice);
		const issued = await engine.createCredential(
			payload(did, { type: 'AccreditationPolicy', parentAccreditation: A1, rootAuthorization: ROOT_AUTH }),
			'jwt',
			{
				statusListType: 'BitstringStatusList',
				statusPurpose: 'message',
				statusListName: 'list',
				statusListIndex: 7,
			},
			alice
		);
		const claims = decodeJwt((issued.proof as JsonObject).jwt as string)?.payload.vc as JsonObject;
		const list = `${RESOLVER}${did}?resourceName=list&resourceType=BitstringStatusListCredential`;
		expect(claims.credentialStatus).toEqual({
			id: `${list}#7`,
			type: 'BitstringStatusListEntry',
			statusPurpose: 'message',
			statusListIndex: '7',
			statusListCredential: list,
			statusSize: 2,
			statusMessage: [
				{ status: '0x0', message: 'valid' },
				{ status: '0x1', message: 'revoked' },
				{ status: '0x2', message: 'suspended' },
				{ status: '0x3', message: 'unknown' },
			],
		});
		expect(claims.termsOfUse).toEqual({
			type: 'AccreditationPolicy',
			parentAccreditation: A1,
			rootAuthorization: ROOT_AUTH,
		});
		expect(claims['@context']).toEqual([
			'https://www.w3.org/2018/credentials/v1',
			'https://www.w3.org/ns/credentials/status/v1',
		]);
		expect(issued.credentialStatus).toMatchObject({ statusListIndex: '7' });
	});

	it('refuses to issue without the index Studio reserved, so it never hands out one itself', async () => {
		const did = await issuerDid(store, runtime, engine, alice);
		await expect(
			engine.createCredential(
				payload(did, {}),
				'jwt',
				{ statusListType: 'BitstringStatusList', statusPurpose: 'message', statusListName: 'list' },
				alice
			)
		).rejects.toThrow('statusListIndex is required');
	});

	it('refuses an issuer DID that is another customer’s, with the answer a missing DID gets', async () => {
		const did = await issuerDid(store, runtime, engine, alice);
		const options = {
			statusListType: 'BitstringStatusList',
			statusPurpose: 'message',
			statusListName: 'list',
			statusListIndex: 1,
		};
		const crossTenant = await engine.createCredential(payload(did, {}), 'jwt', options, bob).catch((e) => e);
		const missing = await engine
			.createCredential(
				payload('did:cheqd:testnet:11111111-1111-4111-8111-111111111111', {}),
				'jwt',
				options,
				bob
			)
			.catch((e) => e);
		expect(crossTenant).toBeInstanceOf(CredoOwnershipError);
		expect(crossTenant.message).toBe(`${did} not found in wallet`);
		expect(missing.message).toBe('did:cheqd:testnet:11111111-1111-4111-8111-111111111111 not found in wallet');
		expect(runtime.credentialState.signCalls).toEqual([]);
	});

	it.each(['revokeCredentials', 'suspendCredentials', 'reinstateCredentials'] as const)(
		'refuses %s on an accreditation whose issuer DID is not the caller’s',
		async (method) => {
			const did = await issuerDid(store, runtime, engine, alice);
			const accreditationOfAlice = {
				...accreditation({
					issuer: did,
					subject: ACC,
					type: 'VerifiableAccreditationToAccredit',
					parent: A1,
					status: true,
				}),
			};
			const error = await engine[method](
				accreditationOfAlice as JsonObject,
				'BitstringStatusList',
				true,
				bob,
				''
			).catch((e) => e);
			expect(error).toBeInstanceOf(CredoOwnershipError);
			expect(error.message).toBe(`${did} not found in wallet`);
		}
	);
});
