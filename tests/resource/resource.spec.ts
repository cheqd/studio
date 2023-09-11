import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import { DEFAULT_DOES_NOT_HAVE_PERMISSIONS, DEFAULT_MAINNET_DID } from '../constants';
import * as fs from 'fs';

test.use({ storageState: 'playwright/.auth/user.json' });

const PAYLOADS_BASE_PATH="./tests/payloads/resource";

// Negative tests. All of this tests are should return 403 Forbidden 
// cause here the user tries to make mainnet operations with testnet role
test('Create Resource for user with testnet role but network is mainnet', async ({ request }) => {
    const response = await request.post(
        `/resource/create/${DEFAULT_MAINNET_DID}`, 
        {
            data: JSON.parse(fs.readFileSync(`${PAYLOADS_BASE_PATH}/resource-create-without-permissions.json`, 'utf-8')),
            headers: {
                "Content-Type": "application/json",
            },
        })
    expect(response).not.toBeOK();
    expect(response.status()).toBe(StatusCodes.FORBIDDEN);
    expect(await response.text()).toEqual(expect.stringContaining(DEFAULT_DOES_NOT_HAVE_PERMISSIONS));
});
