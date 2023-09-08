import { test } from '../../fixtures.js';
import { expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import { DEFAULT_DOES_NOT_HAVE_PERMISSIONS, DEFAULT_MAINNET_DID } from '../../constants.js';
import * as fs from 'fs';

const PAYLOADS_BASE_PATH="./tests/authorized/payloads/rbac/did";

// Negative tests. All of this tests should return 403 Forbidden 
// cause here the user tries to make mainnet operations with testnet role
test('Create DID for user with testnet role but network is mainnet', async ({ request }) => {
    const response = await request.post(
        `/did/create`, 
        {
            data: JSON.parse(fs.readFileSync(`${PAYLOADS_BASE_PATH}/did-create-without-permissions.json`, 'utf-8')),
            headers: {
                "Content-Type": "application/json",
            },
        })
    expect(response.ok()).toBeFalsy();
    expect(response.status()).toBe(StatusCodes.FORBIDDEN);
    expect(await response.text()).toEqual(expect.stringContaining(DEFAULT_DOES_NOT_HAVE_PERMISSIONS));
});

test('Update DID for user with testnet role but network is mainnet', async ({ request }) => {
    const response = await request.post(
        `/did/update`, 
        {
            data: JSON.parse(fs.readFileSync(`${PAYLOADS_BASE_PATH}/did-update-without-permissions.json`, 'utf-8')),
            headers: {
                "Content-Type": "application/json",
            }
        });
    expect(response.ok()).toBeFalsy();
    expect(response.status()).toBe(StatusCodes.FORBIDDEN);
    expect(await response.text()).toEqual(expect.stringContaining(DEFAULT_DOES_NOT_HAVE_PERMISSIONS));
});

test('Deactivate DID for user with testnet role but network is mainnet', async ({ request }) => {
    const response = await request.post(
        `/did/deactivate/${DEFAULT_MAINNET_DID}`, 
        {});
    expect(response.ok()).toBeFalsy();
    expect(response.status()).toBe(StatusCodes.FORBIDDEN);
    expect(await response.text()).toEqual(expect.stringContaining(DEFAULT_DOES_NOT_HAVE_PERMISSIONS));
});
