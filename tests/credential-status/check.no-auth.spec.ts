import {
    TESTNET_DID,
    NOT_EXISTENT_TESTNET_DID,
    NOT_EXISTENT_STATUS_LIST_NAME,
    PAYLOADS_PATH
} from '../constants';
import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';

test('[Positive] It can check an unencrypted status-list with an existent body and statusPurpose=revocation parameter', async ({ request }) => {
    const response = await request.post('/credential-status/check?statusPurpose=revocation', {
        data: {
            did: TESTNET_DID,
            index: 10,
            statusListName: "cheqd-employee-credentials",
        }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    const body = await response.json();
    const expected = JSON.parse(
        fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL_STATUS}/check-status-revocation.json`, 'utf-8')
    );

    expect(body).toStrictEqual(expected);
});

test('Positive] It can check an unencrypted status-list with an existent body and statusPurpose=suspension parameter', async ({ request }) => {
    const response = await request.post('/credential-status/check?statusPurpose=suspension', {
        data: {
            did: TESTNET_DID,
            index: 10,
            statusListName: "cheqd-employee-credentials",
        }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    const body = await response.json();
    const expected = JSON.parse(
        fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL_STATUS}/check-status-suspension.json`, 'utf-8')
    );

    expect(body).toStrictEqual(expected);
});

// TODO: FIX ME
// test('[Positive] It can check an encrypted status-list with an existent body and statusPurpose=revocation parameter', async ({ request }) => {
//     const response = await request.post('/credential-status/check?statusPurpose=revocation', {
//         data: {
//             did: TESTNET_DID,
//             index: 10,
//             statusListName: "cheqd-employee-credentials-encrypted",
//         }
//     });
//     expect(response.status()).toBe(StatusCodes.OK);

//     const body = await response.json();
//     const expected = JSON.parse(
//         fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL_STATUS}/check-status-suspension.json`, 'utf-8')
//     );

//     expect(body).toStrictEqual(expected);
// });


// TODO: FIX ME
// test('[Positive] It can check an encrypted status-list with an existent body and statusPurpose=suspension parameter', async ({ request }) => {
//     const response = await request.post('/credential-status/check?statusPurpose=suspension', {
//         data: {
//             did: TESTNET_DID,
//             index: 10,
//             statusListName: "cheqd-employee-credentials-encrypted",
//         }
//     });
//     expect(response.status()).toBe(StatusCodes.OK);

//     const body = await response.json();
//     const expected = JSON.parse(
//         fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL_STATUS}/check-status-suspension.json`, 'utf-8')
//     );

//     expect(body).toStrictEqual(expected);
// });

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
