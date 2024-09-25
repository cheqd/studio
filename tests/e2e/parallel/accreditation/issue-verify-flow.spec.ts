import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import * as fs from 'fs';
import { CONTENT_TYPE, PAYLOADS_PATH } from '../../constants';

test.use({ storageState: 'playwright/.auth/user.json' });

test(' Issue a accreditation', async ({ request }) => {
	const credentialData = JSON.parse(
		fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/accreditation-issue-jwt.json`, 'utf-8')
	);
	const issueResponse = await request.post(`/accreditation/issue?accreditationType=authorize`, {
		data: JSON.stringify(credentialData),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const { didUrls, accreditation } = await issueResponse.json();
	expect(issueResponse).toBeOK();
	expect(issueResponse.status()).toBe(StatusCodes.OK);
	expect(accreditation.proof.type).toBe('JwtProof2020');
	expect(accreditation.proof).toHaveProperty('jwt');
	expect(typeof accreditation.issuer === 'string' ? accreditation.issuer : accreditation.issuer.id).toBe(
		credentialData.issuerDid
	);
	expect(accreditation.type).toContain('VerifiableCredential');
	expect(accreditation.credentialSubject).toMatchObject({
		...credentialData.attributes,
		id: credentialData.subjectDid,
	});

	const verifyResponse = await request.post(`/accreditation/verify/${didUrls[0]}`, {
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const result = await verifyResponse.json();
	expect(verifyResponse).toBeOK();
	expect(verifyResponse.status()).toBe(StatusCodes.OK);
	expect(result.verified).toBe(true);
});
