import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import { NOT_EXISTENT_STATUS_LIST_NAME, NOT_EXISTENT_TESTNET_DID, TESTNET_DID } from '../../constants';

test('[Negative] It cannot check credential-status with not existent DID', async ({ request }) => {
    const response = await request.post('/credential-status/check?statusPurpose=revocation', {
        data: {
            did: NOT_EXISTENT_TESTNET_DID,
            index: 10,
            statusListName: "cheqd-employee-credentials",
        }
    });
    expect(response.status()).toBe(StatusCodes.NOT_FOUND);

    const body = await response.json();
    const expected = {
        checked: false,
        error: "check: error: status list 'cheqd-employee-credentials' not found"
    };

    expect(body).toStrictEqual(expected);
});

test('[Negative] It cannot check credential-status with an existent DID and not existent statusListName', async ({ request }) => {
    const response = await request.post('/credential-status/check?statusPurpose=revocation', {
        data: {
            did: TESTNET_DID,
            index: 10,
            statusListName: NOT_EXISTENT_STATUS_LIST_NAME,
        }
    });
    expect(response.status()).toBe(StatusCodes.NOT_FOUND);

    const body = await response.json();
    const expected = {
        checked: false,
        error: `check: error: status list '${NOT_EXISTENT_STATUS_LIST_NAME}' not found`
    };

    expect(body).toStrictEqual(expected);
});
