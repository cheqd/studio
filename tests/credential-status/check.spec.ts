import {
    DEFAULT_TESTNET_DID,
    CONTENT_TYPE,
    NOT_EXISTENT_TESTNET_DID,
    NOT_EXISTENT_STATUS_LIST_NAME,
    DEFAULT_STATUS_LIST_UNENCRYPTED_NAME,
    STORAGE_STATE_AUTHENTICATED
} from '../constants';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';


test.use({ storageState: STORAGE_STATE_AUTHENTICATED });

test('[Positive] It can check an unencrypted status-list with an existent body and statusPurpose=revocation parameter', async ({ request }) => {
    const response = await request.post('/credential-status/check?statusPurpose=revocation', {
        data: {
            did: DEFAULT_TESTNET_DID,
            index: 10,
            statusListName: DEFAULT_STATUS_LIST_UNENCRYPTED_NAME,
        },
        headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
    });

    expect(response).toBeOK();
    
    const body = await response.json();
    expect(body.revoked).toBe(false);
});

test('[Positive] It can check an unencrypted status-list with an existent body and statusPurpose=suspension parameter', async ({ request }) => {
    const response = await request.post('/credential-status/check?statusPurpose=suspension', {
        data: {
            did: DEFAULT_TESTNET_DID,
            index: 10,
            statusListName: DEFAULT_STATUS_LIST_UNENCRYPTED_NAME,
        },
        headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
    });

    expect(response).toBeOK();
    
    const body = await response.json();
    expect(body.suspended).toBe(false);
});

test('[Negative] It cannot check credential-status with not existent DID', async ({ request }) => {
    const response = await request.post('/credential-status/check?statusPurpose=revocation', {
        data: {
            did: NOT_EXISTENT_TESTNET_DID,
            index: 10,
            statusListName: DEFAULT_STATUS_LIST_UNENCRYPTED_NAME,
        },
        headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
    });

    expect(response).not.toBeOK();
    expect(response.status()).toBe(StatusCodes.NOT_FOUND);

    const body = await response.json();
    expect(body.error).toBe(`check: error: status list '${DEFAULT_STATUS_LIST_UNENCRYPTED_NAME}' not found`);
});

test('[Negative] It cannot check credential-status with an existent DID and not existent statusListName', async ({ request }) => {
    const response = await request.post('/credential-status/check?statusPurpose=revocation', {
        data: {
            did: DEFAULT_TESTNET_DID,
            index: 10,
            statusListName: NOT_EXISTENT_STATUS_LIST_NAME,
        },
        headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
    });

    expect(response).not.toBeOK();
    expect(response.status()).toBe(StatusCodes.NOT_FOUND);

    const body = await response.json();
    expect(body.error).toBe(`check: error: status list '${NOT_EXISTENT_STATUS_LIST_NAME}' not found`);
});
