import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import { DEFAULT_DOES_NOT_HAVE_PERMISSIONS, PAYLOADS_PATH, STORAGE_STATE_FILE_PATH } from '../constants';

test.use({ storageState: STORAGE_STATE_FILE_PATH });

test('[Negative] It cannot update an unencrypted statusList2021 in mainnet network for user with testnet role', async ({ request }) => {
	const response = await request.post(`/credential-status/update/unencrypted`, {
		data: JSON.parse(fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL_STATUS}/update-unencrypted-without-permissions.json`, 'utf-8')),
		headers: { 'Content-Type': 'application/json' },
	});
	expect(response).not.toBeOK();
	expect(response.status()).toBe(StatusCodes.FORBIDDEN);
	expect(await response.text()).toEqual(expect.stringContaining(DEFAULT_DOES_NOT_HAVE_PERMISSIONS));
});
