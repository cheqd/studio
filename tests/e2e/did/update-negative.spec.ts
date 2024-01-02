import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import { CONTENT_TYPE, DEFAULT_DOES_NOT_HAVE_PERMISSIONS, PAYLOADS_PATH } from '../constants';

test.use({ storageState: 'playwright/.auth/user.json' });

test('[Negative] It cannot update DID in mainnet network for user with testnet role', async ({ request }) => {
	const response = await request.post(`/did/update`, {
		data: JSON.parse(fs.readFileSync(`${PAYLOADS_PATH.DID}/did-update-without-permissions.json`, 'utf-8')),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	expect(response).not.toBeOK();
	expect(response.status()).toBe(StatusCodes.FORBIDDEN);
	expect(await response.text()).toEqual(expect.stringContaining(DEFAULT_DOES_NOT_HAVE_PERMISSIONS));
});
