import type { VerifiableCredential } from '@veramo/core';
import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import { CONTENT_TYPE, PAYLOADS_PATH } from '../../constants';

test.use({ storageState: 'playwright/.auth/user.json' });

let jwtCredential: VerifiableCredential;

test(' Issue an Accreditation with revocation statuslist', async ({ request }) => {
	const payload = JSON.parse(
		fs.readFileSync(`${PAYLOADS_PATH.ACCREDITATION}/authorize-jwt-revocation.json`, 'utf-8')
	);
	const response = await request.post(`/trust-registry/accreditation/issue?accreditationType=authorize`, {
		data: JSON.stringify(payload),
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
		payload.issuerDid
	);
	expect(jwtCredential.type).toContain('VerifiableCredential');
	expect(jwtCredential.credentialSubject.id).toBe(payload.subjectDid);
	expect(jwtCredential.credentialStatus).toMatchObject({
		type: 'StatusList2021Entry',
		statusPurpose: 'revocation',
	});
	expect(jwtCredential.credentialStatus).toHaveProperty('statusListIndex');
	expect(jwtCredential.credentialStatus).toHaveProperty('id');
});

test(" Verify a Accreditation's revocation status", async ({ request }) => {
	const response = await request.post(`/trust-registry/accreditation/verify?verifyStatus=true`, {
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
	expect(result.revoked).toBe(false);
});

test(' Verify a Accreditation status after revocation', async ({ request }) => {
	const response = await request.post(`/trust-registry/accreditation/revoke?publish=true`, {
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
	expect(result.revoked).toBe(true);
	expect(result.published).toBe(true);

	const verificationResponse = await request.post(`/trust-registry/accreditation/verify?verifyStatus=true`, {
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
	expect(verificationResult.revoked).toBe(true);
});
