import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import { TESTNET_DID_WITH_CREDENTIAL_STATUS_LIST } from '../constants';

test('/credential-status/check', async ({ request }) => {
    const response = await request.post('/credential-status/check?statusPurpose=revocation&encrypted=false', {
        data: {
            did: TESTNET_DID_WITH_CREDENTIAL_STATUS_LIST,
            index: 10,
            statusListName: "employee-credentials",
        }
    });
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync('./tests/unauthorized/payloads/credential-status-check/status.json', 'utf-8'));

    expect(body).toStrictEqual(expected);
})
