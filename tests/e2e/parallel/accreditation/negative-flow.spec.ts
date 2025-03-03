import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import * as fs from 'fs';
import { CONTENT_TYPE, PAYLOADS_PATH } from '../../constants';

test.use({ storageState: 'playwright/.auth/user.json' });

test(' Issue accreditation [Negative]: Missing query parameters', async ({ request }) => {
	const credentialData = JSON.parse(fs.readFileSync(`${PAYLOADS_PATH.ACCREDITATION}/authorise-jwt.json`, 'utf-8'));
	const issueResponse = await request.post(`/trust-registry/accreditation/issue`, {
		data: JSON.stringify(credentialData),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	expect(issueResponse.status()).toBe(StatusCodes.BAD_REQUEST);
});

test(' Verify accreditation [Negative]: Missing request body', async ({ request }) => {
	const verifyResponse = await request.post(`/trust-registry/accreditation/verify`, {
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	expect(verifyResponse.status()).toBe(StatusCodes.BAD_REQUEST);
});

test(' Issue accreditation [Negative]: Invalid schema', async ({ request }) => {
	const credentialData = JSON.parse(
		fs.readFileSync(`${PAYLOADS_PATH.ACCREDITATION}/invalid-schema-accredit.json`, 'utf-8')
	);
	const issueResponse = await request.post(`/trust-registry/accreditation/issue?accreditationType=accredit`, {
		data: JSON.stringify(credentialData),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});

	expect(issueResponse.status()).toBe(StatusCodes.UNAUTHORIZED);
});
