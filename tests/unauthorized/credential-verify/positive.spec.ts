import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import { VALID_CREDENTIAL, VALID_JWT_TOKEN } from '../constants';

test('/credential/verify with JWT', async ({ request }) => {
    const response = await request.post('/credential/verify', {
        data: { credential: VALID_JWT_TOKEN }
    });
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync('./tests/unauthorized/payloads/credential-verify/verify-jwt.json', 'utf-8'));

    expect(body).toStrictEqual(expected);
});

test('/credential/verify with credential', async ({ request }) => {
    const response = await request.post('/credential/verify', {
        data: { credential: VALID_CREDENTIAL }
    });
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync('./tests/unauthorized/payloads/credential-verify/verify-credential.json', 'utf-8'));

    expect(body).toStrictEqual(expected);
});


// TODO: FIX ME: https://app.clickup.com/t/6600954/DEV-3170
// test('/credential/verify with JWT and verifyStatus=true', async ({ request }) => {
//     const response = await request.post('/credential/verify?verifyStatus=true', {
//         data: { credential: VALID_JWT_TOKEN }
//     });
//     expect(response.ok()).toBeTruthy();

//     const body = await response.json();
//     const expected = JSON.parse(fs.readFileSync('./tests/unauthorized/payloads/credential-verify/verify-jwt-status.json', 'utf-8'));

//     expect(body).toStrictEqual(expected);
// });

test('/credential/verify with credential and verifyStatus=true', async ({ request }) => {
    const response = await request.post('/credential/verify?verifyStatus=true', {
        data: { credential: VALID_CREDENTIAL }
    });
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync('./tests/unauthorized/payloads/credential-verify/verify-credential-status.json', 'utf-8'));

    expect(body).toStrictEqual(expected);
});


test('/credential/verify with JWT & fetchRemoteContexts=true', async ({ request }) => {
    const response = await request.post('/credential/verify?fetchRemoteContexts=true', {
        data: { credential: VALID_JWT_TOKEN }
    });
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync('./tests/unauthorized/payloads/credential-verify/verify-jwt.json', 'utf-8'));

    expect(body).toStrictEqual(expected);
});

test('/credential/verify with credential & fetchRemoteContexts=true', async ({ request }) => {
    const response = await request.post('/credential/verify?fetchRemoteContexts=true', {
        data: { credential: VALID_CREDENTIAL }
    });
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync('./tests/unauthorized/payloads/credential-verify/verify-credential.json', 'utf-8'));

    expect(body).toStrictEqual(expected);
});

// TODO: FIX ME: https://app.clickup.com/t/6600954/DEV-3170
// test('/credential/verify with JWT & verifyStatus=true & fetchRemoteContexts=true', async ({ request }) => {
//     const response = await request.post('/credential/verify?verifyStatus=true&fetchRemoteContexts=true', {
//         data: { credential: VALID_JWT_TOKEN }
//     });
//     expect(response.ok()).toBeTruthy();

//     const body = await response.json();
//     const expected = JSON.parse(fs.readFileSync('./tests/unauthorized/payloads/credential-verify/verify-jwt-status.json', 'utf-8'));

//     expect(body).toStrictEqual(expected);
// });


test('/credential/verify with credential & verifyStatus=true & fetchRemoteContexts=true', async ({ request }) => {
    const response = await request.post('/credential/verify?verifyStatus=true&fetchRemoteContexts=true', {
        data: { credential: VALID_CREDENTIAL }
    });
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync('./tests/unauthorized/payloads/credential-verify/verify-credential-status.json', 'utf-8'));

    expect(body).toStrictEqual(expected);
});
