import {
    CONTENT_TYPE,
    INVALID_JWT_TOKEN,
    GENERATED_PATH,
    STORAGE_STATE_UNAUTHENTICATED
} from '../constants';
import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';

async function check_verify_response(response: any, issuer: string) {
    expect(response).toBeOK();

    const body = await response.json();
    expect(body.verified).toBe(true);
    expect(body.issuer).toBe(issuer);
    expect(body.credentialStatus).not.toBeNull();
    expect(body.credentialSubject).not.toBeNull();
}

test.use({ storageState: STORAGE_STATE_UNAUTHENTICATED });

test('[Positive] It can verify credential with a valid JWT body', async ({ request }) => {
    const json = JSON.parse(fs.readFileSync(`${GENERATED_PATH.CREDENTIAL}/valid_credential.json`, 'utf-8'));
    const response = await request.post('/credential/verify', {
        data: { credential: json.proof.jwt },
        headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
    });

    check_verify_response(response, json.issuer.id);
});

test('[Positive] It can verify credential with a valid credential body', async ({ request }) => {
    const json = JSON.parse(fs.readFileSync(`${GENERATED_PATH.CREDENTIAL}/valid_credential.json`, 'utf-8'));
    const response = await request.post('/credential/verify', {
        data: { credential: json },
        headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
    });
    
    check_verify_response(response, json.issuer.id);
});


test('[Positive] It can verify credential with a valid JWT body and verifyStatus=true query parameter', async ({ request }) => {
    const json = JSON.parse(fs.readFileSync(`${GENERATED_PATH.CREDENTIAL}/valid_credential.json`, 'utf-8'));
    const response = await request.post('/credential/verify?verifyStatus=true', {
        data: { credential: json.proof.jwt },
        headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
    });
    
    check_verify_response(response, json.issuer.id);
});

test('[Positive] It can verify credential with a valid credential body and verifyStatus=true query parameter', async ({ request }) => {
    const json = JSON.parse(fs.readFileSync(`${GENERATED_PATH.CREDENTIAL}/valid_credential.json`, 'utf-8'));
    const response = await request.post('/credential/verify?verifyStatus=true', {
        data: { credential: json.proof.jwt },
        headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
    });
    
    check_verify_response(response, json.issuer.id);
});


test('[Positive] It can verify credential with a valid JWT body and fetchRemoteContexts=true query parameter', async ({ request }) => {
    const json = JSON.parse(fs.readFileSync(`${GENERATED_PATH.CREDENTIAL}/valid_credential.json`, 'utf-8'));
    const response = await request.post('/credential/verify?fetchRemoteContexts=true', {
        data: { credential: json.proof.jwt },
        headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
    });

    check_verify_response(response, json.issuer.id);
});

test('[Positive] It can verify credential with a valid credential body and fetchRemoteContexts=true query parameter', async ({ request }) => {
    const json = JSON.parse(fs.readFileSync(`${GENERATED_PATH.CREDENTIAL}/valid_credential.json`, 'utf-8'));
    const response = await request.post('/credential/verify?fetchRemoteContexts=true', {
        data: { credential: json },
        headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
    });
    
    check_verify_response(response, json.issuer.id);
});

test('[Positive] It can verify credential with a valid JWT body, verifyStatus=true, and fetchRemoteContexts=true query parameter', async ({ request }) => {
    const json = JSON.parse(fs.readFileSync(`${GENERATED_PATH.CREDENTIAL}/valid_credential.json`, 'utf-8'));
    const response = await request.post('/credential/verify?verifyStatus=true&fetchRemoteContexts=true', {
        data: { credential: json.proof.jwt },
        headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
    });

    check_verify_response(response, json.issuer.id);
});


test('[Positive] It can verify credential with a valid credential body, verifyStatus=true, and fetchRemoteContexts=true query parameter', async ({ request }) => {
    const json = JSON.parse(fs.readFileSync(`${GENERATED_PATH.CREDENTIAL}/valid_credential.json`, 'utf-8'));
    const response = await request.post('/credential/verify?verifyStatus=true&fetchRemoteContexts=true', {
        data: { credential: json },
        headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
    });
    
    check_verify_response(response, json.issuer.id);
});

test('[Negative] It cannot verify credential with an invalid credential body where credential and JWT are different', async ({ request }) => {
    const json = JSON.parse(fs.readFileSync(`${GENERATED_PATH.CREDENTIAL}/not_valid_credential.json`, 'utf-8'));
    const response = await request.post('/credential/verify', {
        data: { credential: json },
        headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
    });
    expect(response.status()).toBe(StatusCodes.BAD_REQUEST);

    const body = await response.json();
    expect(body.verified).toBe(false);
});

test('[Negative] It cannot verify credential with an invalid JWT body', async ({ request }) => {
    const response = await request.post('/credential/verify', {
        data: { credential: INVALID_JWT_TOKEN },
        headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
    });

    expect(response.status()).toBe(StatusCodes.BAD_REQUEST);

    const body = await response.json();
    expect(body.error).toBe("An invalid JWT string");
});
