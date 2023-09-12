import {
    CONTENT_TYPE,
    VALID_JWT_TOKEN,
    VALID_CREDENTIAL,
    INVALID_JWT_TOKEN,
    // INVALID_CREDENTIAL,
    NOT_MATCHED_CREDENTIAL_AND_JWT,
    PAYLOADS_PATH
} from '../constants';
import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';


test('[Positive] It can verify credential with a valid JWT body', async ({ request }) => {
    const response = await request.post('/credential/verify', {
        data: { credential: VALID_JWT_TOKEN },
        headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/verify-jwt.json`, 'utf-8'));

    expect(body).toStrictEqual(expected);
});

test('[Positive] It can verify credential with a valid credential body', async ({ request }) => {
    const response = await request.post('/credential/verify', {
        data: { credential: VALID_CREDENTIAL },
        headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/verify-credential.json`, 'utf-8'));

    expect(body).toStrictEqual(expected);
});


test('[Positive] It can verify credential with a valid JWT body and verifyStatus=true query parameter', async ({ request }) => {
    const response = await request.post('/credential/verify?verifyStatus=true', {
        data: { credential: VALID_JWT_TOKEN },
        headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/verify-jwt-status.json`, 'utf-8'));

    expect(body).toStrictEqual(expected);
});

test('[Positive] It can verify credential with a valid credential body and verifyStatus=true query parameter', async ({ request }) => {
    const response = await request.post('/credential/verify?verifyStatus=true', {
        data: { credential: VALID_CREDENTIAL },
        headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/verify-credential-status.json`, 'utf-8'));

    expect(body).toStrictEqual(expected);
});


test('[Positive] It can verify credential with a valid JWT body and fetchRemoteContexts=true query parameter', async ({ request }) => {
    const response = await request.post('/credential/verify?fetchRemoteContexts=true', {
        data: { credential: VALID_JWT_TOKEN },
        headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/verify-jwt.json`, 'utf-8'));

    expect(body).toStrictEqual(expected);
});

test('[Positive] It can verify credential with a valid credential body and fetchRemoteContexts=true query parameter', async ({ request }) => {
    const response = await request.post('/credential/verify?fetchRemoteContexts=true', {
        data: { credential: VALID_CREDENTIAL },
        headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/verify-credential.json`, 'utf-8'));

    expect(body).toStrictEqual(expected);
});

test('[Positive] It can verify credential with a valid JWT body, verifyStatus=true, and fetchRemoteContexts=true query parameter', async ({ request }) => {
    const response = await request.post('/credential/verify?verifyStatus=true&fetchRemoteContexts=true', {
        data: { credential: VALID_JWT_TOKEN },
        headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/verify-jwt-status.json`, 'utf-8'));

    expect(body).toStrictEqual(expected);
});


test('[Positive] It can verify credential with a valid credential body, verifyStatus=true, and fetchRemoteContexts=true query parameter', async ({ request }) => {
    const response = await request.post('/credential/verify?verifyStatus=true&fetchRemoteContexts=true', {
        data: { credential: VALID_CREDENTIAL },
        headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/verify-credential-status.json`, 'utf-8'));

    expect(body).toStrictEqual(expected);
});

test('[Negative] It cannot verify credential with an invalid credential body where credential and JWT are different', async ({ request }) => {
    const response = await request.post('/credential/verify', {
        data: { credential: NOT_MATCHED_CREDENTIAL_AND_JWT },
        headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
    });
    expect(response.status()).toBe(StatusCodes.BAD_REQUEST);

    const body = await response.json();
    const expected = {
        verified: false,
        error: {} // TODO: return an exact error instead of empty result
    };

    expect(body).toStrictEqual(expected);
});

test('[Negative] It cannot verify credential with an invalid JWT body', async ({ request }) => {
    const response = await request.post('/credential/verify', {
        data: { credential: INVALID_JWT_TOKEN },
        headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
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


// This test returns 400 when user is authenticated, but in case of when user is not authenticated it returns 500
// test('[Negative] It cannot verify credential with an invalid credential body', async ({ request }) => {
//     const response = await request.post('/credential/verify', {
//         data: { credential: INVALID_CREDENTIAL },
//         headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
//     });
//     expect(response.status()).toBe(StatusCodes.INTERNAL_SERVER_ERROR);

//     const body = await response.json();
//     const expected = {
//         authenticated: false,
//         error: "InvalidTokenError: Invalid token specified: Cannot read properties of undefined (reading 'replace')",
//         customerId: null
//     };

//     expect(body).toStrictEqual(expected);
// });
