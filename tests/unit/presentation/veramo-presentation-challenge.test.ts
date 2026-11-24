import { beforeAll, describe, expect, it } from '@jest/globals';
import { createAgent, type IIdentifier, type VerifiablePresentation } from '@veramo/core';
import { CredentialPlugin } from '@veramo/credential-w3c';
import { DIDManager, MemoryDIDStore } from '@veramo/did-manager';
import { getDidKeyResolver, KeyDIDProvider } from '@veramo/did-provider-key';
import { DIDResolverPlugin } from '@veramo/did-resolver';
import { KeyManager, MemoryKeyStore, MemoryPrivateKeyStore } from '@veramo/key-manager';
import { KeyManagementSystem } from '@veramo/kms-local';
import { decodeJWT } from 'did-jwt';
import { Resolver } from 'did-resolver';

import { Veramo } from '../../../src/services/identity/providers/studio/agent.js';
import type { VeramoAgent } from '../../../src/types/shared.js';

// POST /presentation/create and /presentation/verify on the Veramo engine. A presentation created with a challenge
// must carry it as its nonce, so that verifying with the same challenge succeeds. Runs against a real, in-memory
// Veramo agent with did:key identifiers, so nothing leaves the process.
let agent: VeramoAgent;
let holder: IIdentifier;
let verifier: IIdentifier;
let credential: unknown;

beforeAll(async () => {
	agent = createAgent({
		plugins: [
			new KeyManager({
				store: new MemoryKeyStore(),
				kms: { local: new KeyManagementSystem(new MemoryPrivateKeyStore()) },
			}),
			new DIDManager({
				store: new MemoryDIDStore(),
				defaultProvider: 'did:key',
				providers: { 'did:key': new KeyDIDProvider({ defaultKms: 'local' }) },
			}),
			new DIDResolverPlugin({ resolver: new Resolver({ ...getDidKeyResolver() }) }),
			new CredentialPlugin(),
		],
	}) as unknown as VeramoAgent;
	holder = await agent.didManagerCreate({ provider: 'did:key', kms: 'local' });
	verifier = await agent.didManagerCreate({ provider: 'did:key', kms: 'local' });
	credential = await agent.createVerifiableCredential({
		credential: {
			issuer: { id: holder.did },
			credentialSubject: { id: holder.did, name: 'Test' },
		},
		proofFormat: 'jwt',
	});
});

const create = (challenge?: string) =>
	Veramo.instance.createPresentation(
		agent,
		{ holder: holder.did, verifiableCredential: [credential as never] },
		{ domain: verifier.did, challenge }
	);

const verify = (presentation: VerifiablePresentation, challenge?: string) =>
	Veramo.instance.verifyPresentation(agent, structuredClone(presentation), { domain: verifier.did, challenge });

describe('Veramo presentation challenge', () => {
	it('carries the challenge as the presentation nonce', async () => {
		const presentation = await create('challenge-123');
		const { payload } = decodeJWT(presentation.proof.jwt);
		expect(payload.nonce).toBe('challenge-123');
		expect(payload.aud).toEqual(expect.arrayContaining([verifier.did]));
	});

	it('verifies a presentation created with the same challenge', async () => {
		const presentation = await create('challenge-123');
		const result = await verify(presentation, 'challenge-123');
		expect(result.error).toBeUndefined();
		expect(result.verified).toBe(true);
	});

	it('rejects a presentation verified with a different challenge', async () => {
		const presentation = await create('challenge-123');
		const result = await verify(presentation, 'another-challenge');
		expect(result.verified).toBe(false);
	});

	it('creates and verifies a presentation without a challenge as before', async () => {
		const presentation = await create();
		expect(decodeJWT(presentation.proof.jwt).payload.nonce).toBeUndefined();
		const result = await verify(presentation);
		expect(result.error).toBeUndefined();
		expect(result.verified).toBe(true);
	});
});
