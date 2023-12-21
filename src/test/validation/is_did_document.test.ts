import { describe, it, expect } from '@jest/globals';
import { DIDDocumentValidator } from '../../controllers/validator/did-document';
import type { DIDDocument } from 'did-resolver';
import { VALID_CHEQD_DID_INDY, VALID_CHEQD_DID_UUID } from '../constants';
import { VerificationMethods } from '@cheqd/sdk';

const verificationMethodSamples = [
	{
		type: VerificationMethods.Ed255192018,
		publicKeyBase58: 'EFTJb1qVRoj2rHwHMz4rnmqXGejUBsmpcfMdVN99KJSD',
	},
	{
		type: VerificationMethods.Ed255192020,
		publicKeyMultibase: 'z6MkshiMBG5vmMDVxnmz3Z2hdsPX6E1Kbm2BJgGZKe7AEXDb',
	},
	{
		type: VerificationMethods.JWK,
		publicKeyJwk: {
			crv: 'Ed25519',
			kty: 'OKP',
			x: 'xNvNcUDxWEcyW-zqabrc-IBLguWYUCAhYwMaOqN2Rqo',
		},
	},
];

for (const did of [VALID_CHEQD_DID_UUID, VALID_CHEQD_DID_INDY]) {
	for (const controllerDID of [VALID_CHEQD_DID_INDY, VALID_CHEQD_DID_UUID]) {
		for (const authenticationDID of [VALID_CHEQD_DID_INDY, VALID_CHEQD_DID_UUID]) {
			for (const verificationSample of verificationMethodSamples) {
				const verificationMethod = {
					...verificationSample,
					controller: controllerDID,
					id: `${did}#keys-1`,
				};
				const didDocument: DIDDocument = {
					'@context': 'https://www.w3.org/ns/did/v1',
					id: did,
					verificationMethod: [verificationMethod],
					authentication: [authenticationDID],
					service: [
						{
							id: `${did}#service-1`,
							type: 'LinkedDomains',
							serviceEndpoint: ['https://example.com/'],
						},
					],
				};

				describe('isDidDocument. Positive.', () => {
					it(`should return true for valid did document.
                        DID: ${did}.
                        verificationType: ${verificationMethod.type}
                        controller DID: ${controllerDID}
                        authentication DID: ${authenticationDID}`, () => {
						const res = new DIDDocumentValidator().validate(didDocument);
						expect(res.valid).toBeTruthy();
						expect(res.error).toBeUndefined();
					});
				});
			}
		}
	}
}
