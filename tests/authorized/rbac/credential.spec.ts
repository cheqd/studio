import { test } from '../../fixtures.js';
import { expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import { DEFAULT_DOES_NOT_HAVE_PERMISSIONS} from '../../constants.js';
import * as fs from 'fs';

test.use({ storageState: 'playwright/.auth/user.json' });

const PAYLOADS_BASE_PATH="./tests/authorized/payloads/rbac/credential";

test(' Issue credential for user with testnet role but network is mainnet', async ({ request }) => {
    const response = await request.post(
        `/credential/issue`, 
        {
            data: JSON.parse(fs.readFileSync(`${PAYLOADS_BASE_PATH}/credential-issue-without-permissions.json`, 'utf-8')),
            headers: {
                "Content-Type": "application/json",
            },
        });
    expect(response).not.toBeOK();
    expect(response.status()).toBe(StatusCodes.FORBIDDEN);
    expect(await response.text()).toEqual(expect.stringContaining(DEFAULT_DOES_NOT_HAVE_PERMISSIONS));
});

test(' Revoke credential for user with testnet role but network is mainnet', async ({ request }) => {
    const response = await request.post(
        `/credential/revoke`, 
        {
            data: JSON.parse(fs.readFileSync(`${PAYLOADS_BASE_PATH}/credential-revoke-without-permissions.json`, 'utf-8')),
            headers: {
                "Content-Type": "application/json",
            },
        });
    expect(response).not.toBeOK();
    expect(response.status()).toBe(StatusCodes.FORBIDDEN);
    expect(await response.text()).toEqual(expect.stringContaining(DEFAULT_DOES_NOT_HAVE_PERMISSIONS));
});

test(' Suspend credential for user with testnet role but network is mainnet', async ({ request }) => {
    const response = await request.post(
        `/credential/suspend`, 
        {
            data: JSON.parse(fs.readFileSync(`${PAYLOADS_BASE_PATH}/credential-suspend-without-permissions.json`, 'utf-8')),
            headers: {
                "Content-Type": "application/json",
            },
        });
    expect(response).not.toBeOK();
    expect(response.status()).toBe(StatusCodes.FORBIDDEN);
    expect(await response.text()).toEqual(expect.stringContaining(DEFAULT_DOES_NOT_HAVE_PERMISSIONS));
});

test(' Reinstate credential for user with testnet role but network is mainnet', async ({ request }) => {
    const response = await request.post(
        `/credential/reinstate`, 
        {
            data: JSON.parse(fs.readFileSync(`${PAYLOADS_BASE_PATH}/credential-reinstate-without-permissions.json`, 'utf-8')),
            headers: {
                "Content-Type": "application/json",
            },
        });
    expect(response).not.toBeOK();
    expect(response.status()).toBe(StatusCodes.FORBIDDEN);
    expect(await response.text()).toEqual(expect.stringContaining(DEFAULT_DOES_NOT_HAVE_PERMISSIONS));
});
