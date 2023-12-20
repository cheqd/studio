import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import { DEFAULT_DOES_NOT_HAVE_PERMISSIONS, DEFAULT_MAINNET_DID, STORAGE_STATE_AUTHENTICATED } from '../constants';

test.use({ storageState: STORAGE_STATE_AUTHENTICATED });

test('[Negative] It cannot deactivated DID in mainnet network for user with testnet role', async ({ request }) => {
	const response = await request.post(`/did/deactivate/${DEFAULT_MAINNET_DID}`);
	expect(response).not.toBeOK();
	expect(response.status()).toBe(StatusCodes.FORBIDDEN);
	expect(await response.text()).toEqual(expect.stringContaining(DEFAULT_DOES_NOT_HAVE_PERMISSIONS));
});
