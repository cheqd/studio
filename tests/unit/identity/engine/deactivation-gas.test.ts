import { describe, expect, it } from '@jest/globals';
import {
	ASSUMED_VERSIONS_WHEN_UNKNOWN,
	DEFAULT_DEACTIVATE_GAS_LIMIT,
	MAX_DEACTIVATE_GAS_LIMIT,
	countDidVersions,
	deactivationGasLimit,
} from '../../../../src/services/identity/engine/deactivation-gas.js';

const did = 'did:cheqd:testnet:0b8c4e0c-3c0a-4c55-8b4a-0f6b8e4b1d2a';

/** A DID document like the one in U-62: one key and `services` service entries. */
function documentWith(services: number) {
	return {
		'@context': ['https://www.w3.org/ns/did/v1', 'https://w3id.org/security/suites/ed25519-2020/v1'],
		id: did,
		controller: [did],
		verificationMethod: [
			{
				id: `${did}#key-1`,
				type: 'Ed25519VerificationKey2020',
				controller: did,
				publicKeyMultibase: 'z6MkqKz9Qe3Y6zS3cX8b8t3m4nR5o6p7q8r9s1t2u3v4w5x6',
			},
		],
		authentication: [`${did}#key-1`],
		assertionMethod: [`${did}#key-1`],
		service: Array.from({ length: services }, (_, i) => ({
			id: `${did}#service-${i}`,
			type: 'LinkedDomains',
			serviceEndpoint: [`https://service-${i}.example.com/a/reasonably/long/path/to/an/endpoint`],
		})),
	};
}

const gas = (input: Parameters<typeof deactivationGasLimit>[0]) => Number(deactivationGasLimit(input));

describe('deactivationGasLimit (U-62)', () => {
	it('keeps the SDK limit for a DID with a single version', () => {
		expect(deactivationGasLimit({ didDocument: documentWith(0), versionCount: 1 })).toBe('360000');
		expect(DEFAULT_DEACTIVATE_GAS_LIMIT).toBe(360_000);
	});

	it('is a decimal string, as the SDK fee options take it', () => {
		expect(deactivationGasLimit({ didDocument: documentWith(2), versionCount: 3 })).toMatch(/^\d+$/);
	});

	it('gives the failing staging DID (three updates, several services) well over the gas it used', () => {
		// The ledger used 360,155 (Credo) and 360,226 (Veramo) gas, and wanted more, on such a DID
		const limit = gas({ didDocument: documentWith(4), versionCount: 4 });
		expect(limit).toBeGreaterThan(360_226 * 1.4);
		expect(limit).toBeLessThanOrEqual(MAX_DEACTIVATE_GAS_LIMIT);
	});

	it('grows with the number of versions and with the size of the document', () => {
		const doc = documentWith(3);
		expect(gas({ didDocument: doc, versionCount: 2 })).toBeGreaterThan(gas({ didDocument: doc, versionCount: 1 }));
		expect(gas({ didDocument: doc, versionCount: 5 })).toBeGreaterThan(gas({ didDocument: doc, versionCount: 2 }));
		expect(gas({ didDocument: documentWith(6), versionCount: 3 })).toBeGreaterThan(
			gas({ didDocument: documentWith(1), versionCount: 3 })
		);
	});

	it('assumes several versions when the count is unknown or nonsense', () => {
		const doc = documentWith(2);
		const assumed = gas({ didDocument: doc, versionCount: ASSUMED_VERSIONS_WHEN_UNKNOWN });
		expect(gas({ didDocument: doc })).toBe(assumed);
		expect(gas({ didDocument: doc, versionCount: 0 })).toBe(assumed);
		expect(gas({ didDocument: doc, versionCount: Number.NaN })).toBe(assumed);
		expect(assumed).toBeGreaterThan(DEFAULT_DEACTIVATE_GAS_LIMIT);
	});

	it('is capped so the unchanged deactivation fee (10 CHEQ) still covers it at 7,500 ncheq per unit of gas', () => {
		expect(gas({ didDocument: documentWith(40), versionCount: 200 })).toBe(MAX_DEACTIVATE_GAS_LIMIT);
		expect(MAX_DEACTIVATE_GAS_LIMIT * 7_500).toBeLessThanOrEqual(10_000_000_000);
	});
});

describe('countDidVersions', () => {
	it('reads the cheqd resolver’s `<did>/versions` answer', () => {
		expect(countDidVersions({ contentStream: { versions: [{}, {}, {}] }, contentMetadata: {} })).toBe(3);
	});

	it('reads a resolver answer whose metadata is the list of versions', () => {
		expect(countDidVersions({ didDocumentMetadata: [{}, {}] })).toBe(2);
	});

	it('is undefined when the answer carries no list', () => {
		expect(countDidVersions(undefined)).toBeUndefined();
		expect(countDidVersions({ didDocumentMetadata: { deactivated: false } })).toBeUndefined();
		expect(countDidVersions({ contentStream: { versions: [] } })).toBeUndefined();
	});
});
