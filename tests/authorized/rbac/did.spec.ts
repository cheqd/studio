import { test } from '../../fixtures';
import { expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import { DEFAULT_DOES_NOT_HAVE_PERMISSIONS, DEFAULT_MAINNET_DID } from '../../constants';
import * as fs from 'fs';

const PAYLOADS_BASE_PATH="./tests/authorized/payloads/rbac/did";

// Positive tests
// test('Create DID for user with testnet role', async ({ DIDRepository }) => {
//     expect(DIDRepository.did).not.toEqual('');
// });

// test('Search DID Document', async ({ DIDRepository }) => {
//     expect(DIDRepository.did).not.toEqual({});
// });

// test('List of DID Documents', async ({ request, DIDRepository }) => {
//     const did = DIDRepository.did;
//     expect(DIDRepository.did).not.toEqual('');

//     const response = await request.get(`/did/list`);
//     expect(response.ok()).toBeTruthy();
//     const didDocs = await response.json();
//     // Expect that DIDTestnet is in list
//     expect(didDocs).toEqual(expect.arrayContaining([did]));
// });

// test('Deactivate DIDDocument', async ({ DIDRepository, request }) => {
//     const did = DIDRepository.did;
//     expect(DIDRepository.did).not.toEqual('');;

//     const response = await request.post(`/did/deactivate/${did}`);
//     if (!response.ok()) {
//         console.error(await response.text() + " For DID: " + did);
//     }
//     expect(response.ok()).toBeTruthy();

//     const didResult = await DIDRepository.resolveDid(did);
//     expect(didResult.didDocumentMetadata.deactivated).toBeTruthy();
// });



// Negative tests. All of this tests are should return 403 Forbidden 
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
