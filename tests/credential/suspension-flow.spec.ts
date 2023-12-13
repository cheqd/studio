import type { VerifiableCredential } from '@veramo/core';

import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import * as fs from 'fs';

test.use({ storageState: 'playwright/.auth/user.json' });

const PAYLOADS_BASE_PATH = './tests/payloads/credential';

let jwtCredential: VerifiableCredential;

test(' Issue a jwt credential with suspension statuslist', async ({ request }) => {
	const credentialData = JSON.parse(
		fs.readFileSync(`${PAYLOADS_BASE_PATH}/credential-issue-jwt-revocation.json`, 'utf-8')
	);
	credentialData.credentialStatus.statusPurpose = 'suspension';
	const response = await request.post(`/credential/issue`, {
		data: JSON.stringify(credentialData),
		headers: {
			'Content-Type': 'application/json',
		},
	});
	jwtCredential = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(jwtCredential.proof.type).toBe('JwtProof2020');
});

test(" Verify a credential's suspension status", async ({ request }) => {
	const response = await request.post(`/credential/verify?verifyStatus=true`, {
		data: JSON.stringify({
			credential: jwtCredential,
		}),
		headers: {
			'Content-Type': 'application/json',
		},
	});
	const result = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(result.verified).toBe(true);
	expect(result.suspended).toBe(false);
});

test(' Verify a credential status after suspension', async ({ request }) => {
	const response = await request.post(`/credential/suspend?publish=true`, {
		data: JSON.stringify({
			credential: jwtCredential,
		}),
		headers: {
			'Content-Type': 'application/json',
		},
	});
	const result = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(result.suspended).toBe(true);

	const verificationResponse = await request.post(`/credential/verify?verifyStatus=true`, {
		data: JSON.stringify({
			credential: jwtCredential,
		}),
		headers: {
			'Content-Type': 'application/json',
		},
	});
	const verificationResult = await response.json();
	expect(verificationResponse).toBeOK();
	expect(verificationResponse.status()).toBe(StatusCodes.OK);
	expect(verificationResult.verified).toBe(true);
	expect(result.suspended).toBe(true);
});

test(' Verify a credential status after reinstating', async ({ request }) => {
	const response = await request.post(`/credential/reinstate?publish=true`, {
		data: JSON.stringify({
			credential: jwtCredential,
		}),
		headers: {
			'Content-Type': 'application/json',
		},
	});
	const result = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(result.suspended).toBe(false);

	const verificationResponse = await request.post(`/credential/verify?verifyStatus=true`, {
		data: JSON.stringify({
			credential: jwtCredential,
		}),
		headers: {
			'Content-Type': 'application/json',
		},
	});
	const verificationResult = await response.json();
	expect(verificationResponse).toBeOK();
	expect(verificationResponse.status()).toBe(StatusCodes.OK);
	expect(verificationResult.verified).toBe(true);
	expect(result.suspended).toBe(false);
});
