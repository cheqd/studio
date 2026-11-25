import { describe, expect, it } from '@jest/globals';
import { requiredUpdateSigners } from '../../../../src/services/identity/engine/credo/did-update-signers.js';

const did = 'did:cheqd:testnet:6f5f8e4c-1c55-4a3a-9f84-0d3c1b6f2a10';
const jwk = (x: string) => ({ kty: 'EC', crv: 'P-256', x, y: 'y' });
const p256 = (fragment: string, x: string) => ({
	id: `${did}#${fragment}`,
	type: 'JsonWebKey2020',
	controller: did,
	publicKeyJwk: jwk(x),
});
const ed25519 = (fragment: string, multibase: string) => ({
	id: `${did}#${fragment}`,
	type: 'Ed25519VerificationKey2020',
	controller: did,
	publicKeyMultibase: multibase,
});

/** The agent DID as registered: key-1 (P-256) and key-2 (Ed25519), both in authentication. */
const registered = {
	id: did,
	controller: [did],
	verificationMethod: [p256('key-1', 'a'), ed25519('key-2', 'z6Mkb')],
	authentication: [`${did}#key-1`, `${did}#key-2`],
	assertionMethod: [`${did}#key-1`, `${did}#key-2`],
};

/** The signer set Credo's registrar picks on its own: every new authentication key plus every removed one. */
function credoDefault(next: typeof registered, previous: typeof registered): string[] {
	const removed = previous.authentication.filter((id) => !next.authentication.includes(id));
	return [...next.authentication, ...removed];
}

/** Runs the check `@cheqd/sdk` runs before it broadcasts an update. */
async function sdkAccepts(next: unknown, previous: unknown, signers: string[]) {
	const { DIDModule } = await import('@cheqd/sdk');
	return DIDModule.validateAuthenticationAgainstSignaturesKeyRotation(
		structuredClone(next) as never,
		signers.map((verificationMethodId) => ({ verificationMethodId, signature: new Uint8Array(64) })) as never,
		{} as never,
		structuredClone(previous) as never
	);
}

describe('requiredUpdateSigners', () => {
	const rotated = {
		...registered,
		verificationMethod: [...registered.verificationMethod, p256('key-3', 'c')],
		authentication: [`${did}#key-3`, `${did}#key-2`],
		assertionMethod: [`${did}#key-3`, `${did}#key-2`],
	};

	it('a key replacement (agent key rotation) is signed by the added and the removed key only', async () => {
		const signers = requiredUpdateSigners(rotated, registered);
		expect(signers && [...signers].sort()).toEqual([`${did}#key-1`, `${did}#key-3`]);
		await expect(sdkAccepts(rotated, registered, [...(signers ?? [])])).resolves.toMatchObject({ valid: true });
	});

	it('Credo’s own signer set for the same update is refused by the SDK (the staging 500)', async () => {
		const result = await sdkAccepts(rotated, registered, credoDefault(rotated, registered));
		expect(result.valid).toBe(false);
		expect(result.error).toContain(`${did}#key-2 is not required`);
	});

	it('leaves an added key (no key removed) to Credo, whose signer set the SDK accepts', async () => {
		const added = {
			...registered,
			verificationMethod: [...registered.verificationMethod, ed25519('key-3', 'z6Mkc')],
			authentication: [...registered.authentication, `${did}#key-3`],
		};
		expect(requiredUpdateSigners(added, registered)).toBeNull();
		await expect(sdkAccepts(added, registered, credoDefault(added, registered))).resolves.toMatchObject({
			valid: true,
		});
	});

	it('leaves an update that changes no authentication key (a service) to Credo', async () => {
		const withService = {
			...registered,
			service: [{ id: `${did}#agent`, type: 'LinkedDomains', serviceEndpoint: ['https://example.com'] }],
		};
		expect(requiredUpdateSigners(withService, registered)).toBeNull();
		await expect(sdkAccepts(withService, registered, credoDefault(withService, registered))).resolves.toMatchObject(
			{ valid: true }
		);
	});

	it('reads relative authentication references as full DID URLs', () => {
		const relative = { ...rotated, authentication: ['#key-3', '#key-2'] };
		const signers = requiredUpdateSigners(relative, { ...registered, authentication: ['#key-1', '#key-2'] });
		expect(signers && [...signers].sort()).toEqual([`${did}#key-1`, `${did}#key-3`]);
	});

	it('does not filter when there is an external controller or no previous version', () => {
		expect(
			requiredUpdateSigners({ ...rotated, controller: [did, 'did:cheqd:testnet:other'] }, registered)
		).toBeNull();
		expect(requiredUpdateSigners(rotated, null)).toBeNull();
	});

	it('does not filter a key whose material changes under the same id', () => {
		const inPlace = {
			...registered,
			verificationMethod: [p256('key-1', 'changed'), ed25519('key-2', 'z6Mkb'), p256('key-3', 'c')],
			authentication: [`${did}#key-3`, `${did}#key-2`],
		};
		expect(requiredUpdateSigners(inPlace, registered)).toBeNull();
	});
});
