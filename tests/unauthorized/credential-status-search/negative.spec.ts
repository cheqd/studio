import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import { INVALID_DID, NOT_EXISTENT_STATUS_LIST_NAME, NOT_EXISTENT_TESTNET_DID, TESTNET_DID } from '../../constants';

test('[Negative] It cannot search credential-status with not existent DID', async ({ request }) => {
    const response = await request.get(
        '/credential-status/search?' +
        `did=${NOT_EXISTENT_TESTNET_DID}&` +
        'statusPurpose=revocation&' +
        'statusListName=cheqd-employee-credentials'
    );
    expect(response.status()).toBe(StatusCodes.NOT_FOUND);

    const body = await response.json();
    const expected = {
        found: false,
        error: "search: error: status list 'cheqd-employee-credentials' not found"
    };

    expect(body).toStrictEqual(expected);
});

test('[Negative] It cannot search credential-status with an invalid DID', async ({ request }) => {
    const response = await request.get(
        '/credential-status/search?' +
        `did=${INVALID_DID}&` +
        'statusPurpose=revocation&' +
        'statusListName=cheqd-employee-credentials'
    );
    expect(response.status()).toBe(StatusCodes.BAD_REQUEST);

    const body = await response.json();
    const expected = {
        error: "did: invalid format, should be did:cheqd:<namespace>:<method_specific_identifier>"
    }

    expect(body).toStrictEqual(expected);
});

test('[Negative] It cannot search credential-status with an existent DID an not existed statusListName', async ({ request }) => {
    const response = await request.get(
        '/credential-status/search?' +
        `did=${TESTNET_DID}&` +
        'statusPurpose=revocation&' +
        `statusListName=${NOT_EXISTENT_STATUS_LIST_NAME}`
    );
    expect(response.status()).toBe(StatusCodes.NOT_FOUND);

    const body = await response.json();
    const expected = {
        found: false,
        error: `search: error: status list '${NOT_EXISTENT_STATUS_LIST_NAME}' not found`
    };

    expect(body).toStrictEqual(expected);
});
