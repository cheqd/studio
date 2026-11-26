import { describe, expect, it } from '@jest/globals';
import { generateKeyPairSync, sign } from 'node:crypto';
import { CredentialPlugin } from '@veramo/credential-w3c';
import { Cheqd } from '@cheqd/did-provider-cheqd';
import { CredoStatusLists } from '../../../../src/services/identity/engine/credo/status-lists.js';
import { bitstringProofPayload } from '../../../../src/services/identity/engine/credo/status-lists-session.js';

/**
 * U-53: a Bitstring list created by the Credo engine must pass the proof check the Veramo plugin runs before it reads
 * a list (`VerifyStatusListCredential`, behind `POST /credential/verify?verifyStatus=true` and accreditation checks).
 * The list is built by the real `CredoStatusLists` create path and the real JWT payload builder, signed with a real
 * Ed25519 key, then verified by the real `@veramo/credential-w3c` and `@cheqd/did-provider-cheqd` code.
 */

const DID = 'did:cheqd:testnet:33333333-3333-4333-8333-333333333333';
const KID = `${DID}#key-1`;
// Not on a whole second: the JWT `nbf` can only carry whole seconds.
const NOW = new Date('2026-11-23T10:15:30.456Z');

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const publicKeyJwk = publicKey.export({ format: 'jwk' });
const didDocument = {
	'@context': ['https://www.w3.org/ns/did/v1'],
	id: DID,
	verificationMethod: [{ id: KID, type: 'JsonWebKey2020', controller: DID, publicKeyJwk }],
	authentication: [KID],
	assertionMethod: [KID],
};

/** Compact EdDSA JWS over `payload`, with the header Credo's `JwsService` writes. */
function signJwt(payload: unknown): string {
	const b64u = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
	const input = `${b64u({ alg: 'EdDSA', typ: 'JWT', kid: KID })}.${b64u(payload)}`;
	return `${input}.${sign(null, new TextEncoder().encode(input), privateKey).toString('base64url')}`;
}

async function createWithCredo(options: Record<string, any>): Promise<any> {
	const written: Uint8Array[] = [];
	const lists = new CredoStatusLists({
		store: { isDidOwned: async () => true, findPayerAccount: async () => ({ address: 'cheqd1x', kid: 'k' }) },
		runtime: {
			resolveDid: async () => ({ didDocument, didDocumentMetadata: {}, didResolutionMetadata: {} }),
			withTenant: async (_tenant: string, work: any) =>
				work({
					createResource: async (_did: string, resource: { data: Uint8Array }) => {
						written.push(resource.data);
						return { state: 'finished' };
					},
					statusLists: {
						signBitstringProof: async (input: any) => signJwt(bitstringProofPayload(input)),
					},
				}),
		} as any,
		withPayerLock: (_address: string, work: () => Promise<unknown>) => work(),
		ensureTenant: async () => 'tenant',
		safeFetch: async () => {
			throw new Error('no network in this test');
		},
		resolverUrl: 'https://resolver.cheqd.net/1.0/identifiers/',
		now: () => NOW,
	} as any);
	await lists.createUnencryptedBitstringStatusList(
		DID,
		{ name: 'u53', version: '1.0' } as any,
		options as any,
		{
			customerId: 'c',
		} as never
	);
	// What a verifier fetches from the resolver: the bytes put on the ledger
	return JSON.parse(new TextDecoder().decode(written[0])).bitstringStatusListCredential;
}

const veramo = new CredentialPlugin();
const agent: any = {
	resolveDid: async () => ({ didDocument, didDocumentMetadata: {}, didResolutionMetadata: {} }),
	verifyCredential: (args: any) => veramo.verifyCredential(args, { agent } as any),
};
/** The plugin's own check, exactly as `VerifyBitstringStatusList` calls it on a fetched list. */
const pluginVerifies = (credential: unknown) =>
	(Cheqd.prototype as any).VerifyStatusListCredential.call(undefined, { credential }, { agent });

describe('a Credo-created Bitstring list on the Veramo verify path (U-53)', () => {
	it.each([
		['one purpose', { statusPurpose: 'revocation' }],
		['two purposes and a ttl', { statusPurpose: ['revocation', 'suspension'], ttl: 300000 }],
		['the default message purpose', {}],
	])('passes the plugin proof check: %s', async (_label, options) => {
		const list = await createWithCredo(options);
		const result = await pluginVerifies(list);
		expect(result.error).toBeUndefined();
		expect(result.verified).toBe(true);
	});

	it('is the same credential, apart from encodedList, as the one the JWT carries', async () => {
		const list = await createWithCredo({ statusPurpose: 'revocation', ttl: 60 });
		const { encodedList, ...subject } = list.credentialSubject;
		const result = await agent.verifyCredential({
			credential: { ...list, credentialSubject: subject },
			policies: { credentialStatus: false },
		});
		expect(result.error).toBeUndefined();
		expect(result.verified).toBe(true);
		expect(typeof encodedList).toBe('string');
		// The JWT `nbf` holds whole seconds, so the issuance date the list states does too
		expect(list.issuanceDate).toBe('2026-11-23T10:15:30.000Z');
	});

	it('still fails when the list states something its JWT does not (the check is real)', async () => {
		const list = await createWithCredo({ statusPurpose: 'revocation' });
		const result = await pluginVerifies({ ...list, issuanceDate: '2026-11-23T10:15:31.000Z' });
		expect(result.verified).toBe(false);
	});
});
