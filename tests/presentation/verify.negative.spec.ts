// import * as fs from 'fs';
// import { StatusCodes } from 'http-status-codes';
// import { test, expect } from '@playwright/test';

// const PAYLOADS_BASE_PATH = './tests/payloads/presentation';
// test.use({ storageState: 'playwright/.auth/user.json' });

// for (const presentationType of ['jwt', 'object']) {
//     for (const verifyStatus of [true]) {
//         test(`[Positive] It should return verify: True. 
//         Presenation format is ${presentationType}. 
//         Encrypted statusList2021. 
//         VerifyStatus: ${verifyStatus}, 
//         makeFeePayments: false`, async ({
//             request
//         }) => {
//             const verifyRequest = JSON.parse(fs.readFileSync(`${PAYLOADS_BASE_PATH}/verify-negative-${presentationType}-encrypted.json`, 'utf-8'));
//             verifyRequest.makeFeePayment = false;
//             const response = await request.post(`/presentation/verify?verifyStatus=${verifyStatus}&fetchRemoteContexts=false&allowDeactivatedDid=false`, {
//                 data: verifyRequest,
//                 headers: { 'Content-Type': 'application/json' },
//             });
//             expect(response).not.toBeOK();
//             expect(response.status()).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
//             const body = await response.json();
//             const error = JSON.parse(body.error);
//             expect(error.status).toBe(StatusCodes.UNAUTHORIZED);
//             expect(error.errorCode).toBe("NodeAccessControlConditionsReturnedNotAuthorized");
//         });
//     }
// }
