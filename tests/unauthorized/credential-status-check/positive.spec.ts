import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import { 
    TESTNET_DID_WITH_CREDENTIAL_STATUS_LIST, 
    // TESTNET_DID_WITH_ENCRYPTED_STATUS_LIST 
} from '../constants';

test('/credential-status/check with statusPurpose=revocation', async ({ request }) => {
    const response = await request.post('/credential-status/check?statusPurpose=revocation&encrypted=false', {
        data: {
            did: TESTNET_DID_WITH_CREDENTIAL_STATUS_LIST,
            index: 10,
            statusListName: "employee-credentials",
        }
    });
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync('./tests/unauthorized/payloads/credential-status-check/status-revocation.json', 'utf-8'));

    expect(body).toStrictEqual(expected);
});

test('/credential-status/check with statusPurpose=suspension', async ({ request }) => {
    const response = await request.post('/credential-status/check?statusPurpose=suspension&encrypted=false', {
        data: {
            did: TESTNET_DID_WITH_CREDENTIAL_STATUS_LIST,
            index: 10,
            statusListName: "employee-credentials",
        }
    });
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync('./tests/unauthorized/payloads/credential-status-check/status-suspension.json', 'utf-8'));

    expect(body).toStrictEqual(expected);
});

// TODO: FIX ME
// test('/credential-status/check with statusPurpose=revocation&encrypted=true', async ({ request }) => {
//     const response = await request.post('/credential-status/check?statusPurpose=suspension&encrypted=true', {
//         data: {
//             did: TESTNET_DID_WITH_ENCRYPTED_STATUS_LIST,
//             index: 10,
//             statusListName: "cheqd-employee-credentials-encrypted",
//         }
//     });
//     expect(response.ok()).toBeTruthy();

//     const body = await response.json();
//     const expected = JSON.parse(fs.readFileSync('./tests/unauthorized/payloads/credential-status-check/status-suspension.json', 'utf-8'));

//     expect(body).toStrictEqual(expected);
// });

// TODO: FIX ME
// test('/credential-status/check with statusPurpose=suspension&encrypted=true', async ({ request }) => {
//     const response = await request.post('/credential-status/check?statusPurpose=suspension&encrypted=true', {
//         data: {
//             did: TESTNET_DID_WITH_ENCRYPTED_STATUS_LIST,
//             index: 10,
//             statusListName: "cheqd-employee-credentials-encrypted",
//         }
//     });
//     expect(response.ok()).toBeTruthy();

//     const body = await response.json();
//     const expected = JSON.parse(fs.readFileSync('./tests/unauthorized/payloads/credential-status-check/status-suspension.json', 'utf-8'));

//     expect(body).toStrictEqual(expected);
// });
