import { test } from '../fixtures.js';
import { expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import { DEFAULT_DOES_NOT_HAVE_PERMISSIONS } from '../constants.js';
import * as fs from 'fs';

test.use({ storageState: 'playwright/.auth/user.json' });

const PAYLOADS_BASE_PATH="./tests/authorized/payloads/rbac/credential-status";

test('Create encrypted StatusList2021 for user with testnet role but network is mainnet', async ({ request }) => {
    const response = await request.post(
        `/credential-status/create/encrypted`, 
        {
            data: JSON.parse(fs.readFileSync(`${PAYLOADS_BASE_PATH}/credential-status-create-encrypted-without-permissions.json`, 'utf-8')),
            headers: {
                "Content-Type": "application/json",
            },
        });
    expect(response).not.toBeOK();
    expect(response.status()).toBe(StatusCodes.FORBIDDEN);
    expect(await response.text()).toEqual(expect.stringContaining(DEFAULT_DOES_NOT_HAVE_PERMISSIONS));
});

test('Create unencrypted StatusList2021 for user with testnet role but network is mainnet', async ({ request }) => {
    const response = await request.post(
        `/credential-status/create/unencrypted`, 
        {
            data: JSON.parse(fs.readFileSync(`${PAYLOADS_BASE_PATH}/credential-status-create-unencrypted-without-permissions.json`, 'utf-8')),
            headers: {
                "Content-Type": "application/json",
            },
        });
    expect(response).not.toBeOK();
    expect(response.status()).toBe(StatusCodes.FORBIDDEN);
    expect(await response.text()).toEqual(expect.stringContaining(DEFAULT_DOES_NOT_HAVE_PERMISSIONS));
});

test('Update encrypted StatusList2021 for user with testnet role but network is mainnet', async ({ request }) => {
    const response = await request.post(
        `/credential-status/update/encrypted`, 
        {
            data: JSON.parse(fs.readFileSync(`${PAYLOADS_BASE_PATH}/credential-status-update-encrypted-without-permissions.json`, 'utf-8')),
            headers: {
                "Content-Type": "application/json",
            },
        });
    expect(response).not.toBeOK();
    expect(response.status()).toBe(StatusCodes.FORBIDDEN);
    expect(await response.text()).toEqual(expect.stringContaining(DEFAULT_DOES_NOT_HAVE_PERMISSIONS));
});

test('Update Unencrypted StatusList2021 for user with testnet role but network is mainnet', async ({ request }) => {
    const response = await request.post(
        `/credential-status/update/unencrypted`, 
        {
            data: JSON.parse(fs.readFileSync(`${PAYLOADS_BASE_PATH}/credential-status-update-unencrypted-without-permissions.json`, 'utf-8')),
            headers: {
                "Content-Type": "application/json",
            },
        });
    expect(response).not.toBeOK();
    expect(response.status()).toBe(StatusCodes.FORBIDDEN);
    expect(await response.text()).toEqual(expect.stringContaining(DEFAULT_DOES_NOT_HAVE_PERMISSIONS));
});
