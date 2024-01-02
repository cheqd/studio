import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import { CONTENT_TYPE, PAYLOADS_PATH } from '../constants';

test.use({ storageState: 'playwright/.auth/user.json' });

for (const presentationType of ['jwt', 'object']) {
	for (const verifyStatus of [true, false]) {
		test(`[Positive] It should return verify: True. 
        Presentation format is ${presentationType}. 
        Encrypted statusList2021. 
        VerifyStatus: ${verifyStatus}, 
        makeFeePayments: true`, async ({ request }) => {
			const verifyRequest = JSON.parse(
				fs.readFileSync(
					`${PAYLOADS_PATH.PRESENTATION}/verify-positive-${presentationType}-encrypted.json`,
					'utf-8'
				)
			);
			verifyRequest.makeFeePayment = true;
			const response = await request.post(
				`/presentation/verify?verifyStatus=${verifyStatus}&fetchRemoteContexts=false&allowDeactivatedDid=false`,
				{
					data: verifyRequest,
					headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON },
				}
			);
			expect(response).toBeOK();
			expect(await response.json()).toEqual(
				expect.objectContaining({
					verified: true,
				})
			);
		});
	}
}

for (const presentationType of ['jwt', 'object']) {
	for (const verifyStatus of [true, false]) {
		for (const makeFeePayments of [true, false]) {
			test(`[Positive] It should return verify: True. 
            Presenation format is ${presentationType}. 
            Uncrypted statusList2021. 
            VerifyStatus: ${verifyStatus}, 
            makeFeePayments: ${makeFeePayments}`, async ({ request }) => {
				const verifyRequest = JSON.parse(
					fs.readFileSync(
						`${PAYLOADS_PATH.PRESENTATION}/verify-positive-${presentationType}-unencrypted.json`,
						'utf-8'
					)
				);
				verifyRequest.makeFeePayments = makeFeePayments;
				const response = await request.post(
					`/presentation/verify?verifyStatus=${verifyStatus}&fetchRemoteContexts=false&allowDeactivatedDid=false`,
					{
						data: verifyRequest,
						headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON },
					}
				);
				expect(response).toBeOK();
				expect(await response.json()).toEqual(
					expect.objectContaining({
						verified: true,
					})
				);
			});
		}
	}
}

for (const presentationType of ['jwt', 'object']) {
	for (const verifyStatus of [true, false]) {
		test(`[Positive] It should return verify: True. 
        Presenation format is ${presentationType}. 
        Encrypted and Unencrypted statusList2021. 
        VerifyStatus: ${verifyStatus}}`, async ({ request }) => {
			const verifyRequest = JSON.parse(
				fs.readFileSync(
					`${PAYLOADS_PATH.PRESENTATION}/verify-positive-${presentationType}-un-and-encrypted.json`,
					'utf-8'
				)
			);
			const response = await request.post(
				`/presentation/verify?verifyStatus=${verifyStatus}&fetchRemoteContexts=false&allowDeactivatedDid=false`,
				{
					data: verifyRequest,
					headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON },
				}
			);
			expect(response).toBeOK();
			expect(await response.json()).toEqual(
				expect.objectContaining({
					verified: true,
				})
			);
		});
	}
}
