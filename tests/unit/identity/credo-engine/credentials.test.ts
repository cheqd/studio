import { randomUUID, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from '@jest/globals';
import { CredoEngine } from '../../../../src/services/identity/engine/credo/credo-engine.js';
import { CredoNotSupportedError } from '../../../../src/services/identity/engine/credo/errors.js';
import {
	credentialToJwtPayload,
	decodeJwt,
	jwtToCredential,
} from '../../../../src/services/identity/engine/credo/jwt-vc.js';
import type { EngineDidDocument, JsonObject } from '../../../../src/services/identity/engine/types.js';
import { validStatus } from './credential-fakes.js';
import { customer, FakeRuntime, FakeStore } from './fakes.js';

const alice = customer('alice');
const bob = customer('bob');

interface Harness {
	engine: CredoEngine;
	store: FakeStore;
	runtime: FakeRuntime;
}

function harness(): Harness {
	const store = new FakeStore();
	const runtime = new FakeRuntime();
	const engine = new CredoEngine({ store, runtime, withPayerLock: (_address, work) => work() });
	store.addPayer('alice', 'testnet');
	store.addPayer('bob', 'testnet');
	return { engine, store, runtime };
}

type KeyType = 'Ed25519' | 'Secp256r1';

/** Creates keys and a DID for the customer, with one verification method per key, and makes the DID resolvable. */
async function makeDid(h: Harness, who: typeof alice, types: KeyType[]) {
	const did = `did:cheqd:testnet:${randomUUID()}`;
	const methods: Record<string, unknown>[] = [];
	const keys = [];
	for (const [index, type] of types.entries()) {
		const key = await h.engine.createKey(type, who);
		const { privateJwk } = h.runtime.imported.find((entry) => entry.keyId === key.kid) as never;
		const { d: _d, kid: _kid, ...publicKeyJwk } = privateJwk as Record<string, unknown>;
		methods.push({ id: `${did}#key-${index + 1}`, type: 'JsonWebKey2020', controller: did, publicKeyJwk });
		keys.push({ kid: key.kid, type, publicKeyJwk, vm: `${did}#key-${index + 1}` });
	}
	const ids = methods.map((method) => method.id as string);
	const document: EngineDidDocument = {
		id: did,
		verificationMethod: methods,
		authentication: ids,
		assertionMethod: ids,
	};
	await h.engine.createDid('testnet', document, who);
	h.runtime.credentialState.resolutions.set(did, {
		didDocument: document,
		didDocumentMetadata: {},
		didResolutionMetadata: {},
	});
	return { did, document, keys };
}

function jwsValid(compact: string, publicKeyJwk: object, alg: 'ES256' | 'EdDSA'): boolean {
	const [header, payload, signature] = compact.split('.');
	const data = new Uint8Array(Buffer.from(`${header}.${payload}`));
	const signatureBytes = new Uint8Array(Buffer.from(signature, 'base64url'));
	expect(signatureBytes).toHaveLength(64);
	return alg === 'ES256'
		? verify(
				'sha256',
				data,
				{ key: publicKeyJwk as never, format: 'jwk', dsaEncoding: 'ieee-p1363' },
				signatureBytes
			)
		: verify(null, data, { key: publicKeyJwk as never, format: 'jwk' }, signatureBytes);
}

const subjectDid = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
const payloadFor = (issuer: string): JsonObject => ({
	'@context': ['https://schema.org'],
	type: ['Person'],
	issuer: { id: issuer },
	credentialSubject: { id: subjectDid, name: 'Bob', gender: 'male' },
});

describe('createCredential (JWT)', () => {
	let h: Harness;
	beforeEach(() => {
		h = harness();
	});

	it.each<[KeyType, 'EdDSA' | 'ES256']>([
		['Ed25519', 'EdDSA'],
		['Secp256r1', 'ES256'],
	])('signs with a %s key as %s, and the signature verifies against the DID key', async (type, alg) => {
		const { did, keys } = await makeDid(h, alice, [type]);
		const credential = await h.engine.createCredential(payloadFor(did), 'jwt', null, alice);

		const jwt = (credential.proof as JsonObject).jwt as string;
		const decoded = decodeJwt(jwt);
		expect(decoded?.header).toEqual({ alg, typ: 'JWT', kid: keys[0].vm });
		expect(decoded?.payload.iss).toBe(did);
		expect(decoded?.payload.sub).toBe(subjectDid);
		expect(jwsValid(jwt, keys[0].publicKeyJwk, alg)).toBe(true);
		expect(h.runtime.credentialState.signCalls).toEqual([
			{ tenantId: h.store.tenants.get('alice'), keyId: keys[0].kid, alg },
		]);
	});

	it('prefers the P-256 key when the DID has both (the agent default), and the Ed25519 key when it has only that', async () => {
		const both = await makeDid(h, alice, ['Ed25519', 'Secp256r1']);
		const credential = await h.engine.createCredential(payloadFor(both.did), 'jwt', null, alice);
		expect(decodeJwt((credential.proof as JsonObject).jwt as string)?.header.alg).toBe('ES256');
	});

	it('returns the shape Veramo recorded in credential-issue-jwt.json', async () => {
		const { did } = await makeDid(h, alice, ['Ed25519']);
		const credential = await h.engine.createCredential(payloadFor(did), 'jwt', null, alice);
		const fixture = JSON.parse(
			readFileSync(new URL('../../../contract/fixtures/credential-issue-jwt.json', import.meta.url), 'utf8')
		).exchange.response.body;

		expect(Object.keys(credential).sort()).toEqual(Object.keys(fixture).sort());
		expect(credential['@context']).toEqual(fixture['@context'].map((c: string) => c)); // base context, then the request's
		expect(credential.type).toEqual(fixture.type);
		expect(credential.issuer).toEqual({ id: did });
		expect(credential.credentialSubject).toEqual({ id: subjectDid, name: 'Bob', gender: 'male' });
		expect((credential.proof as JsonObject).type).toBe(fixture.proof.type);
		const payload = decodeJwt((credential.proof as JsonObject).jwt as string)?.payload as JsonObject;
		expect(Object.keys(payload).sort()).toEqual(Object.keys(fixture.proof.jwt.$jwt.payload).sort());
		expect(Object.keys(payload.vc as JsonObject).sort()).toEqual(
			Object.keys(fixture.proof.jwt.$jwt.payload.vc).sort()
		);
		expect(typeof credential.issuanceDate).toBe('string');
	});

	it('maps a JWT back to the credential it came from, and the claims back to the same JWT payload', async () => {
		const { did } = await makeDid(h, alice, ['Ed25519']);
		const credential = await h.engine.createCredential(
			{ ...payloadFor(did), id: 'urn:uuid:1', expirationDate: '2099-01-01T00:00:00.000Z' },
			'jwt',
			null,
			alice
		);
		const jwt = (credential.proof as JsonObject).jwt as string;
		const payload = decodeJwt(jwt)?.payload as JsonObject;
		expect(payload.jti).toBe('urn:uuid:1');
		expect(payload.exp).toBe(4070908800);
		expect(jwtToCredential(jwt)).toEqual(credential);
		const { proof: _proof, ...unsigned } = credential;
		expect(credentialToJwtPayload(unsigned)).toEqual(payload);
	});

	it('issues from an unowned DID and from one that does not exist with the same error, and signs nothing', async () => {
		const { did } = await makeDid(h, alice, ['Ed25519']);
		const unowned = await h.engine.createCredential(payloadFor(did), 'jwt', null, bob).catch((e) => e);
		const missing = await h.engine
			.createCredential(payloadFor('did:cheqd:testnet:00000000-0000-4000-8000-000000000000'), 'jwt', null, bob)
			.catch((e) => e);
		expect(unowned).toBeInstanceOf(Error);
		expect(unowned.message).toBe(`${did} not found in wallet`);
		expect(missing.message).toBe('did:cheqd:testnet:00000000-0000-4000-8000-000000000000 not found in wallet');
		expect(unowned.name).toBe(missing.name);
		expect(h.runtime.credentialState.signCalls).toEqual([]);
	});

	it('will not sign with a key the customer does not hold, even in a DID document the customer owns', async () => {
		const victim = await makeDid(h, alice, ['Ed25519']);
		// Bob owns a DID whose document lists Alice's public key as its only assertion key
		const bobDid = `did:cheqd:testnet:${randomUUID()}`;
		const bobKey = await h.engine.createKey('Ed25519', bob);
		const bobOwn = h.runtime.imported.find((entry) => entry.keyId === bobKey.kid) as never as {
			privateJwk: Record<string, unknown>;
		};
		const { d: _d, kid: _k, ...bobPublic } = bobOwn.privateJwk;
		await h.engine.createDid(
			'testnet',
			{
				id: bobDid,
				verificationMethod: [
					{ id: `${bobDid}#k`, type: 'JsonWebKey2020', controller: bobDid, publicKeyJwk: bobPublic },
				],
				authentication: [`${bobDid}#k`],
				assertionMethod: [`${bobDid}#k`],
			},
			bob
		);
		h.runtime.credentialState.resolutions.set(bobDid, {
			didDocument: {
				id: bobDid,
				verificationMethod: [
					{
						id: `${bobDid}#k`,
						type: 'JsonWebKey2020',
						controller: bobDid,
						publicKeyJwk: victim.keys[0].publicKeyJwk,
					},
				],
				assertionMethod: [`${bobDid}#k`],
				authentication: [`${bobDid}#k`],
			},
			didDocumentMetadata: {},
			didResolutionMetadata: {},
		});

		await expect(h.engine.createCredential(payloadFor(bobDid), 'jwt', null, bob)).rejects.toThrow(
			'no assertion key that this customer can sign with'
		);
		expect(h.runtime.credentialState.signCalls).toEqual([]);
	});

	it('refuses a deactivated issuer', async () => {
		const { did, document } = await makeDid(h, alice, ['Ed25519']);
		h.runtime.credentialState.resolutions.set(did, {
			didDocument: document,
			didDocumentMetadata: { deactivated: true },
			didResolutionMetadata: {},
		});
		await expect(h.engine.createCredential(payloadFor(did), 'jwt', null, alice)).rejects.toThrow('deactivated');
	});

	it('names the format when it is not supported, and signs nothing', async () => {
		const { did } = await makeDid(h, alice, ['Ed25519']);
		const sdJwt = await h.engine.createCredential(payloadFor(did), 'sd-jwt-vc', null, alice).catch((e) => e);
		expect(sdJwt).toBeInstanceOf(CredoNotSupportedError);
		expect(sdJwt.message).toContain("'sd-jwt-vc'");
		expect(sdJwt.status).toBe(501);
		const anoncreds = await h.engine.createCredential(payloadFor(did), 'anoncreds', null, alice).catch((e) => e);
		expect(anoncreds).toBeInstanceOf(CredoNotSupportedError);
		expect(anoncreds.message).toContain("'anoncreds'");
		expect(h.runtime.credentialState.signCalls).toEqual([]);
	});

	it('does not allocate a status index itself: Studio reserves it, so one is required to issue with a status entry', async () => {
		const { did } = await makeDid(h, alice, ['Ed25519']);
		await expect(
			h.engine.createCredential(
				payloadFor(did),
				'jwt',
				{ statusListType: 'BitstringStatusList', statusListName: 'list', statusPurpose: 'message' } as never,
				alice
			)
		).rejects.toThrow('statusListIndex is required');
		expect(h.runtime.credentialState.signCalls).toEqual([]);
	});

	it('issues with a StatusList2021 entry on the index Studio reserved', async () => {
		const { did } = await makeDid(h, alice, ['Ed25519']);
		const credential = await h.engine.createCredential(
			payloadFor(did),
			'jwt',
			{
				statusListType: 'StatusList2021',
				statusPurpose: 'revocation',
				statusListName: 'rev',
				statusListIndex: 12,
			} as never,
			alice
		);
		const list = `https://resolver.cheqd.net/1.0/identifiers/${did}?resourceName=rev&resourceType=StatusList2021Revocation`;
		expect(credential.credentialStatus).toEqual({
			id: `${list}#12`,
			type: 'StatusList2021Entry',
			statusPurpose: 'revocation',
			statusListIndex: '12',
		});
	});

	it('keeps no copy in Credo: issuing stores nothing in the tenant', async () => {
		const { did } = await makeDid(h, alice, ['Ed25519']);
		await h.engine.createCredential(payloadFor(did), 'jwt', null, alice);
		expect(h.runtime.credentialState.storeCalls).toBe(0);
		expect(h.runtime.credentialState.stored.size).toBe(0);
	});
});

describe('createCredential (JSON-LD)', () => {
	let h: Harness;
	beforeEach(() => {
		h = harness();
	});

	it('signs through Credo for a DID the tenant created, with the proof type of the key', async () => {
		const { did, keys } = await makeDid(h, alice, ['Secp256r1']);
		const credential = await h.engine.createCredential(payloadFor(did), 'jsonld', null, alice);
		expect(h.runtime.credentialState.jsonLdSigns).toEqual([
			expect.objectContaining({
				tenantId: h.store.tenants.get('alice'),
				verificationMethod: keys[0].vm,
				proofType: 'JsonWebSignature2020',
			}),
		]);
		expect(credential.proof).toMatchObject({ type: 'JsonWebSignature2020' });
	});

	it('refuses, naming the format, for a DID the Credo engine did not create', async () => {
		const { did } = await makeDid(h, alice, ['Ed25519']);
		h.runtime.recorded.clear(); // Credo has no record of the DID (a DID Veramo created)
		const error = await h.engine.createCredential(payloadFor(did), 'jsonld', null, alice).catch((e) => e);
		expect(error).toBeInstanceOf(CredoNotSupportedError);
		expect(error.message).toContain("'jsonld'");
		expect(h.runtime.credentialState.jsonLdSigns).toEqual([]);
	});
});

describe('createPresentation', () => {
	let h: Harness;
	beforeEach(() => {
		h = harness();
	});

	async function issue(issuer: string) {
		return h.engine.createCredential(payloadFor(issuer), 'jwt', null, alice);
	}

	it('signs a JWT presentation as the holder, carrying the credential JWTs, domain and challenge', async () => {
		const holder = await makeDid(h, alice, ['Ed25519']);
		const credential = await issue(holder.did);
		const presentation = await h.engine.createPresentation(
			{ holder: holder.did, verifiableCredential: [credential] },
			{ domain: 'https://verifier.example', challenge: 'n-0S6' } as never,
			alice
		);

		const jwt = (presentation.proof as JsonObject).jwt as string;
		const decoded = decodeJwt(jwt);
		expect(decoded?.header).toEqual({ alg: 'EdDSA', typ: 'JWT', kid: holder.keys[0].vm });
		expect(decoded?.payload).toMatchObject({
			iss: holder.did,
			aud: ['https://verifier.example'],
			nonce: 'n-0S6',
			vp: { type: ['VerifiablePresentation'], verifiableCredential: [(credential.proof as JsonObject).jwt] },
		});
		expect(jwsValid(jwt, holder.keys[0].publicKeyJwk, 'EdDSA')).toBe(true);
		expect(presentation.holder).toBe(holder.did);
		expect((presentation.verifiableCredential as JsonObject[])[0]).toEqual(credential);
	});

	it('returns the shape Veramo recorded in presentation-create.json', async () => {
		const holder = await makeDid(h, alice, ['Ed25519']);
		const presentation = await h.engine.createPresentation(
			{ holder: holder.did, verifiableCredential: [await issue(holder.did)] },
			{},
			alice
		);
		const fixture = JSON.parse(
			readFileSync(new URL('../../../contract/fixtures/presentation-create.json', import.meta.url), 'utf8')
		).exchange.response.body;
		expect(Object.keys(presentation).sort()).toEqual(Object.keys(fixture).sort());
		expect(presentation.type).toEqual(fixture.type);
		expect((presentation.proof as JsonObject).type).toBe(fixture.proof.type);
	});

	it('answers an unowned holder DID exactly as a missing one, and signs nothing', async () => {
		const holder = await makeDid(h, alice, ['Ed25519']);
		const payload = (did: string) => ({ holder: did, verifiableCredential: [] });
		const unowned = await h.engine.createPresentation(payload(holder.did), {}, bob).catch((e) => e);
		const missing = await h.engine
			.createPresentation(payload('did:cheqd:testnet:11111111-1111-4111-8111-111111111111'), {}, bob)
			.catch((e) => e);
		expect(unowned.message).toBe(`${holder.did} not found in wallet`);
		expect(missing.message).toBe('did:cheqd:testnet:11111111-1111-4111-8111-111111111111 not found in wallet');
		expect(unowned.name).toBe(missing.name);
		expect(h.runtime.credentialState.signCalls).toEqual([]);
	});

	it('gives a presentation with no challenge a random nonce, because Credo reads no JWT presentation without one', async () => {
		const holder = await makeDid(h, alice, ['Ed25519']);
		const make = async () =>
			decodeJwt(
				(
					(await h.engine.createPresentation({ holder: holder.did, verifiableCredential: [] }, {}, alice))
						.proof as JsonObject
				).jwt as string
			)?.payload.nonce;
		const [first, second] = [await make(), await make()];
		expect(first).toEqual(expect.any(String));
		expect(first).not.toBe(second);
	});

	it('needs a holder', async () => {
		await expect(h.engine.createPresentation({ verifiableCredential: [] }, {}, alice)).rejects.toThrow('no holder');
	});
});

describe('verifyCredential', () => {
	let h: Harness;
	let jwt: string;
	let did: string;
	beforeEach(async () => {
		h = harness();
		const made = await makeDid(h, alice, ['Ed25519']);
		did = made.did;
		jwt = ((await h.engine.createCredential(payloadFor(did), 'jwt', null, alice)).proof as JsonObject)
			.jwt as string;
	});

	/** A JWT credential carrying a status entry, as Studio's accreditations do */
	function withStatus(type: string): string {
		const decoded = decodeJwt(jwt) as NonNullable<ReturnType<typeof decodeJwt>>;
		const vc = {
			...(decoded.payload.vc as JsonObject),
			credentialStatus: {
				id: 'x',
				type,
				statusListCredential: 'u',
				statusPurpose: 'revocation',
				statusListIndex: '1',
			},
		};
		const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
		return `${encode(decoded.header)}.${encode({ ...decoded.payload, vc })}.${decoded.signature}`;
	}

	it('accepts a compact JWT or the credential object, in the customer’s tenant, without Credo’s own status check', async () => {
		const fromString = await h.engine.verifyCredential(jwt, {}, bob);
		const fromObject = await h.engine.verifyCredential(
			{ proof: { type: 'JwtProof2020', jwt } } as JsonObject,
			{},
			bob
		);
		expect(fromString).toMatchObject({ verified: true, issuer: did, policies: { credentialStatus: false } });
		expect(fromObject.verified).toBe(true);
		const calls = h.runtime.credentialState.verifyCredentialCalls;
		expect(calls.map((c) => c.credential)).toEqual([jwt, jwt]);
		expect(calls.every((c) => c.tenantId === h.store.tenants.get('bob') && !c.allowUndefinedTerms)).toBe(true);
	});

	it('reports a failed check with its message', async () => {
		h.runtime.credentialState.verification = {
			isValid: false,
			checks: [
				{ name: 'dataModel', isValid: true },
				{ name: 'signature', isValid: false, error: 'Invalid JWS signature' },
			],
		};
		const result = await h.engine.verifyCredential(jwt, {}, alice);
		expect(result).toMatchObject({
			verified: false,
			error: { message: 'Invalid JWS signature', errorCode: 'signature' },
		});
	});

	it('with verifyStatus, reads the legacy status entries separately and passes when they are valid', async () => {
		h.runtime.credentialState.status = [validStatus('u')];
		const result = await h.engine.verifyCredential(
			withStatus('BitstringStatusListEntry'),
			{ verifyStatus: true },
			alice
		);
		expect(result).toMatchObject({ verified: true, policies: { credentialStatus: true } });
		expect(result.warnings).toBeUndefined();
		const [call] = h.runtime.credentialState.statusCalls;
		expect(call.credential).toMatchObject({
			issuer: did,
			credentialStatus: [{ type: 'BitstringStatusListEntry' }],
		});
		// Credo's own verification ran once, and not with its status check (the port has no such option)
		expect(h.runtime.credentialState.verifyCredentialCalls).toHaveLength(1);
	});

	it.each([
		['revoked', { revoked: true, valid: false }, 'The credential has been revoked'],
		['suspended', { suspended: true, valid: false }, 'The credential has been suspended'],
	])('fails a %s credential', async (code, flags, message) => {
		h.runtime.credentialState.status = [{ ...validStatus('u'), ...flags }];
		const result = await h.engine.verifyCredential(
			withStatus('StatusList2021Entry'),
			{ verifyStatus: true },
			alice
		);
		expect(result).toMatchObject({ verified: false, error: { message, errorCode: code } });
	});

	it('fails closed when the status list cannot be read', async () => {
		h.runtime.credentialState.status = new Error('list is not a resource of the issuer');
		const result = await h.engine.verifyCredential(
			withStatus('BitstringStatusListEntry'),
			{ verifyStatus: true },
			alice
		);
		expect(result.verified).toBe(false);
		expect(result.error).toMatchObject({ errorCode: 'status_unavailable' });
		expect((result.error as { message: string }).message).toContain('list is not a resource of the issuer');
	});

	it('does not read status when it was not asked for, or when the signature already failed', async () => {
		await h.engine.verifyCredential(withStatus('BitstringStatusListEntry'), {}, alice);
		h.runtime.credentialState.verification = { isValid: false, checks: [{ name: 'signature', isValid: false }] };
		await h.engine.verifyCredential(withStatus('BitstringStatusListEntry'), { verifyStatus: true }, alice);
		expect(h.runtime.credentialState.statusCalls).toEqual([]);
	});

	it('verifies, with a warning, a credential whose status type it cannot read', async () => {
		const result = await h.engine.verifyCredential(withStatus('SomeOtherStatus'), { verifyStatus: true }, alice);
		expect(result.verified).toBe(true);
		expect(result.warnings).toEqual(['credentialStatus of type SomeOtherStatus was not checked']);
		expect(h.runtime.credentialState.statusCalls).toEqual([]);
	});

	it('passes JSON-LD to Credo leniently and lists the undefined terms as a warning', async () => {
		h.runtime.credentialState.verification = { isValid: true, checks: [], undefinedTerms: ['nickname'] };
		const result = await h.engine.verifyCredential(
			{ ...payloadFor(did), proof: { type: 'Ed25519Signature2020' } },
			{},
			alice
		);
		expect(h.runtime.credentialState.verifyCredentialCalls[0].allowUndefinedTerms).toBe(true);
		expect((result.warnings as string[])[0]).toContain('nickname');
	});
});

describe('verifyPresentation', () => {
	let h: Harness;
	let presentationJwt: string;
	let credentialJwt: string;
	beforeEach(async () => {
		h = harness();
		const holder = await makeDid(h, alice, ['Ed25519']);
		const credential = await h.engine.createCredential(payloadFor(holder.did), 'jwt', null, alice);
		credentialJwt = (credential.proof as JsonObject).jwt as string;
		presentationJwt = (
			(
				await h.engine.createPresentation(
					{ holder: holder.did, verifiableCredential: [credential] },
					{ domain: 'verifier', challenge: 'abc' } as never,
					alice
				)
			).proof as JsonObject
		).jwt as string;
	});

	it('passes the challenge and domain to Credo, and reports the holder', async () => {
		const result = await h.engine.verifyPresentation(
			presentationJwt,
			{ domain: 'verifier', challenge: 'abc' } as never,
			bob
		);
		expect(result.verified).toBe(true);
		expect(result.holder).toBe(decodeJwt(presentationJwt)?.payload.iss);
		expect(h.runtime.credentialState.verifyPresentationCalls[0]).toMatchObject({
			presentation: presentationJwt,
			challenge: 'abc',
			domain: 'verifier',
		});
	});

	it('refuses a presentation when the verifier supplies no challenge, instead of using its own nonce', async () => {
		await expect(h.engine.verifyPresentation(presentationJwt, { domain: 'verifier' }, alice)).rejects.toMatchObject(
			{
				name: 'PresentationBindingRequiredError',
				code: 'invalid_request',
				status: 400,
			}
		);
		await expect(
			h.engine.verifyPresentation(presentationJwt, { domain: 'verifier', challenge: '' } as never, alice)
		).rejects.toMatchObject({ code: 'invalid_request' });
		expect(h.runtime.credentialState.verifyPresentationCalls).toHaveLength(0);
	});

	it('refuses a presentation with no domain, unless the audience policy is explicitly switched off', async () => {
		await expect(
			h.engine.verifyPresentation(presentationJwt, { challenge: 'abc' } as never, alice)
		).rejects.toMatchObject({ code: 'invalid_request', missing: 'domain' });
		expect(h.runtime.credentialState.verifyPresentationCalls).toHaveLength(0);

		const result = await h.engine.verifyPresentation(
			presentationJwt,
			{ challenge: 'abc', policies: { audience: false } } as never,
			alice
		);
		expect(result.verified).toBe(true);
		expect(h.runtime.credentialState.verifyPresentationCalls[0]).toMatchObject({ challenge: 'abc' });
	});

	it('checks the status of the credentials inside it with verifyStatus', async () => {
		const decoded = decodeJwt(credentialJwt) as NonNullable<ReturnType<typeof decodeJwt>>;
		const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
		const revocable = `${encode(decoded.header)}.${encode({
			...decoded.payload,
			vc: {
				...(decoded.payload.vc as JsonObject),
				credentialStatus: {
					type: 'BitstringStatusListEntry',
					statusPurpose: 'revocation',
					statusListCredential: 'u',
					statusListIndex: '3',
				},
			},
		})}.${decoded.signature}`;
		const vp = decodeJwt(presentationJwt) as NonNullable<ReturnType<typeof decodeJwt>>;
		const withRevocable = `${encode(vp.header)}.${encode({
			...vp.payload,
			vp: { ...(vp.payload.vp as JsonObject), verifiableCredential: [revocable] },
		})}.${vp.signature}`;

		h.runtime.credentialState.status = [{ ...validStatus('u'), revoked: true, valid: false }];
		const result = await h.engine.verifyPresentation(
			withRevocable,
			{ verifyStatus: true, challenge: 'abc', domain: 'verifier' } as never,
			alice
		);
		expect(result).toMatchObject({ verified: false, error: { errorCode: 'revoked' } });
		expect(h.runtime.credentialState.statusCalls).toHaveLength(1);
	});

	it('rejects input that is neither a JWT nor a document', async () => {
		await expect(h.engine.verifyPresentation('not-a-jwt', {}, alice)).rejects.toThrow('neither a JWT');
	});
});

describe('signWithDidKey', () => {
	let h: Harness;
	beforeEach(() => {
		h = harness();
	});

	it.each<[KeyType, 'EdDSA' | 'ES256']>([
		['Secp256r1', 'ES256'],
		['Ed25519', 'EdDSA'],
	])('returns a raw 64-byte %s signature that verifies against the DID key', async (type, alg) => {
		const { did, keys } = await makeDid(h, alice, [type]);
		const data = new TextEncoder().encode('eyJhbGciOiJFUzI1NiJ9.eyJhIjoxfQ');
		const signature = await h.engine.signWithDidKey({ did, kid: keys[0].vm, alg, data }, alice);

		expect(signature).toBeInstanceOf(Uint8Array);
		expect(signature).toHaveLength(64);
		const ok =
			alg === 'ES256'
				? verify(
						'sha256',
						data,
						{ key: keys[0].publicKeyJwk as never, format: 'jwk', dsaEncoding: 'ieee-p1363' },
						signature
					)
				: verify(null, data, { key: keys[0].publicKeyJwk as never, format: 'jwk' }, signature);
		expect(ok).toBe(true);
		expect(h.runtime.credentialState.signCalls).toEqual([
			{ tenantId: h.store.tenants.get('alice'), keyId: keys[0].kid, alg },
		]);
	});

	it('refuses another customer, and answers exactly as for a DID that does not exist', async () => {
		const { did, keys } = await makeDid(h, alice, ['Ed25519']);
		const data = new Uint8Array([1, 2, 3]);
		const unowned = await h.engine
			.signWithDidKey({ did, kid: keys[0].vm, alg: 'EdDSA', data }, bob)
			.catch((e) => e);
		const ghost = 'did:cheqd:testnet:22222222-2222-4222-8222-222222222222';
		const missing = await h.engine
			.signWithDidKey({ did: ghost, kid: `${ghost}#key-1`, alg: 'EdDSA', data }, bob)
			.catch((e) => e);
		expect(unowned.message).toBe(`${did} not found in wallet`);
		expect(missing.message).toBe(`${ghost} not found in wallet`);
		expect(unowned.name).toBe(missing.name);
		expect(h.runtime.credentialState.signCalls).toEqual([]);
	});

	it("refuses a key that is not the customer's even when it sits in the customer's own DID document", async () => {
		const victim = await makeDid(h, alice, ['Ed25519']);
		const mine = await makeDid(h, bob, ['Ed25519']);
		h.runtime.credentialState.resolutions.set(mine.did, {
			didDocument: {
				id: mine.did,
				verificationMethod: [
					{
						id: `${mine.did}#stolen`,
						type: 'JsonWebKey2020',
						controller: mine.did,
						publicKeyJwk: victim.keys[0].publicKeyJwk,
					},
				],
			},
			didDocumentMetadata: {},
			didResolutionMetadata: {},
		});
		await expect(
			h.engine.signWithDidKey(
				{ did: mine.did, kid: `${mine.did}#stolen`, alg: 'EdDSA', data: new Uint8Array([1]) },
				bob
			)
		).rejects.toThrow('not found in wallet');
		expect(h.runtime.credentialState.signCalls).toEqual([]);
	});

	it('refuses a key id that belongs to another DID, a wrong algorithm, and an unknown algorithm', async () => {
		const a = await makeDid(h, alice, ['Ed25519']);
		const b = await makeDid(h, alice, ['Secp256r1']);
		const data = new Uint8Array([1]);
		await expect(
			h.engine.signWithDidKey({ did: a.did, kid: b.keys[0].vm, alg: 'EdDSA', data }, alice)
		).rejects.toThrow('verification method of the DID');
		await expect(
			h.engine.signWithDidKey({ did: a.did, kid: a.keys[0].vm, alg: 'ES256', data }, alice)
		).rejects.toThrow('cannot sign with ES256');
		await expect(
			h.engine.signWithDidKey({ did: a.did, kid: a.keys[0].vm, alg: 'RS256' as never, data }, alice)
		).rejects.toThrow('Unsupported signing algorithm');
		expect(h.runtime.credentialState.signCalls).toEqual([]);
	});

	it('does not sign for a deactivated DID', async () => {
		const { did, document, keys } = await makeDid(h, alice, ['Ed25519']);
		h.runtime.credentialState.resolutions.set(did, {
			didDocument: document,
			didDocumentMetadata: { deactivated: true },
			didResolutionMetadata: {},
		});
		await expect(
			h.engine.signWithDidKey({ did, kid: keys[0].vm, alg: 'EdDSA', data: new Uint8Array([1]) }, alice)
		).rejects.toThrow('deactivated');
	});
});

describe('listCredentials and getCredential', () => {
	let h: Harness;
	const aliceDid = 'did:cheqd:testnet:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
	const resourceId = '33333333-3333-4333-8333-333333333333';
	const documents = new Map<string, unknown>();

	beforeEach(() => {
		documents.clear();
		const store = new FakeStore();
		const runtime = new FakeRuntime();
		const fetchImpl = (async (url: string) => {
			const document = documents.get(String(url).replace('https://resolver.test/', ''));
			return { ok: document !== undefined, json: async () => document } as Response;
		}) as unknown as typeof fetch;
		const engine = new CredoEngine({
			store,
			runtime,
			withPayerLock: (_a, work) => work(),
			resolverUrl: 'https://resolver.test/',
			fetch: fetchImpl,
		});
		h = { engine, store, runtime };
		h.store.identifiers.push({
			did: aliceDid,
			provider: 'did:cheqd:testnet',
			keyIds: [],
			services: [],
			customerId: 'alice',
		});
		h.store.resources.push({
			customerId: 'alice',
			did: aliceDid,
			resourceId,
			resourceType: 'VerifiableCredential',
		});
		documents.set(`${aliceDid}/resources/${resourceId}`, {
			issuer: { id: aliceDid },
			credentialSubject: { id: 'did:example:s' },
			type: ['VerifiableCredential'],
			issuanceDate: '2026-01-01T00:00:00Z',
			proof: { type: 'Ed25519Signature2020' },
		});
	});

	it('lists only the customer’s credentials, in the response shape', async () => {
		const own = await h.engine.listCredentials({}, alice);
		expect(own.total).toBe(1);
		expect(own.credentials[0]).toMatchObject({
			status: 'issued',
			providerId: 'studio',
			id: `${aliceDid}/resources/${resourceId}`,
			issuerDid: aliceDid,
			subjectDid: 'did:example:s',
			format: 'jsonld',
		});
		expect(await h.engine.listCredentials({}, bob)).toEqual({ total: 0, credentials: [] });
	});

	it('gets a credential by DID URL or by resource id, for its owner only', async () => {
		expect(await h.engine.getCredential(`${aliceDid}/resources/${resourceId}`, alice)).toMatchObject({
			issuer: { id: aliceDid },
		});
		expect(await h.engine.getCredential(resourceId, alice)).toMatchObject({ issuer: { id: aliceDid } });
		expect(await h.engine.getCredential(`${aliceDid}/resources/${resourceId}`, bob)).toBeNull();
		expect(await h.engine.getCredential(resourceId, bob)).toBeNull();
		expect(await h.engine.getCredential('44444444-4444-4444-8444-444444444444', alice)).toBeNull();
	});
});

describe('save, retrieve and delete (the customer’s own holder store)', () => {
	let h: Harness;
	let credential: JsonObject;
	beforeEach(async () => {
		h = harness();
		const { did } = await makeDid(h, alice, ['Ed25519']);
		credential = await h.engine.createCredential(payloadFor(did), 'jwt', null, alice);
	});

	it('stores under a content hash in the customer’s tenant, and reads it back as the credential', async () => {
		const hash = await h.engine.saveCredential(credential, alice);
		expect(hash).toMatch(/^[0-9a-f]{64}$/);
		expect(await h.engine.saveCredential(credential, alice)).toBe(hash);
		expect(await h.engine.retrieveCredential(hash, alice)).toEqual(credential);
		expect([...h.runtime.credentialState.stored.keys()]).toEqual([h.store.tenants.get('alice')]);
	});

	it('does not show one customer’s credential to another, and deletes only its own', async () => {
		const hash = await h.engine.saveCredential(credential, alice);
		expect(await h.engine.retrieveCredential(hash, bob)).toBeNull();
		expect(await h.engine.deleteCredential(hash, bob)).toBe(false);
		expect(await h.engine.retrieveCredential(hash, alice)).not.toBeNull();
		expect(await h.engine.deleteCredential(hash, alice)).toBe(true);
		expect(await h.engine.retrieveCredential(hash, alice)).toBeNull();
		expect(await h.engine.deleteCredential(hash, alice)).toBe(false);
	});

	it('hashes a JSON-LD credential the same whatever its key order', async () => {
		const a = await h.engine.saveCredential({ a: 1, b: { c: 2, d: 3 } }, alice);
		const b = await h.engine.saveCredential({ b: { d: 3, c: 2 }, a: 1 }, alice);
		expect(a).toBe(b);
	});
});
