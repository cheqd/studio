import * as fs from 'fs';
import { TESTNET_DID } from '../../constants';
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
    const expected = JSON.parse(fs.readFileSync(
        './tests/unauthorized/payloads/credential-status-check/status-revocation.json', 'utf-8')
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
    const expected = JSON.parse(fs.readFileSync(
        './tests/unauthorized/payloads/credential-status-check/status-suspension.json', 'utf-8')
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
//         fs.readFileSync('./tests/unauthorized/payloads/credential-status-check/status-suspension.json', 'utf-8')
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
//         fs.readFileSync('./tests/unauthorized/payloads/credential-status-check/status-suspension.json', 'utf-8')
//     );

//     expect(body).toStrictEqual(expected);
// });
