import type { VerifiableCredential } from '@veramo/core';
import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import { CONTENT_TYPE, PAYLOADS_PATH } from '../../constants';

test.use({ storageState: 'playwright/.auth/user.json' });

let didUrl: string;

test(' Issue an Accreditation with revocation statuslist', async ({ request }) => {
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
	didUrl = didUrls[0];
	expect(issueResponse).toBeOK();
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
		statusPurpose: 'revocation',
	});
	expect(accreditation.credentialStatus).toHaveProperty('statusListIndex');
	expect(accreditation.credentialStatus).toHaveProperty('id');
});

test(" Verify a Accreditation's revocation status", async ({ request }) => {
	const response = await request.post(`/trust-registry/accreditation/verify?verifyStatus=true`, {
		data: JSON.stringify({
			didUrl,
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
			didUrl,
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
			didUrl,
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
