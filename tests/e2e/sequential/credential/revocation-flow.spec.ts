import type { VerifiableCredential } from '@veramo/core';
import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import { CONTENT_TYPE, PAYLOADS_PATH } from '../../constants';
import { v4 } from 'uuid';
import { ResourceModule } from '@cheqd/sdk';

test.use({ storageState: 'playwright/.auth/user.json' });

let jwtCredential: VerifiableCredential;
let statusListName: string;

test('[Positive] It can create an unencrypted statusList2021 in testnet for user with testnet role', async ({
	request,
}) => {
	const payload = JSON.parse(
		fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL_STATUS}/create-unencrypted-with-permissions.json`, 'utf-8')
	);

	payload.statusListName = (payload.statusListName as string).concat(`${v4()}`);
	statusListName = payload.statusListName;
	const response = await request.post(`/credential-status/create/unencrypted?statusPurpose=revocation`, {
		data: payload,
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON },
	});
	expect(response).toBeOK();
});

test(' Issue a jwt credential with revocation statuslist', async ({ request }) => {
	const credentialData = JSON.parse(
		fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/credential-issue-jwt-revocation.json`, 'utf-8')
	);

	credentialData.credentialStatus.statusListName = statusListName;
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
	expect(jwtCredential.credentialStatus).toMatchObject({
		type: 'StatusList2021Entry',
		statusPurpose: 'revocation',
	});
	expect(jwtCredential.credentialStatus).toHaveProperty('statusListIndex');
	expect(jwtCredential.credentialStatus).toHaveProperty('id');
});

test(" Verify a credential's revocation status", async ({ request }) => {
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
	expect(result.revoked).toBe(false);
});

test(' Verify a credential status after revocation', async ({ request }) => {
	const response = await request.post(`/credential/revoke?publish=true`, {
		data: JSON.stringify({
			credential: jwtCredential,
            fee: {
                amount: [ResourceModule.fees.DefaultCreateResourceJsonFee],
                gas: '4800000',
            }
		}),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const result = await response.json();
	console.log(result);
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(result.revoked).toBe(true);
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
	expect(verificationResult.revoked).toBe(true);
});
