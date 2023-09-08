import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import { VALID_CREDENTIAL, VALID_JWT_TOKEN } from '../../constants';
import { StatusCodes } from 'http-status-codes';

test('[Positive] It can verify credential with a valid JWT body', async ({ request }) => {
    const response = await request.post('/credential/verify', {
        data: { credential: VALID_JWT_TOKEN }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    const body = await response.json();
    const expected = JSON.parse(
        fs.readFileSync('./tests/unauthorized/payloads/credential-verify/verify-jwt.json', 'utf-8')
    );

    expect(body).toStrictEqual(expected);
});

test('[Positive] It can verify credential with a valid credential body', async ({ request }) => {
    const response = await request.post('/credential/verify', {
        data: { credential: VALID_CREDENTIAL }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    const body = await response.json();
    const expected = JSON.parse(
        fs.readFileSync('./tests/unauthorized/payloads/credential-verify/verify-credential.json', 'utf-8')
    );

    expect(body).toStrictEqual(expected);
});


test('[Positive] It can verify credential with a valid JWT body and verifyStatus=true query parameter', async ({ request }) => {
    const response = await request.post('/credential/verify?verifyStatus=true', {
        data: { credential: VALID_JWT_TOKEN }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync(
        './tests/unauthorized/payloads/credential-verify/verify-jwt-status.json', 'utf-8')
    );

    expect(body).toStrictEqual(expected);
});

test('[Positive] It can verify credential with a valid credential body and verifyStatus=true query parameter', async ({ request }) => {
    const response = await request.post('/credential/verify?verifyStatus=true', {
        data: { credential: VALID_CREDENTIAL }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    const body = await response.json();
    const expected = JSON.parse(
        fs.readFileSync('./tests/unauthorized/payloads/credential-verify/verify-credential-status.json', 'utf-8')
    );

    expect(body).toStrictEqual(expected);
});


test('[Positive] It can verify credential with a valid JWT body and fetchRemoteContexts=true query parameter', async ({ request }) => {
    const response = await request.post('/credential/verify?fetchRemoteContexts=true', {
        data: { credential: VALID_JWT_TOKEN }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    const body = await response.json();
    const expected = JSON.parse(
        fs.readFileSync('./tests/unauthorized/payloads/credential-verify/verify-jwt.json', 'utf-8')
    );

    expect(body).toStrictEqual(expected);
});

test('[Positive] It can verify credential with a valid credential body and fetchRemoteContexts=true query parameter', async ({ request }) => {
    const response = await request.post('/credential/verify?fetchRemoteContexts=true', {
        data: { credential: VALID_CREDENTIAL }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    const body = await response.json();
    const expected = JSON.parse(
        fs.readFileSync('./tests/unauthorized/payloads/credential-verify/verify-credential.json', 'utf-8')
    );

    expect(body).toStrictEqual(expected);
});

test('[Positive] It can verify credential with a valid JWT body, verifyStatus=true, and fetchRemoteContexts=true query parameter', async ({ request }) => {
    const response = await request.post('/credential/verify?verifyStatus=true&fetchRemoteContexts=true', {
        data: { credential: VALID_JWT_TOKEN }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync(
        './tests/unauthorized/payloads/credential-verify/verify-jwt-status.json', 'utf-8')
    );

    expect(body).toStrictEqual(expected);
});


test('[Positive] It can verify credential with a valid credential body, verifyStatus=true, and fetchRemoteContexts=true query parameter', async ({ request }) => {
    const response = await request.post('/credential/verify?verifyStatus=true&fetchRemoteContexts=true', {
        data: { credential: VALID_CREDENTIAL }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    const body = await response.json();
    const expected = JSON.parse(
        fs.readFileSync('./tests/unauthorized/payloads/credential-verify/verify-credential-status.json', 'utf-8')
    );

    expect(body).toStrictEqual(expected);
});
