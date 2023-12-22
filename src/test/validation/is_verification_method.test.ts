import { describe, it, expect } from '@jest/globals';
import { VerificationMethodValidator } from '../../controllers/validator/verification-method';
import { VALID_CHEQD_DID_INDY, VALID_CHEQD_DID_UUID } from '../constants';
import { VerificationMethods } from '@cheqd/sdk';

const PUBLIC_KEY_BASE_58 = 'EFTJb1qVRoj2rHwHMz4rnmqXGejUBsmpcfMdVN99KJSD';
const PUBLIC_KEY_MULTIBASE = 'z6MkshiMBG5vmMDVxnmz3Z2hdsPX6E1Kbm2BJgGZKe7AEXDb';
const PUBLIC_KEY_JWK = {
	crv: 'Ed25519',
	kty: 'OKP',
	x: 'xNvNcUDxWEcyW-zqabrc-IBLguWYUCAhYwMaOqN2Rqo',
};

const verificationMethodSamples = [
	{
		type: VerificationMethods.Ed255192018,
		publicKeyBase58: PUBLIC_KEY_BASE_58,
	},
	{
		type: VerificationMethods.Ed255192020,
		publicKeyMultibase: PUBLIC_KEY_MULTIBASE,
	},
	{
		type: VerificationMethods.JWK,
		publicKeyJwk: PUBLIC_KEY_JWK,
	},
];

for (const did of [VALID_CHEQD_DID_UUID, VALID_CHEQD_DID_INDY]) {
	for (const verificationSample of verificationMethodSamples) {
		const verificationMethod = {
			...verificationSample,
			controller: did,
			id: `${did}#keys-1`,
		};

		describe('isVerificationMethod. Positive.', () => {
			it(`should return true for valid did document.
                DID: ${did}.
                verificationType: ${verificationMethod.type}`, () => {
				const res = new VerificationMethodValidator().validate([verificationMethod]);
				expect(res.valid).toBeTruthy();
				expect(res.error).toBeUndefined();
			});
		});
	}
}

// Negative tests

describe('isVerificationMethod. Negative.', () => {
	it(`should return false because id format is wrong
		verificationType: ${VerificationMethods.Ed255192018}
		controller: ${VALID_CHEQD_DID_INDY}
		id: ${VALID_CHEQD_DID_INDY}`, () => {
		const res = new VerificationMethodValidator().validate([
			{
				type: VerificationMethods.Ed255192018,
				controller: VALID_CHEQD_DID_INDY,
				id: VALID_CHEQD_DID_INDY,
				publicKeyBase58: PUBLIC_KEY_BASE_58,
			},
		]);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('id does not have right format');
	});

	it(`should return false because type is wrong
		verificationType: unknownVerificationMethodType
		controller: ${VALID_CHEQD_DID_INDY}
		id: ${VALID_CHEQD_DID_INDY}#key-1`, () => {
		const res = new VerificationMethodValidator().validate([
			{
				type: 'unknownVerificationMethodType',
				controller: VALID_CHEQD_DID_INDY,
				id: `${VALID_CHEQD_DID_INDY}#key-1`,
				publicKeyBase58: PUBLIC_KEY_BASE_58,
			},
		]);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('verificationMethod.type unknownVerificationMethodType is not supported');
	});

	it(`should return false because for ED25519VerificationKey2018 type publicKeyBase58 is required
		verificationType: ${VerificationMethods.Ed255192018}
		controller: ${VALID_CHEQD_DID_INDY}
		id: ${VALID_CHEQD_DID_INDY}#key-1`, () => {
		const res = new VerificationMethodValidator().validate([
			{
				type: VerificationMethods.Ed255192018,
				controller: VALID_CHEQD_DID_INDY,
				id: `${VALID_CHEQD_DID_INDY}#key-1`,
				publicKeyMultibase: PUBLIC_KEY_BASE_58,
			},
		]);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('publicKeyBase58 is required for Ed25519VerificationKey2018');
	});

	it(`should return false because for ED25519VerificationKey2020 type publicKeyBase58 is required
		verificationType: ${VerificationMethods.Ed255192020}
		controller: ${VALID_CHEQD_DID_INDY}
		id: ${VALID_CHEQD_DID_INDY}#key-1`, () => {
		const res = new VerificationMethodValidator().validate([
			{
				type: VerificationMethods.Ed255192020,
				controller: VALID_CHEQD_DID_INDY,
				id: `${VALID_CHEQD_DID_INDY}#key-1`,
				publicKeyBase58: PUBLIC_KEY_BASE_58,
			},
		]);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('publicKeyMultibase is required for Ed25519VerificationKey2020');
	});

	it(`should return false because for JsonWebKey2020 type is required
		verificationType: ${VerificationMethods.JWK}
		controller: ${VALID_CHEQD_DID_INDY}
		id: ${VALID_CHEQD_DID_INDY}#key-1`, () => {
		const res = new VerificationMethodValidator().validate([
			{
				type: VerificationMethods.JWK,
				controller: VALID_CHEQD_DID_INDY,
				id: `${VALID_CHEQD_DID_INDY}#key-1`,
				publicKeyBase58: PUBLIC_KEY_BASE_58,
			},
		]);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('publicKeyJwk is required for JsonWebKey2020');
	});

	it(`should return false because controller is invalid
		verificationType: ${VerificationMethods.Ed255192018}
		controller: did:unknown:network:1234567890
		id: ${VALID_CHEQD_DID_INDY}#key-1`, () => {
		const res = new VerificationMethodValidator().validate([
			{
				type: VerificationMethods.Ed255192018,
				controller: `did:unknown:network:1234567890`,
				id: `${VALID_CHEQD_DID_INDY}#key-1`,
				publicKeyBase58: PUBLIC_KEY_BASE_58,
			},
		]);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain(
			'verificationMethod.controller has validation error: DID method unknown is not supported'
		);
	});

	it(`should return false because verififcationMethod ids are not unique
		verificationType: ${VerificationMethods.Ed255192018}
		controller: ${VALID_CHEQD_DID_INDY}
		ids: [ ${VALID_CHEQD_DID_INDY}#key-1, ${VALID_CHEQD_DID_INDY}#key-1]`, () => {
		const res = new VerificationMethodValidator().validate([
			{
				type: VerificationMethods.Ed255192018,
				controller: VALID_CHEQD_DID_INDY,
				id: `${VALID_CHEQD_DID_INDY}#key-1`,
				publicKeyBase58: PUBLIC_KEY_BASE_58,
			},
			{
				type: VerificationMethods.Ed255192018,
				controller: VALID_CHEQD_DID_INDY,
				id: `${VALID_CHEQD_DID_INDY}#key-1`,
				publicKeyBase58: PUBLIC_KEY_BASE_58,
			},
		]);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('verificationMethod.id values are not unique');
	});
});
