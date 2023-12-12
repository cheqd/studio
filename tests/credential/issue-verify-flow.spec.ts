import type { VerifiableCredential } from '@veramo/core';

import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import * as fs from 'fs';

test.use({ storageState: 'playwright/.auth/user.json' });

const PAYLOADS_BASE_PATH = './tests/payloads/credential';

let jwtCredential: VerifiableCredential, jsonldCredential: VerifiableCredential;

test(' Issue a jwt credential', async ({ request }) => {
	const credentialData = JSON.parse(fs.readFileSync(`${PAYLOADS_BASE_PATH}/credential-issue-jwt.json`, 'utf-8'));
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

test(' Verify a jwt credential', async ({ request }) => {
	const response = await request.post(`/credential/verify`, {
		data: JSON.stringify({
			credential: jwtCredential.proof.jwt,
		}),
		headers: {
			'Content-Type': 'application/json',
		},
	});
	const result = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(result.verified).toBe(true);
});

test(' Issue a jwt credential with a deactivated DID', async ({ request }) => {
	const credentialData = JSON.parse(fs.readFileSync(`${PAYLOADS_BASE_PATH}/credential-issue-jwt.json`, 'utf-8'));
	credentialData.issuerDid = 'did:cheqd:testnet:edce6dfb-b59c-493b-a4b8-1d16a6184349';
	const response = await request.post(`/credential/issue`, {
		data: JSON.stringify(credentialData),
		headers: {
			'Content-Type': 'application/json',
		},
	});
	expect(response.status()).toBe(StatusCodes.BAD_REQUEST);
});

test(' Issue a jsonLD credential', async ({ request }) => {
	const credentialData = JSON.parse(fs.readFileSync(`${PAYLOADS_BASE_PATH}/credential-issue-jsonld.json`, 'utf-8'));
	const response = await request.post(`/credential/issue`, {
		data: JSON.stringify(credentialData),
		headers: {
			'Content-Type': 'application/json',
		},
	});
	jsonldCredential = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(jsonldCredential.proof.type).toBe('Ed25519Signature2018');
});

test(' Verify a jsonld credential', async ({ request }) => {
	const response = await request.post(`/credential/verify`, {
		data: JSON.stringify({
			credential: jsonldCredential,
			fetchRemoteContexts: true,
		}),
		headers: {
			'Content-Type': 'application/json',
		},
	});
	const result = await response.json();
	console.log(result);
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(result.verified).toBe(true);
});
