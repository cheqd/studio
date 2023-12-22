import {
	CONTENT_TYPE,
	PAYLOADS_PATH,
	DEFAULT_MAINNET_DID,
	STORAGE_STATE_AUTHENTICATED,
	DEFAULT_DOES_NOT_HAVE_PERMISSIONS,
} from '../constants';
import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';

test.use({ storageState: STORAGE_STATE_AUTHENTICATED });

test('[Negative] It cannot create resource in mainnet network for user with testnet role', async ({ request }) => {
	const response = await request.post(`/resource/create/${DEFAULT_MAINNET_DID}`, {
		data: JSON.parse(fs.readFileSync(`${PAYLOADS_PATH.RESOURCE}/create-without-permissions.json`, 'utf-8')),
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON },
	});
	expect(response).not.toBeOK();
	expect(response.status()).toBe(StatusCodes.FORBIDDEN);
	expect(await response.text()).toEqual(expect.stringContaining(DEFAULT_DOES_NOT_HAVE_PERMISSIONS));
});
