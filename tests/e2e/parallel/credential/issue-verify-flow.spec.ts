import type { VerifiableCredential } from '@veramo/core';

import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import * as fs from 'fs';
import { CONTENT_TYPE, PAYLOADS_PATH } from '../../constants';

test.use({ storageState: 'playwright/.auth/user.json' });

test(' Issue a jwt credential', async ({ request }) => {
	const credentialData = JSON.parse(
		fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/credential-issue-jwt.json`, 'utf-8')
	);
	const issueResponse = await request.post(`/credential/issue`, {
		data: JSON.stringify(credentialData),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const jwtCredential: VerifiableCredential = await issueResponse.json();
	expect(issueResponse).toBeOK();
	expect(issueResponse.status()).toBe(StatusCodes.OK);
	expect(jwtCredential.proof.type).toBe('JwtProof2020');
	expect(jwtCredential.proof).toHaveProperty('jwt');
	expect(typeof jwtCredential.issuer === 'string' ? jwtCredential.issuer : jwtCredential.issuer.id).toBe(
		credentialData.issuerDid
	);
	expect(jwtCredential.type).toContain('VerifiableCredential');
	expect(jwtCredential.credentialSubject).toMatchObject({
		...credentialData.attributes,
		id: credentialData.subjectDid,
	});

	const verifyResponse = await request.post(`/credential/verify`, {
		data: JSON.stringify({
			credential: jwtCredential.proof.jwt,
		}),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const result = await verifyResponse.json();
	expect(verifyResponse).toBeOK();
	expect(verifyResponse.status()).toBe(StatusCodes.OK);
	expect(result.verified).toBe(true);
});

test(' Issue a jwt credential with a deactivated DID', async ({ request }) => {
	const credentialData = JSON.parse(
		fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/credential-issue-jwt.json`, 'utf-8')
	);
	credentialData.issuerDid = 'did:cheqd:testnet:edce6dfb-b59c-493b-a4b8-1d16a6184349';
	const response = await request.post(`/credential/issue`, {
		data: JSON.stringify(credentialData),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	expect(response.status()).toBe(StatusCodes.BAD_REQUEST);
});

test(' Issue a jsonLD credential with Ed25519VerificationKey2018', async ({ request }) => {
	const credentialData = JSON.parse(
		fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/credential-issue-jsonld-ed25519-2018.json`, 'utf-8')
	);
	const issueResponse = await request.post(`/credential/issue`, {
		data: JSON.stringify(credentialData),
		headers: {
			'Content-Type': 'application/json',
		},
	});
	const jsonldCredential: VerifiableCredential = await issueResponse.json();
	expect(issueResponse).toBeOK();
	expect(issueResponse.status()).toBe(StatusCodes.OK);
	expect(jsonldCredential.proof.type).toBe('Ed25519Signature2018');
	expect(jsonldCredential.proof).toHaveProperty('jws');
	expect(typeof jsonldCredential.issuer === 'string' ? jsonldCredential.issuer : jsonldCredential.issuer.id).toBe(
		credentialData.issuerDid
	);
	expect(jsonldCredential.type).toContain('VerifiableCredential');
	expect(jsonldCredential.credentialSubject).toMatchObject({
		...credentialData.attributes,
		id: credentialData.subjectDid,
	});

	const verifyResponse = await request.post(`/credential/verify?fetchRemoteContexts=true`, {
		data: JSON.stringify({
			credential: jsonldCredential,
		}),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const result = await verifyResponse.json();
	expect(verifyResponse).toBeOK();
	expect(verifyResponse.status()).toBe(StatusCodes.OK);
	expect(result.verified).toBe(true);
});

test(' Issue a jsonLD credential with Ed25519VerificationKey2020', async ({ request }) => {
	const credentialData = JSON.parse(
		fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/credential-issue-jsonld-ed25519-2020.json`, 'utf-8')
	);
	const issueResponse = await request.post(`/credential/issue`, {
		data: JSON.stringify(credentialData),
		headers: {
			'Content-Type': 'application/json',
		},
	});
	const jsonldCredential = await issueResponse.json();
	expect(issueResponse).toBeOK();
	expect(issueResponse.status()).toBe(StatusCodes.OK);
	expect(jsonldCredential.proof.type).toBe('Ed25519Signature2020');
	expect(jsonldCredential.proof).toHaveProperty('proofValue');
	expect(typeof jsonldCredential.issuer === 'string' ? jsonldCredential.issuer : jsonldCredential.issuer.id).toBe(
		credentialData.issuerDid
	);
	expect(jsonldCredential.type).toContain('VerifiableCredential');
	expect(jsonldCredential.credentialSubject).toMatchObject({
		...credentialData.attributes,
		id: credentialData.subjectDid,
	});
	expect(jsonldCredential['@context']).toContain('https://w3id.org/security/suites/ed25519-2020/v1');

	const verifyResponse = await request.post(`/credential/verify?fetchRemoteContexts=true`, {
		data: JSON.stringify({
			credential: jsonldCredential,
		}),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const result = await verifyResponse.json();
	expect(verifyResponse).toBeOK();
	expect(verifyResponse.status()).toBe(StatusCodes.OK);
	expect(result.verified).toBe(true);
});

test(' Issue a jsonLD credential with JsonWebKey2020', async ({ request }) => {
	const credentialData = JSON.parse(
		fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/credential-issue-jsonld-jsonwebkey-2020.json`, 'utf-8')
	);
	const issueResponse = await request.post(`/credential/issue`, {
		data: JSON.stringify(credentialData),
		headers: {
			'Content-Type': 'application/json',
		},
	});
	const jsonldCredential = await issueResponse.json();
	expect(issueResponse).toBeOK();
	expect(issueResponse.status()).toBe(StatusCodes.OK);
	expect(jsonldCredential.proof.type).toBe('JsonWebSignature2020');
	expect(jsonldCredential.proof).toHaveProperty('jws');
	expect(typeof jsonldCredential.issuer === 'string' ? jsonldCredential.issuer : jsonldCredential.issuer.id).toBe(
		credentialData.issuerDid
	);
	expect(jsonldCredential.type).toContain('VerifiableCredential');
	expect(jsonldCredential.credentialSubject).toMatchObject({
		...credentialData.attributes,
		id: credentialData.subjectDid,
	});
	expect(jsonldCredential['@context']).toContain('https://w3id.org/security/suites/jws-2020/v1');

	const verifyResponse = await request.post(`/credential/verify?fetchRemoteContexts=true`, {
		data: JSON.stringify({
			credential: jsonldCredential,
		}),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const result = await verifyResponse.json();
	expect(verifyResponse).toBeOK();
	expect(verifyResponse.status()).toBe(StatusCodes.OK);
	expect(result.verified).toBe(true);
});

test.skip(' Issue a jwt credential to a verida DID holder', async ({ request }) => {
	const credentialData = JSON.parse(
		fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/credential-issue-vda.json`, 'utf-8')
	);
	const response = await request.post(`/credential/issue`, {
		data: JSON.stringify(credentialData),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const credential = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(credential.proof.type).toBe('JwtProof2020');
	expect(credential.proof).toHaveProperty('jwt');
	expect(typeof credential.issuer === 'string' ? credential.issuer : credential.issuer.id).toBe(
		credentialData.issuerDid
	);
	expect(credential.type).toContain('VerifiableCredential');
	expect(credential.credentialSubject).toMatchObject({
		...credentialData.attributes,
		id: credentialData.subjectDid,
	});
});
