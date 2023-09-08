import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import { INVALID_CREDENTIAL, INVALID_JWT_TOKEN, NOT_MATCHED_CREDENTIAL_AND_JWT } from '../constants';

test('[Negative] It cannot verify an invalid credential body where credential and JWT are different', async ({ request }) => {
    const response = await request.post('/credential/verify', {
        data: { credential: NOT_MATCHED_CREDENTIAL_AND_JWT }
    });
    expect(response.status()).toBe(StatusCodes.BAD_REQUEST);

    const body = await response.json();
    const expected = {
        verified: false,
        error: {} // TODO: return an exact error instead of empty result
    };

    expect(body).toStrictEqual(expected);
});

test('[Negative] It cannot verify an invalid JWT body', async ({ request }) => {
    const response = await request.post('/credential/verify', {
        data: { credential: INVALID_JWT_TOKEN }
    });
    expect(response.status()).toBe(StatusCodes.INTERNAL_SERVER_ERROR);

    const body = await response.json();
    const expected = {
        authenticated: false,
        error: "InvalidTokenError: Invalid token specified: Cannot read properties of undefined (reading 'replace')",
        customerId: null
    };

    expect(body).toStrictEqual(expected);
});

test('[Negative] It cannot verify an invalid credential body', async ({ request }) => {
    const response = await request.post('/credential/verify', {
        data: { credential: INVALID_CREDENTIAL }
    });
    expect(response.status()).toBe(StatusCodes.BAD_REQUEST);

    const body = await response.json();
    const expected = {
        verified: false,
        error: {} // TODO: return an exact error instead of empty result
    };

    expect(body).toStrictEqual(expected);
});
