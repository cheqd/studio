import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import * as fs from 'fs';

test.use({ storageState: 'playwright/.auth/user.json' });

const PAYLOADS_BASE_PATH = './tests/payloads/credential';

let issuerDid: string;

test(' Issue a jwt credential', async ({ request }) => {
	const credentialData = JSON.parse(fs.readFileSync(`${PAYLOADS_BASE_PATH}/credential-issue-jwt.json`, 'utf-8'));
	const response = await request.post(`/credential/issue`, {
		data: JSON.stringify(credentialData),
		headers: {
			'Content-Type': 'application/json',
		},
	});
	const credential = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(credential.proof.type).toBe('JwtProof2020');
});

test(' Issue a jsonLD credential', async ({ request }) => {
	const credentialData = JSON.parse(fs.readFileSync(`${PAYLOADS_BASE_PATH}/credential-issue-jsonld.json`, 'utf-8'));
	const response = await request.post(`/credential/issue`, {
		data: JSON.stringify(credentialData),
		headers: {
			'Content-Type': 'application/json',
		},
	});
	const credential = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(credential.proof.type).toBe('Ed25519Signature2018');
});
