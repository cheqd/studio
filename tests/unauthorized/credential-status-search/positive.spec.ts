import * as fs from 'fs';
import { TESTNET_DID } from '../../constants';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';

test('[Positive] It can search credential-status with existent DID, statusListName, and statusPurpose=revocation', async ({ request }) => {
    const response = await request.get(
        '/credential-status/search?' +
        `did=${TESTNET_DID}&` +
        'statusPurpose=revocation&' + 
        'statusListName=cheqd-employee-credentials'
    );
    expect(response.status()).toBe(StatusCodes.OK);

    const body = await response.json();
    const expected = JSON.parse(
        fs.readFileSync('./tests/unauthorized/payloads/credential-status-search/list-revocation.json', 'utf-8')
    );

    expect(body).toStrictEqual(expected);
});

test('[Positive] It can search credential-status with existent DID, statusListName, and statusPurpose=suspension', async ({ request }) => {
    const response = await request.get(
        '/credential-status/search?' +
        `did=${TESTNET_DID}&` +
        'statusPurpose=suspension&' + 
        'statusListName=cheqd-employee-credentials',
    );
    expect(response.status()).toBe(StatusCodes.OK);

    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync(
        './tests/unauthorized/payloads/credential-status-search/list-suspension.json', 'utf-8')
    );

    expect(body).toStrictEqual(expected);
});
