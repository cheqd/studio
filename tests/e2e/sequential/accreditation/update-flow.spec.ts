import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import { CONTENT_TYPE, PAYLOADS_PATH } from '../../constants';

test.use({ storageState: 'playwright/.auth/user.json' });

// TODO: Fix out of gas error for the following tests
const didUrl: string = `did:cheqd:testnet:11ceabbd-1fdc-46c0-a15d-534c07926d2b?resourceName=testAccreditation&resourceType=VerifiableAuthorizationForTrustChain`;
const subjectDid: string = 'did:cheqd:testnet:15b74787-6e48-4fd5-8020-eab24e990578';
test(' Issue an Accreditation with statuslist', async ({ request }) => {
	const payload = JSON.parse(
		fs.readFileSync(`${PAYLOADS_PATH.ACCREDITATION}/authorize-jwt-revocation.json`, 'utf-8')
	);
	const issueResponse = await request.post(`/trust-registry/accreditation/issue?accreditationType=authorize`, {
		data: JSON.stringify(payload),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const { didUrls, accreditation } = await issueResponse.json();
	expect(didUrls).toContain(didUrl);
	expect(issueResponse).toBeOK();
	expect(issueResponse.status()).toBe(StatusCodes.OK);
	expect(accreditation.proof.type).toBe('JwtProof2020');
	expect(accreditation.proof).toHaveProperty('jwt');
	expect(typeof accreditation.issuer === 'string' ? accreditation.issuer : accreditation.issuer.id).toBe(
		payload.issuerDid
	);
	expect(accreditation.type).toContain('VerifiableCredential');
	expect(accreditation.credentialSubject.id).toBe(payload.subjectDid);

	expect(accreditation.credentialStatus).toHaveProperty('id');
	expect(accreditation.credentialStatus.type).toBe('BitstringStatusListEntry');
	expect(accreditation.credentialStatus.statusPurpose).toBe(payload.credentialStatus.statusPurpose);
	expect(accreditation.credentialStatus).toHaveProperty('statusListIndex');
	expect(accreditation.credentialStatus).toHaveProperty('statusListCredential');
});

test(" Verify a Accreditation's status", async ({ request }) => {
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
	expect(result.valid).toBe(true);
	expect(result.status).toBe(0);
	expect(result.message).toBe('valid');
});

test(' Suspend and Verify an accreditation', async ({ request }) => {
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
	expect(result.updated).toBe(true);
	expect(result.statusValue).toBe(2);
	expect(result.statusMessage).toBe('suspended');
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
	expect(verificationResult.verified).toBe(false);
	expect(verificationResult.valid).toBe(false);
	expect(verificationResult.status).toBe(2);
	expect(verificationResult.message).toBe('suspended');
});

test(' Reinstate and Verify an accreditation', async ({ request }) => {
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
	expect(result.updated).toBe(true);
	expect(result.statusValue).toBe(0);
	expect(result.statusMessage).toBe('valid');
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
	expect(verificationResult.valid).toBe(true);
	expect(verificationResult.status).toBe(0);
	expect(verificationResult.message).toBe('valid');
});

test(' Revoke and Verify an Accreditation', async ({ request }) => {
	const response = await request.post(`/trust-registry/accreditation/revoke?publish=true`, {
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
	expect(result.updated).toBe(true);
	expect(result.statusValue).toBe(1);
	expect(result.statusMessage).toBe('revoked');
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
	expect(verificationResult.verified).toBe(false);
	expect(verificationResult.valid).toBe(false);
	expect(verificationResult.status).toBe(1);
	expect(verificationResult.message).toBe('revoked');
});
