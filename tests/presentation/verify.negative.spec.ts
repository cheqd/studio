import * as fs from 'fs';
import { StatusCodes } from 'http-status-codes';
import { test, expect } from '@playwright/test';

const PAYLOADS_BASE_PATH = './tests/payloads/presentation';
test.use({ storageState: 'playwright/.auth/user.json' });

for (const presentationType of ['jwt', 'object']) {
    for (const verifyStatus of [true]) {
        test(`[Negative] It should return verify: False. 
        Presenation format is ${presentationType}. 
        Encrypted statusList2021. 
        VerifyStatus: ${verifyStatus}, 
        makeFeePayments: false`, async ({
            request
        }) => {
            const verifyRequest = JSON.parse(fs.readFileSync(`${PAYLOADS_BASE_PATH}/verify-negative-${presentationType}-encrypted.json`, 'utf-8'));
            verifyRequest.makeFeePayment = false;
            const response = await request.post(`/presentation/verify?verifyStatus=${verifyStatus}&fetchRemoteContexts=false&allowDeactivatedDid=false`, {
                data: verifyRequest,
                headers: { 'Content-Type': 'application/json' },
            });
            expect(response).not.toBeOK();
            expect(response.status()).toBe(StatusCodes.UNAUTHORIZED);
            const body = await response.json();
            expect(body.error).toContain("check: error: unauthorised: decryption conditions are not met");
        });
    }
}

for (const presentationType of ['jwt', 'object']) {
    for (const verifyStatus of [true]) {
        test(`[Negative] Presentation with 2 credentials. One has encrypted statusList another one - no
        It should return verify: False. 
        Presenation format is ${presentationType}. 
        Encrypted and unencrypted statusList2021. 
        VerifyStatus: ${verifyStatus}, 
        makeFeePayments: false`, async ({
            request
        }) => {
            const verifyRequest = JSON.parse(fs.readFileSync(`${PAYLOADS_BASE_PATH}/verify-negative-${presentationType}-un-and-encrypted.json`, 'utf-8'));
            verifyRequest.makeFeePayment = false;
            const response = await request.post(`/presentation/verify?verifyStatus=${verifyStatus}&fetchRemoteContexts=false&allowDeactivatedDid=false`, {
                data: verifyRequest,
                headers: { 'Content-Type': 'application/json' },
            });
            expect(response).not.toBeOK();
            expect(response.status()).toBe(StatusCodes.UNAUTHORIZED);
            const body = await response.json();
            expect(body.error).toContain("check: error: unauthorised: decryption conditions are not met");
        });
    }
}
