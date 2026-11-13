/**
 * More cross-tenant cases, in the same shape as cases.ts: accreditation status changes, offers, received credentials,
 * credential import, ownership-transfer attempts and API keys.
 */
import type { Case } from './cases.js';
import { credentialFor } from './cases.js';
import type { Harness, Tenant } from './harness/app.js';
import { expect } from '@jest/globals';

const fakeResponse = (body: unknown) => ({
	ok: true,
	status: 200,
	json: async () => body,
	text: async () => JSON.stringify(body),
});

const accreditationFor = (t: Tenant) => ({
	...credentialFor(t),
	type: ['VerifiableCredential', 'VerifiableAuthorisationForTrustChain'],
});

const accreditationBody = (t: Tenant) => ({ didUrl: `${t.did}/resources/${t.resourceId}` });

export const extraCases: Case[] = [
	{
		route: 'POST /trust-registry/accreditation/revoke',
		title: 'revoke an accreditation published by a DID',
		request: (t) => ({
			method: 'POST',
			path: '/trust-registry/accreditation/revoke',
			query: { publish: 'true' },
			body: accreditationBody(t),
		}),
		prepare: (h, t) => h.stubVeramo('resolve', fakeResponse(accreditationFor(t))),
		oracle: { kind: 'ledger', reach: ['revokeCredentials'] },
	},
	{
		route: 'POST /trust-registry/accreditation/suspend',
		title: 'suspend an accreditation published by a DID',
		request: (t) => ({
			method: 'POST',
			path: '/trust-registry/accreditation/suspend',
			query: { publish: 'true' },
			body: accreditationBody(t),
		}),
		prepare: (h, t) => h.stubVeramo('resolve', fakeResponse(accreditationFor(t))),
		oracle: { kind: 'ledger', reach: ['suspendCredentials'] },
	},
	{
		route: 'POST /trust-registry/accreditation/reinstate',
		title: 'reinstate an accreditation published by a DID',
		request: (t) => ({
			method: 'POST',
			path: '/trust-registry/accreditation/reinstate',
			query: { publish: 'true' },
			body: accreditationBody(t),
		}),
		prepare: (h, t) => h.stubVeramo('resolve', fakeResponse(accreditationFor(t))),
		oracle: { kind: 'ledger', reach: ['unsuspendCredentials'] },
	},
	{
		route: 'POST /trust-registry/accreditation/issue',
		title: 'issue an accreditation from a DID',
		request: (t, h) => ({
			method: 'POST',
			path: '/trust-registry/accreditation/issue',
			query: { accreditationType: 'authorize' },
			body: {
				issuerDid: t.did,
				subjectDid: h.tenantC.did,
				schemas: [{ url: 'https://example.com/schema.json', types: ['JsonSchema'] }],
				accreditationName: 'isolation',
				trustFramework: 'framework',
				trustFrameworkId: 'https://example.com/framework',
				format: 'jwt',
			},
		}),
		prepare: (h, t) =>
			h.stubVeramo('resolveDid', {
				didDocument: { id: t.did, verificationMethod: [], '@context': [] },
				didDocumentMetadata: {},
				didResolutionMetadata: {},
			}),
		oracle: { kind: 'ledger', reach: ['issueCredential'] },
	},
	{
		route: 'GET /credentials/offers/:credentialId',
		title: "read another holder's pending offer",
		request: (t) => ({ method: 'GET', path: `/credentials/offers/${t.offerId}`, query: { holderDid: t.did } }),
		oracle: { kind: 'read-one' },
	},
	{
		route: 'POST /credentials/offers/:credentialId/accept',
		title: "accept another holder's pending offer",
		request: (t) => ({
			method: 'POST',
			path: `/credentials/offers/${t.offerId}/accept`,
			body: { holderDid: t.did },
		}),
		prepare: (h, t) => h.stubVeramo('retrieveCredentialFromDataStore', credentialFor(t)),
		oracle: {
			kind: 'response',
			reached: (_s, text) => !/in your wallet|does not belong|Offer not found|not owned/i.test(text),
		},
	},
	{
		route: 'POST /credentials/offers/:credentialId/reject',
		title: "reject another holder's pending offer",
		request: (t) => ({
			method: 'POST',
			path: `/credentials/offers/${t.offerId}/reject`,
			body: { holderDid: t.did },
		}),
		oracle: {
			kind: 'response',
			reached: (_s, text) => !/in your wallet|does not belong|Offer not found|not owned/i.test(text),
		},
	},
	{
		route: 'GET /credentials/received/:credentialHash',
		title: 'read a received credential held for another tenant',
		request: (t) => ({ method: 'GET', path: `/credentials/received/hash-${t.name}` }),
		prepare: (h, t) =>
			h.stubVeramo('retrieveCredentialFromDataStore', {
				...credentialFor(t),
				credentialSubject: { id: t.did, name: 'held' },
			}),
		oracle: { kind: 'read-one' },
	},
	{
		route: 'POST /credentials/import',
		title: 'import a credential addressed to another tenant’s DID',
		request: (t) => ({
			method: 'POST',
			path: '/credentials/import',
			body: {
				credential: { ...credentialFor(t), credentialSubject: { id: t.did, name: 'held' } },
				holderDid: t.did,
			},
		}),
		prepare: (h, t) => {
			h.stubVeramo('verifyCredential', {
				verified: true,
				issuer: t.did,
				payload: { sub: t.did },
				verifiableCredential: { ...credentialFor(t), credentialSubject: { id: t.did } },
			});
		},
		oracle: { kind: 'ledger', reach: ['saveCredentialToDataStore'] },
	},
	{
		route: 'POST /did/import',
		title: 'import a DID that another tenant already holds',
		request: (t) => ({
			method: 'POST',
			path: '/did/import',
			body: { did: t.did, keys: [{ privateKeyHex: 'ab'.repeat(32), type: 'Ed25519', encrypted: false }] },
		}),
		prepare: (h, t) => {
			h.stubVeramo('resolveDid', {
				didDocument: {
					'@context': ['https://www.w3.org/ns/did/v1'],
					id: t.did,
					controller: [t.did],
					verificationMethod: [
						{
							id: `${t.did}#key-1`,
							type: 'Ed25519VerificationKey2018',
							controller: t.did,
							publicKeyBase58: '6QN8DfuN9hjgHgPvLXqgzqYE3jRRGRrmJQZkd5tL8paR',
						},
					],
				},
				didDocumentMetadata: {},
				didResolutionMetadata: {},
			});
			h.stubVeramo('importDid', { did: t.did, provider: 'did:cheqd:testnet', keys: [], services: [] });
		},
		oracle: { kind: 'read-one' },
		extraAssert: async (h: Harness, _attacker: Tenant, victim: Tenant) => {
			const [row] = await h.query('SELECT "customerId" FROM "identifier" WHERE "did" = $1', [victim.did]);
			expect(row.customerId).toBe(victim.customerId);
		},
	},
	{
		route: 'POST /key/import',
		title: 'import a key that another tenant already holds',
		request: (t) => ({
			method: 'POST',
			path: '/key/import',
			body: { type: 'Ed25519', encrypted: false, privateKeyHex: 'cd'.repeat(32), alias: `taken-${t.name}` },
		}),
		prepare: (h, t) =>
			h.stubVeramo('importKey', { kid: t.kid, kms: 'postgres', type: 'Ed25519', publicKeyHex: t.publicKeyHex }),
		oracle: { kind: 'read-one' },
		extraAssert: async (h: Harness, _attacker: Tenant, victim: Tenant) => {
			const [row] = await h.query('SELECT "customerId" FROM "key" WHERE "kid" = $1', [victim.kid]);
			expect(row.customerId).toBe(victim.customerId);
		},
	},
	{
		route: 'POST /admin/api-key/update',
		title: "rename and extend another tenant's API key",
		request: (t) => ({
			method: 'POST',
			path: '/admin/api-key/update',
			body: { apiKey: t.spareApiKey, name: 'renamed-by-attacker' },
		}),
		oracle: { kind: 'read-one' },
	},
	{
		route: 'DELETE /admin/api-key/revoke',
		title: "revoke another tenant's API key",
		request: (t) => ({ method: 'DELETE', path: '/admin/api-key/revoke', body: { apiKey: t.spareApiKey } }),
		oracle: { kind: 'read-one' },
	},
];
