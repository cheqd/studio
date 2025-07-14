import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import * as fs from 'fs';
import { CONTENT_TYPE, PAYLOADS_PATH } from '../../constants';

test.use({ storageState: 'playwright/.auth/user.json' });

// TODO: Fix out of gas error for the following tests
const didUrl: string = `did:cheqd:testnet:5RpEg66jhhbmASWPXJRWrA?resourceName=suspensionAccreditation&resourceType=VerifiableAuthorizationForTrustChain`;
const subjectDid: string = 'did:cheqd:testnet:15b74787-6e48-4fd5-8020-eab24e990578';

test.skip(' Issue a jwt accreditation with suspension statuslist', async ({ request }) => {
	const payload = JSON.parse(
		fs.readFileSync(`${PAYLOADS_PATH.ACCREDITATION}/authorize-jwt-revocation.json`, 'utf-8')
	);
	payload.credentialStatus.statusPurpose = 'suspension';
	payload.accreditationName = 'suspensionAccreditation';
	const issueResponse = await request.post(`/trust-registry/accreditation/issue?accreditationType=authorize`, {
		data: JSON.stringify(payload),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const { didUrls, accreditation } = await issueResponse.json();
	expect(didUrls).toContain(didUrl);
	expect(issueResponse.status()).toBe(StatusCodes.OK);
	expect(accreditation.proof.type).toBe('JwtProof2020');
	expect(accreditation.proof).toHaveProperty('jwt');
	expect(typeof accreditation.issuer === 'string' ? accreditation.issuer : accreditation.issuer.id).toBe(
		payload.issuerDid
	);
	expect(accreditation.type).toContain('VerifiableCredential');
	expect(accreditation.credentialSubject.id).toBe(payload.subjectDid);
	expect(accreditation.credentialStatus).toMatchObject({
		type: 'StatusList2021Entry',
		statusPurpose: 'suspension',
	});
	expect(accreditation.credentialStatus).toHaveProperty('statusListIndex');
	expect(accreditation.credentialStatus).toHaveProperty('id');
});

test.skip(" Verify a Accreditation's suspension status", async ({ request }) => {
	const response = await request.post(`/trust-registry/accreditation/verify?verifyStatus=true`, {
		data: JSON.stringify({
			didUrl,
			subjectDid,
		}),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const result = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(result.verified).toBe(true);
	expect(result.suspended).toBe(false);
});

test.skip(' Verify a credential status after suspension', async ({ request }) => {
	const response = await request.post(`/trust-registry/accreditation/suspend?publish=true`, {
		data: JSON.stringify({
			didUrl,
			subjectDid,
		}),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const result = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(result.suspended).toBe(true);
	expect(result.published).toBe(true);

	const verificationResponse = await request.post(`/trust-registry/accreditation/verify?verifyStatus=true`, {
		data: JSON.stringify({
			didUrl,
			subjectDid,
		}),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const verificationResult = await verificationResponse.json();
	expect(verificationResponse).toBeOK();
	expect(verificationResponse.status()).toBe(StatusCodes.OK);
	expect(verificationResult.verified).toBe(true);
	expect(verificationResult.suspended).toBe(true);
});

test.skip(' Verify a accreditation status after reinstating', async ({ request }) => {
	const response = await request.post(`/trust-registry/accreditation/reinstate?publish=true`, {
		data: JSON.stringify({
			didUrl,
			subjectDid,
		}),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const result = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(result.unsuspended).toBe(true);

	const verificationResponse = await request.post(`/trust-registry/accreditation/verify?verifyStatus=true`, {
		data: JSON.stringify({
			didUrl,
			subjectDid,
		}),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const verificationResult = await verificationResponse.json();
	expect(verificationResponse).toBeOK();
	expect(verificationResponse.status()).toBe(StatusCodes.OK);
	expect(verificationResult.verified).toBe(true);
	expect(verificationResult.suspended).toBe(false);
});
