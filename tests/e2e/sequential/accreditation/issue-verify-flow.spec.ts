import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import * as fs from 'fs';
import { CONTENT_TYPE, PAYLOADS_PATH } from '../../constants';

test.use({ storageState: 'playwright/.auth/user.json' });

test(' Issue and verify a authorize accreditation', async ({ request }) => {
	const credentialData = JSON.parse(fs.readFileSync(`${PAYLOADS_PATH.ACCREDITATION}/authorize-jwt.json`, 'utf-8'));
	const issueResponse = await request.post(`/trust-registry/accreditation/issue?accreditationType=authorize`, {
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
	expect(didUrls).toHaveLength(2);
	expect(didUrls).toContain(
		`did:cheqd:testnet:5RpEg66jhhbmASWPXJRWrA?resourceName=authorizeAccreditation&resourceType=VerifiableAuthorizationForTrustChain`
	);

	const verifyResponse = await request.post(`/trust-registry/accreditation/verify`, {
		data: JSON.stringify({
			subjectDid: `${credentialData.subjectDid}`,
			did: `${credentialData.issuerDid}`,
			schemas: credentialData.schemas,
			resourceName: 'authorizeAccreditation',
			resourceType: 'VerifiableAuthorizationForTrustChain',
		}),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const result = await verifyResponse.json();
	expect(verifyResponse).toBeOK();
	expect(verifyResponse.status()).toBe(StatusCodes.OK);
	expect(result.error).toBe(undefined);
	expect(result.verified).toBe(true);
});

test.skip(' Issue and verify a accredit accreditation', async ({ request }) => {
	const credentialData = JSON.parse(fs.readFileSync(`${PAYLOADS_PATH.ACCREDITATION}/accredit-jwt.json`, 'utf-8'));
	const issueResponse = await request.post(`/trust-registry/accreditation/issue?accreditationType=accredit`, {
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
	expect(didUrls).toHaveLength(2);
	expect(didUrls).toContain(
		`${credentialData.issuerDid}?resourceName=accreditAccreditation&resourceType=VerifiableAccreditationToAccredit`
	);

	const verifyResponse = await request.post(`/trust-registry/accreditation/verify`, {
		data: JSON.stringify({
			subjectDid: `${credentialData.subjectDid}`,
			schemas: credentialData.schemas,
			didUrl: `${credentialData.issuerDid}?resourceName=accreditAccreditation&resourceType=VerifiableAccreditationToAccredit`,
		}),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const result = await verifyResponse.json();
	expect(verifyResponse).toBeOK();
	expect(verifyResponse.status()).toBe(StatusCodes.OK);
	expect(result.error).toBe(undefined);
	expect(result.verified).toBe(true);
});

test.skip(' Issue and verify a child accredit accreditation', async ({ request }) => {
	const credentialData = JSON.parse(
		fs.readFileSync(`${PAYLOADS_PATH.ACCREDITATION}/child-accredit-jwt.json`, 'utf-8')
	);
	const issueResponse = await request.post(`/trust-registry/accreditation/issue?accreditationType=accredit`, {
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
	expect(didUrls).toHaveLength(2);
	expect(didUrls).toContain(
		`${credentialData.issuerDid}?resourceName=accreditAccreditation&resourceType=VerifiableAccreditationToAccredit`
	);

	const verifyResponse = await request.post(`/trust-registry/accreditation/verify`, {
		data: JSON.stringify({
			subjectDid: `${credentialData.subjectDid}`,
			schemas: credentialData.schemas,
			didUrl: `${credentialData.issuerDid}?resourceName=accreditAccreditation&resourceType=VerifiableAccreditationToAccredit`,
		}),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const result = await verifyResponse.json();
	expect(verifyResponse).toBeOK();
	expect(verifyResponse.status()).toBe(StatusCodes.OK);
	expect(result.error).toBe(undefined);
	expect(result.verified).toBe(true);
});

test.skip(' Issue and verify a attest accreditation', async ({ request }) => {
	const credentialData = JSON.parse(fs.readFileSync(`${PAYLOADS_PATH.ACCREDITATION}/attest-jwt.json`, 'utf-8'));
	const issueResponse = await request.post(`/trust-registry/accreditation/issue?accreditationType=attest`, {
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
	expect(didUrls).toHaveLength(2);
	expect(didUrls).toContain(
		`${credentialData.issuerDid}?resourceName=attestAccreditation&resourceType=VerifiableAccreditationToAttest`
	);

	const verifyResponse = await request.post(`/trust-registry/accreditation/verify`, {
		data: JSON.stringify({
			subjectDid: `${credentialData.subjectDid}`,
			didUrl: `${credentialData.issuerDid}?resourceName=attestAccreditation&resourceType=VerifiableAccreditationToAttest`,
			schemas: credentialData.schemas,
		}),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const result = await verifyResponse.json();
	expect(verifyResponse).toBeOK();
	expect(verifyResponse.status()).toBe(StatusCodes.OK);
	expect(result.error).toBe(undefined);
	expect(result.verified).toBe(true);
});
