import {
	CONTENT_TYPE,
	PAYLOADS_PATH,
	STORAGE_STATE_AUTHENTICATED,
	DEFAULT_DOES_NOT_HAVE_PERMISSIONS,
} from '../../constants';
import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import { UnsuccessfulResponseBody } from '@cheqd/credential-service/src/types/shared.js';

test.use({ storageState: STORAGE_STATE_AUTHENTICATED });

test('[Negative] It cannot create an unencrypted statusList2021 in mainnet network for user with testnet role', async ({
	request,
}) => {
	const response = await request.post(`/credential-status/create/unencrypted`, {
		data: JSON.parse(
			fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL_STATUS}/create-unencrypted-without-permissions.json`, 'utf-8')
		),
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON },
	});
	expect(response).not.toBeOK();
	expect(response.status()).toBe(StatusCodes.FORBIDDEN);
	const { error } = (await response.json()) as UnsuccessfulResponseBody;
	expect(error).toEqual(expect.stringContaining(DEFAULT_DOES_NOT_HAVE_PERMISSIONS));
});
