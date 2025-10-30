import {
	DEFAULT_TESTNET_DID,
	CONTENT_TYPE,
	NOT_EXISTENT_TESTNET_DID,
	NOT_EXISTENT_STATUS_LIST_NAME,
	DEFAULT_STATUS_LIST_UNENCRYPTED_NAME,
	STORAGE_STATE_AUTHENTICATED,
	BITSTRING_STATUS_LIST_UNENCRYPTED_DID,
	BITSTRING_STATUS_LIST_UNENCRYPTED_NAME,
} from '../../constants';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';

test.use({ storageState: STORAGE_STATE_AUTHENTICATED });

test('[Positive] It can check an unencrypted status-list with an existent body and statusPurpose=revocation parameter', async ({
	request,
}) => {
	const response = await request.post('/credential-status/check?statusPurpose=revocation&listType=StatusList2021', {
		data: {
			did: DEFAULT_TESTNET_DID,
			index: 10,
			statusListName: DEFAULT_STATUS_LIST_UNENCRYPTED_NAME,
		},
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON },
	});

	expect(response).toBeOK();

	const body = await response.json();
	expect(body.revoked).toBe(false);
});

test('[Positive] It can check an unencrypted Bitstring status-list with an existent body', async ({ request }) => {
	const response = await request.post('/credential-status/check?statusPurpose=message&listType=BitstringStatusList', {
		data: {
			did: BITSTRING_STATUS_LIST_UNENCRYPTED_DID,
			index: 48782,
			statusListName: BITSTRING_STATUS_LIST_UNENCRYPTED_NAME,
			statusListCredential:
				'https://resolver.cheqd.net/1.0/identifiers/' +
				BITSTRING_STATUS_LIST_UNENCRYPTED_DID +
				'?resourceName=' +
				BITSTRING_STATUS_LIST_UNENCRYPTED_NAME +
				'&resourceType=BitstringStatusListCredential',
			statusSize: 2,
			statusMessage: [
				{
					status: '0x0',
					message: 'valid',
				},
				{
					status: '0x1',
					message: 'revoked',
				},
				{
					status: '0x2',
					message: 'suspended',
				},
				{
					status: '0x3',
					message: 'unknown',
				},
			],
		},
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON },
	});

	expect(response).toBeOK();

	const body = await response.json();
	expect(body.valid).toBe(true);
	expect(body.status).toBe(0); // valid
	expect(body.purpose).toBe('message');
});

test('[Positive] It can check an unencrypted status-list with an existent body and statusPurpose=suspension parameter', async ({
	request,
}) => {
	const response = await request.post('/credential-status/check?statusPurpose=suspension&listType=StatusList2021', {
		data: {
			did: DEFAULT_TESTNET_DID,
			index: 10,
			statusListName: DEFAULT_STATUS_LIST_UNENCRYPTED_NAME,
		},
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON },
	});

	expect(response).toBeOK();

	const body = await response.json();
	expect(body.suspended).toBe(false);
});

test('[Negative] It cannot check credential-status with not existent DID', async ({ request }) => {
	const response = await request.post('/credential-status/check?statusPurpose=revocation&listType=StatusList2021', {
		data: {
			did: NOT_EXISTENT_TESTNET_DID,
			index: 10,
			statusListName: DEFAULT_STATUS_LIST_UNENCRYPTED_NAME,
		},
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON },
	});

	expect(response).not.toBeOK();
	expect(response.status()).toBe(StatusCodes.NOT_FOUND);

	const body = await response.json();
	expect(body.error).toBe(`check: error: status list '${DEFAULT_STATUS_LIST_UNENCRYPTED_NAME}' not found`);
});

test('[Negative] It cannot check credential-status with an existent DID and not existent statusListName', async ({
	request,
}) => {
	const response = await request.post('/credential-status/check?statusPurpose=revocation&listType=StatusList2021', {
		data: {
			did: DEFAULT_TESTNET_DID,
			index: 10,
			statusListName: NOT_EXISTENT_STATUS_LIST_NAME,
		},
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON },
	});

	expect(response).not.toBeOK();
	expect(response.status()).toBe(StatusCodes.NOT_FOUND);

	const body = await response.json();
	expect(body.error).toBe(`check: error: status list '${NOT_EXISTENT_STATUS_LIST_NAME}' not found`);
});
