import type { VerifiableCredential } from '@veramo/core';
import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import { CONTENT_TYPE, PAYLOADS_PATH } from '../../constants';

test.use({ storageState: 'playwright/.auth/user.json' });

let jwtCredential: VerifiableCredential;

test(' Issue a jwt credential with bitstring statuslist', async ({ request }) => {
	const credentialData = JSON.parse(
		fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/credential-issue-jwt-statuslist.json`, 'utf-8')
	);
	const response = await request.post(`/credential/issue`, {
		data: JSON.stringify(credentialData),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	jwtCredential = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(jwtCredential.proof.type).toBe('JwtProof2020');
	expect(jwtCredential.proof).toHaveProperty('jwt');
	expect(typeof jwtCredential.issuer === 'string' ? jwtCredential.issuer : jwtCredential.issuer.id).toBe(
		credentialData.issuerDid
	);
	expect(jwtCredential.type).toContain('VerifiableCredential');
	expect(jwtCredential.credentialSubject).toMatchObject({
		...credentialData.attributes,
		id: credentialData.subjectDid,
	});

	expect(jwtCredential.credentialStatus).toHaveProperty('id');
	expect(jwtCredential.credentialStatus.type).toBe('BitstringStatusListEntry');
	expect(jwtCredential.credentialStatus.statusPurpose).toBe(credentialData.credentialStatus.statusPurpose);
	expect(jwtCredential.credentialStatus).toHaveProperty('statusListIndex');
	expect(jwtCredential.credentialStatus).toHaveProperty('statusListCredential');
});

test(" Verify a credential's status", async ({ request }) => {
	const response = await request.post(`/credential/verify?verifyStatus=true`, {
		data: JSON.stringify({
			credential: jwtCredential,
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

test(' Suspend and Verify a credential status after suspension', async ({ request }) => {
	const response = await request.post(`/credential/suspend?publish=true&listType=BitstringStatusList`, {
		data: JSON.stringify({
			credential: jwtCredential,
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

	const verificationResponse = await request.post(`/credential/verify?verifyStatus=true`, {
		data: JSON.stringify({
			credential: jwtCredential,
		}),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const verificationResult = await verificationResponse.json();
	expect(verificationResponse).toBeOK();
	expect(verificationResponse.status()).toBe(StatusCodes.OK);
	expect(verificationResult.verified).toBe(true);
	expect(verificationResult.valid).toBe(false);
	expect(verificationResult.status).toBe(2);
	expect(verificationResult.message).toBe('suspended');
});

test(' Reinstate and Verify a credential status', async ({ request }) => {
	const response = await request.post(`/credential/reinstate?publish=true&listType=BitstringStatusList`, {
		data: JSON.stringify({
			credential: jwtCredential,
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

	const verificationResponse = await request.post(`/credential/verify?verifyStatus=true`, {
		data: JSON.stringify({
			credential: jwtCredential,
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

test(' Revoke and Verify a credential status', async ({ request }) => {
	const response = await request.post(`/credential/revoke?publish=true&listType=BitstringStatusList`, {
		data: JSON.stringify({
			credential: jwtCredential,
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

	const verificationResponse = await request.post(`/credential/verify?verifyStatus=true`, {
		data: JSON.stringify({
			credential: jwtCredential,
		}),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const verificationResult = await verificationResponse.json();
	expect(verificationResponse).toBeOK();
	expect(verificationResponse.status()).toBe(StatusCodes.OK);
	expect(verificationResult.verified).toBe(true);
	expect(verificationResult.valid).toBe(false);
	expect(verificationResult.status).toBe(1);
	expect(verificationResult.message).toBe('revoked');
});
