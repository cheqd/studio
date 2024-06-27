import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import { DEFAULT_DOES_NOT_HAVE_PERMISSIONS, DEFAULT_MAINNET_DID } from '../constants';
import { UnsuccessfulResponseBody } from '@cheqd/studio/src/types/shared.js';

test.use({ storageState: 'playwright/.auth/user.json' });

test('[Negative] It cannot deactivated DID in mainnet network for user with testnet role', async ({ request }) => {
	const response = await request.post(`/did/deactivate/${DEFAULT_MAINNET_DID}`, {});
	expect(response).not.toBeOK();
	expect(response.status()).toBe(StatusCodes.FORBIDDEN);
	const { error } = (await response.json()) as UnsuccessfulResponseBody;
	expect(error).toEqual(expect.stringContaining(DEFAULT_DOES_NOT_HAVE_PERMISSIONS));
});
