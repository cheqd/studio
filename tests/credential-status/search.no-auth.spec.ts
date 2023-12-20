import {
    DEFAULT_TESTNET_DID,
    INVALID_DID,
    NOT_EXISTENT_TESTNET_DID,
    NOT_EXISTENT_STATUS_LIST_NAME,
    STORAGE_STATE_UNAUTHENTICATED,
    DEFAULT_STATUS_LIST_UNENCRYPTED_NAME,
    DEFAULT_TESTNET_DID_IDENTIFIER
} from '../constants';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';


test.use({ storageState: STORAGE_STATE_UNAUTHENTICATED });

test('[Positive] It can search credential-status with existent DID, statusListName, and statusPurpose=revocation', async ({ request }) => {
    const response = await request.get(
        '/credential-status/search?' +
        `did=${DEFAULT_TESTNET_DID}&` +
        'statusPurpose=revocation&' +
        `statusListName=${DEFAULT_STATUS_LIST_UNENCRYPTED_NAME}`
    );
    expect(response).toBeOK();
    const body = await response.json();

    expect(body.found).toBe(true);
    expect(body.resource).not.toBeNull();
    expect(body.resourceMetadata).not.toBeNull();
    expect(body.resource.StatusList2021.statusPurpose).toBe("revocation");
    expect(body.resource.metadata.encrypted).toBe(false);
    expect(body.resourceMetadata.resourceCollectionId).toBe(DEFAULT_TESTNET_DID_IDENTIFIER);
    expect(body.resourceMetadata.resourceName).toBe(DEFAULT_STATUS_LIST_UNENCRYPTED_NAME);
});

test('[Positive] It can search credential-status with existent DID, statusListName, and statusPurpose=suspension', async ({ request }) => {
    const response = await request.get(
        '/credential-status/search?' +
        `did=${DEFAULT_TESTNET_DID}&` +
        'statusPurpose=suspension&' +
        `statusListName=${DEFAULT_STATUS_LIST_UNENCRYPTED_NAME}`,
    );
    expect(response).toBeOK();
    const body = await response.json();
    
    expect(body.found).toBe(true);
    expect(body.resource).not.toBeNull();
    expect(body.resourceMetadata).not.toBeNull();
    expect(body.resource.StatusList2021.statusPurpose).toBe("suspension");
    expect(body.resource.metadata.encrypted).toBe(false);
    expect(body.resourceMetadata.resourceCollectionId).toBe(DEFAULT_TESTNET_DID_IDENTIFIER);
    expect(body.resourceMetadata.resourceName).toBe(DEFAULT_STATUS_LIST_UNENCRYPTED_NAME);
});

test('[Negative] It cannot search credential-status with not existent DID', async ({ request }) => {
    const response = await request.get(
        '/credential-status/search?' +
        `did=${NOT_EXISTENT_TESTNET_DID}&` +
        'statusPurpose=revocation&' +
        `statusListName=${DEFAULT_STATUS_LIST_UNENCRYPTED_NAME}`
    );
    expect(response.status()).toBe(StatusCodes.NOT_FOUND);
    const body = await response.json();

    expect(body.error).toBe(`search: error: status list '${DEFAULT_STATUS_LIST_UNENCRYPTED_NAME}' not found`);
});

test('[Negative] It cannot search credential-status with an invalid DID', async ({ request }) => {
    const response = await request.get(
        '/credential-status/search?' +
        `did=${INVALID_DID}&` +
        'statusPurpose=revocation&' +
        `statusListName=${DEFAULT_STATUS_LIST_UNENCRYPTED_NAME}`
    );
    expect(response.status()).toBe(StatusCodes.BAD_REQUEST);
    const body = await response.json();

    expect(body.error).toBe("Invalid format of DID. Expected to start with did:<method>");
});

test('[Negative] It cannot search credential-status with an existent DID an not existed statusListName', async ({ request }) => {
    const response = await request.get(
        '/credential-status/search?' +
        `did=${DEFAULT_TESTNET_DID}&` +
        'statusPurpose=revocation&' +
        `statusListName=${NOT_EXISTENT_STATUS_LIST_NAME}`
    );
    expect(response.status()).toBe(StatusCodes.NOT_FOUND);
    const body = await response.json();

    expect(body.error).toBe(`search: error: status list '${NOT_EXISTENT_STATUS_LIST_NAME}' not found`);
});
