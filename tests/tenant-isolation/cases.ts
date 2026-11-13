/**
 * Cross-tenant case catalogue. Each case describes one request that references a resource belonging to `target`.
 * The suite sends it twice: once as the owner (control: it must be authorised, which proves the payload is valid and
 * the test is not vacuous) and once as the other tenant (attack: it must be refused, leak nothing and change nothing).
 */
import type { Harness, RequestOptions, Tenant } from './harness/app.js';
import { CREDENTIAL_JWT, CREDENTIAL_OBJECT } from '../unit/constants.js';
import type { BugId } from './helpers.js';

export type RouteRequest = { method: string; path: string } & RequestOptions;

export type OracleKind =
	/** "Authorised" means one of `reach` was called on the Veramo stub, i.e. the request got as far as signing or broadcasting. */
	| { kind: 'ledger'; reach: string[] }
	/** "Authorised" means `reached(response)` is true. */
	| { kind: 'response'; reached: (status: number, text: string) => boolean }
	/** A request by id: authorised means a 2xx response. */
	| { kind: 'read-one' }
	/** A route with no resource id: the caller always gets its own data. Authorised means 2xx and the caller's own marker. */
	| { kind: 'implicit' };

export type Case = {
	/** Inventory key, e.g. `POST /did/update`. Appears in the test title as `[POST /did/update]`. */
	route: string;
	title: string;
	request: (target: Tenant, h: Harness) => RouteRequest;
	oracle: OracleKind;
	/** Install Veramo stub results needed to reach the code under test. */
	prepare?: (h: Harness, target: Tenant) => void;
	/** The attack is expected to fail today because of this bug. */
	knownBug?: BugId;
	/** A database invariant that must also hold after the attack, beyond "the victim's rows are unchanged". */
	extraAssert?: (h: Harness, attacker: Tenant, victim: Tenant) => Promise<void>;
};

const BITSTRING = 'BitstringStatusList';

export function credentialFor(target: Tenant) {
	return {
		...CREDENTIAL_OBJECT,
		issuer: { id: target.did },
		credentialStatus: {
			...CREDENTIAL_OBJECT.credentialStatus,
			id: `https://resolver.cheqd.net/1.0/identifiers/${target.did}?resourceName=${target.statusListName}&resourceType=StatusList2021Suspension#13338`,
		},
	};
}

const resolvedDocument = (h: Harness, did: string) => {
	void h;
	return {
		didDocument: {
			'@context': ['https://www.w3.org/ns/did/v1'],
			id: did,
			controller: [did],
			verificationMethod: [
				{
					id: `${did}#key-1`,
					type: 'Ed25519VerificationKey2018',
					controller: did,
					publicKeyBase58: '6QN8DfuN9hjgHgPvLXqgzqYE3jRRGRrmJQZkd5tL8paR',
				},
			],
		},
		didDocumentMetadata: {},
		didResolutionMetadata: {},
	};
};

export const ledgerCases: Case[] = [
	{
		route: 'POST /did/update',
		title: 'update a DID document',
		request: (t) => ({
			method: 'POST',
			path: '/did/update',
			body: {
				did: t.did,
				service: [{ id: `${t.did}#svc-1`, type: 'LinkedDomains', serviceEndpoint: ['https://example.com'] }],
			},
		}),
		oracle: { kind: 'ledger', reach: ['updateDid'] },
	},
	{
		route: 'POST /did/deactivate/:did',
		title: 'deactivate a DID',
		request: (t) => ({ method: 'POST', path: `/did/deactivate/${encodeURIComponent(t.did)}`, body: {} }),
		oracle: { kind: 'ledger', reach: ['deactivateDid'] },
	},
	{
		route: 'POST /did/export/:did',
		title: 'export a DID and its private keys',
		request: (t) => ({ method: 'POST', path: `/did/export/${encodeURIComponent(t.did)}`, body: {} }),
		oracle: { kind: 'response', reached: (_status, text) => !/not found in wallet/i.test(text) },
	},
	{
		route: 'POST /resource/create/:did',
		title: 'publish a resource under a DID',
		request: (t) => ({
			method: 'POST',
			path: `/resource/create/${encodeURIComponent(t.did)}`,
			body: {
				data: Buffer.from(JSON.stringify({ hello: 'world' })).toString('base64'),
				encoding: 'base64',
				name: 'isolation-resource',
				type: 'TestResource',
			},
		}),
		prepare: (h, t) => h.stubVeramo('resolveDid', resolvedDocument(h, t.did)),
		oracle: { kind: 'ledger', reach: ['createResource'] },
	},
	{
		route: 'POST /credential/issue',
		title: 'issue a credential from a DID',
		request: (t, h) => ({
			method: 'POST',
			path: '/credential/issue',
			body: {
				issuerDid: t.did,
				subjectDid: h.tenantB.did,
				attributes: { name: 'Alice' },
				format: 'jwt',
			},
		}),
		prepare: (h, t) => h.stubVeramo('resolveDid', resolvedDocument(h, t.did)),
		oracle: { kind: 'ledger', reach: ['issueCredential'] },
	},
	{
		route: 'POST /credential/revoke',
		title: 'revoke a credential issued by a DID',
		request: (t) => ({
			method: 'POST',
			path: '/credential/revoke',
			query: { listType: BITSTRING, publish: 'true' },
			body: { credential: credentialFor(t) },
		}),
		oracle: { kind: 'ledger', reach: ['revokeCredentials'] },
	},
	{
		route: 'POST /credential/suspend',
		title: 'suspend a credential issued by a DID',
		request: (t) => ({
			method: 'POST',
			path: '/credential/suspend',
			query: { listType: BITSTRING, publish: 'true' },
			body: { credential: credentialFor(t) },
		}),
		oracle: { kind: 'ledger', reach: ['suspendCredentials'] },
	},
	{
		route: 'POST /credential/reinstate',
		title: 'reinstate a credential issued by a DID',
		request: (t) => ({
			method: 'POST',
			path: '/credential/reinstate',
			query: { listType: BITSTRING, publish: 'true' },
			body: { credential: credentialFor(t) },
		}),
		oracle: { kind: 'ledger', reach: ['unsuspendCredentials'] },
	},
	{
		route: 'POST /credential-status/create/unencrypted',
		title: 'create a status list under a DID',
		request: (t) => ({
			method: 'POST',
			path: '/credential-status/create/unencrypted',
			query: { listType: BITSTRING, statusPurpose: 'revocation' },
			body: { did: t.did, statusListName: `new-list-${t.name}` },
		}),
		oracle: { kind: 'ledger', reach: ['createUnencryptedBitstringStatusList'] },
	},
	{
		route: 'POST /credential-status/update/unencrypted',
		title: 'flip bits on a status list under a DID',
		request: (t) => ({
			method: 'POST',
			path: '/credential-status/update/unencrypted',
			query: { listType: BITSTRING, statusAction: 'revoke' },
			body: { did: t.did, statusListName: t.statusListName, indices: [3] },
		}),
		prepare: (h) =>
			h.stubVeramo('searchStatusList', {
				found: true,
				resource: { metadata: { encrypted: false } },
				statusList: {},
			}),
		oracle: { kind: 'ledger', reach: ['updateUnencryptedStatusList'] },
	},
	{
		route: 'POST /credential-status/create/encrypted',
		title: 'create an encrypted status list under a DID',
		request: (t) => ({
			method: 'POST',
			path: '/credential-status/create/encrypted',
			query: { listType: BITSTRING, statusPurpose: 'revocation' },
			body: {
				did: t.did,
				statusListName: `new-encrypted-list-${t.name}`,
				paymentConditions: [
					{
						feePaymentAddress: 'cheqd1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzr3k7p',
						feePaymentAmount: 20,
						feePaymentWindow: 10,
					},
				],
			},
		}),
		oracle: { kind: 'ledger', reach: ['createEncryptedBitstringStatusList'] },
	},
	{
		route: 'POST /credential-status/update/encrypted',
		title: 'flip bits on an encrypted status list under a DID',
		request: (t) => ({
			method: 'POST',
			path: '/credential-status/update/encrypted',
			query: { listType: BITSTRING, statusAction: 'revoke' },
			body: {
				did: t.did,
				statusListName: t.statusListName,
				indices: [3],
				symmetricKey: 'ab'.repeat(32),
				paymentConditions: [
					{
						feePaymentAddress: 'cheqd1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqzr3k7p',
						feePaymentAmount: 20,
						feePaymentWindow: 10,
					},
				],
			},
		}),
		prepare: (h) =>
			h.stubVeramo('searchStatusList', {
				found: true,
				resource: { metadata: { encrypted: true, paymentConditions: [] } },
				statusList: {},
			}),
		oracle: { kind: 'ledger', reach: ['updateEncryptedStatusList'] },
	},
	{
		route: 'POST /presentation/create',
		title: 'create a presentation held by a DID',
		request: (t) => ({
			method: 'POST',
			path: '/presentation/create',
			body: { credentials: [CREDENTIAL_JWT], holderDid: t.did },
		}),
		oracle: { kind: 'ledger', reach: ['createPresentation'] },
	},
];

/** Reads of one resource by id. */
export const readCases: Case[] = [
	{
		route: 'GET /key/read/:kid',
		title: 'read a key by kid',
		request: (t) => ({ method: 'GET', path: `/key/read/${t.kid}` }),
		oracle: { kind: 'read-one' },
	},
	{
		route: 'GET /key/:kid/verification-method',
		title: 'convert a key to a verification method',
		request: (t) => ({
			method: 'GET',
			path: `/key/${t.kid}/verification-method`,
			query: { verificationMethodType: 'Ed25519VerificationKey2018' },
		}),
		oracle: { kind: 'read-one' },
	},
	{
		route: 'GET /credential-status/list/:statusListId',
		title: 'fetch a status list by id',
		request: (t) => ({ method: 'GET', path: `/credential-status/list/${t.statusRegistryId}` }),
		oracle: { kind: 'read-one' },
	},
	{
		route: 'GET /credentials/issued/:id',
		title: 'fetch an issued credential by id',
		request: (t) => ({ method: 'GET', path: `/credentials/issued/${t.issuedCredentialId}` }),
		oracle: { kind: 'read-one' },
	},
	{
		route: 'PUT /credentials/issued/:id',
		title: 'update an issued credential record',
		request: (t) => ({
			method: 'PUT',
			path: `/credentials/issued/${t.issuedCredentialId}`,
			body: { status: 'revoked', metadata: { tampered: true } },
		}),
		oracle: { kind: 'read-one' },
	},
	{
		route: 'POST /credentials/issued/:id/re-issue',
		title: 're-issue an issued credential',
		request: (t) => ({ method: 'POST', path: `/credentials/issued/${t.unknownCredentialId}/re-issue`, body: {} }),
		oracle: { kind: 'ledger', reach: ['issueCredential'] },
	},
	{
		route: 'GET /providers/:providerId/configuration',
		title: 'read a provider configuration',
		request: () => ({ method: 'GET', path: '/providers/dock/configuration' }),
		oracle: { kind: 'implicit' },
	},
];
