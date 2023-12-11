import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import * as fs from 'fs';
import { CheqdNetwork, VerificationMethods } from '@cheqd/sdk';
import { ID_TYPE } from '../constants';

test.use({ storageState: 'playwright/.auth/user.json' });

const PAYLOADS_BASE_PATH = './tests/payloads/credential';

let issuerDid: string;

test('Create issuer Did', async ({ request }) => {
	// send request to create DID
	let response = await request.post(`/did/create`, {
		data:
			`network=${CheqdNetwork.Testnet}&identifierFormatType=${ID_TYPE.BASE58BTC}&` +
			`verificationMethodType=${VerificationMethods.Ed255192018}`,
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
	});
	issuerDid = (await response.json()).did;
	console.log(`issuerDid: ${issuerDid}`);
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
});

test(' Issue a jwt credential', async ({ request }) => {
	const credentialData = JSON.parse(fs.readFileSync(`${PAYLOADS_BASE_PATH}/credential-issue-jwt.json`, 'utf-8'));
	credentialData.issuerDid = issuerDid;
	const response = await request.post(`/credential/issue`, {
		data: credentialData,
		headers: {
			'Content-Type': 'application/json',
		},
	});
	console.log(await response.json());
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
});

test(' Issue a jsonLD credential', async ({ request }) => {
	const credentialData = JSON.parse(fs.readFileSync(`${PAYLOADS_BASE_PATH}/credential-issue-jwt.json`, 'utf-8'));
	credentialData.issuerDid = issuerDid;
	const response = await request.post(`/credential/issue`, {
		data: JSON.parse(fs.readFileSync(`${PAYLOADS_BASE_PATH}/credential-issue-jsonld.json`, 'utf-8')),
		headers: {
			'Content-Type': 'application/json',
		},
	});
	console.log(await response.json());
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
});
