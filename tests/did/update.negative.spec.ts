import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import { DEFAULT_DOES_NOT_HAVE_PERMISSIONS } from '../constants';

const PAYLOADS_BASE_PATH = './tests/payloads/did';

test.use({ storageState: 'playwright/.auth/user.json' });

test('[Negative] It cannot update DID in mainnet network for user with testnet role', async ({ request }) => {
    const response = await request.post(`/did/update`, {
        data: JSON.parse(fs.readFileSync(`${PAYLOADS_BASE_PATH}/did-update-without-permissions.json`, 'utf-8')),
        headers: {
            'Content-Type': 'application/json',
        },
    });
    expect(response).not.toBeOK();
    expect(response.status()).toBe(StatusCodes.FORBIDDEN);
    expect(await response.text()).toEqual(expect.stringContaining(DEFAULT_DOES_NOT_HAVE_PERMISSIONS));
});
