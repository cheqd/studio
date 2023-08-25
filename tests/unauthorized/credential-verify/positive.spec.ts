import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import { VALID_JWT_TOKEN } from '../constants';

test('/credential/verify', async ({ request }) => {
    const response = await request.post('/credential/verify', {
        data: {
            credential: VALID_JWT_TOKEN
        }
    });
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync('./tests/unauthorized/payloads/credential-verify/credential.json', 'utf-8'));

    expect(body).toStrictEqual(expected);
})
