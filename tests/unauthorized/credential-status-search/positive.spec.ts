import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import { TESTNET_DID_WITH_CREDENTIAL_STATUS_LIST } from '../constants';

test('/credential-status/search with statusPurpose=revocation', async ({ request }) => {
    const response = await request.get(
        '/credential-status/search?' +
        `did=${TESTNET_DID_WITH_CREDENTIAL_STATUS_LIST}&` +
        'statusPurpose=revocation&' + 
        'statusListName=employee-credentials',
    );
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync('./tests/unauthorized/payloads/credential-status-search/list-revocation.json', 'utf-8'));

    expect(body).toStrictEqual(expected);
});

test('/credential-status/search statusPurpose=revocation', async ({ request }) => {
    const response = await request.get(
        '/credential-status/search?' +
        `did=${TESTNET_DID_WITH_CREDENTIAL_STATUS_LIST}&` +
        'statusPurpose=suspension&' + 
        'statusListName=employee-credentials',
    );
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync('./tests/unauthorized/payloads/credential-status-search/list-suspension.json', 'utf-8'));

    expect(body).toStrictEqual(expected);
});
