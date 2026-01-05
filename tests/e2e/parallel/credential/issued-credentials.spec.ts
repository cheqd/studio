import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import {
	CONTENT_TYPE,
	DEFAULT_TESTNET_CRED_IDENTIFIER,
	DEFAULT_TESTNET_DID,
	NOT_EXISTENT_RESOURCE_ID,
} from '../../constants';

test.use({ storageState: 'playwright/.auth/user.json' });

test('List issued credentials with default parameters', async ({ request }) => {
	const response = await request.get(`/credentials/issued`, {
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const result = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(result).toHaveProperty('credentials');
	expect(result).toHaveProperty('total');
	expect(Array.isArray(result.credentials)).toBe(true);
	expect(typeof result.total).toBe('number');
});

test('List issued credentials with pagination', async ({ request }) => {
	const response = await request.get(`/credentials/issued?page=1&limit=5`, {
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const result = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(result).toHaveProperty('credentials');
	expect(result).toHaveProperty('total');
	expect(Array.isArray(result.credentials)).toBe(true);
	expect(result.credentials.length).toBeLessThanOrEqual(5);
});

test('List issued credentials filtered by providerId', async ({ request }) => {
	const response = await request.get(`/credentials/issued?providerId=studio`, {
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const result = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(result).toHaveProperty('credentials');
	expect(result).toHaveProperty('total');
	expect(Array.isArray(result.credentials)).toBe(true);
	// All credentials should have providerId 'studio'
	result.credentials.forEach((cred: any) => {
		expect(cred.providerId).toBe('studio');
	});
});

test('List issued credentials filtered by status', async ({ request }) => {
	const response = await request.get(`/credentials/issued?status=issued`, {
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const result = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(result).toHaveProperty('credentials');
	expect(result).toHaveProperty('total');
	expect(Array.isArray(result.credentials)).toBe(true);
	// All credentials should have status 'issued'
	result.credentials.forEach((cred: any) => {
		expect(cred.status).toBe('issued');
	});
});

test('List issued credentials filtered by format', async ({ request }) => {
	const response = await request.get(`/credentials/issued?format=jwt`, {
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const result = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(result).toHaveProperty('credentials');
	expect(result).toHaveProperty('total');
	expect(Array.isArray(result.credentials)).toBe(true);
	// All credentials should have format 'jwt'
	result.credentials.forEach((cred: any) => {
		expect(cred.format).toBe('jwt');
	});
});

test('List issued credentials filtered by issuerId', async ({ request }) => {
	const response = await request.get(`/credentials/issued?issuerId=${DEFAULT_TESTNET_DID}`, {
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const result = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(result).toHaveProperty('credentials');
	expect(result).toHaveProperty('total');
	expect(Array.isArray(result.credentials)).toBe(true);
});

test('List issued credentials filtered by subjectId', async ({ request }) => {
	// Using a dummy did:key for testing
	const dummySubjectDid = 'did:key:123456';
	const response = await request.get(`/credentials/issued?subjectId=${dummySubjectDid}`, {
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const result = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(result).toHaveProperty('credentials');
	expect(result).toHaveProperty('total');
	expect(Array.isArray(result.credentials)).toBe(true);
});

test('List issued credentials with multiple filters', async ({ request }) => {
	const response = await request.get(
		`/credentials/issued?providerId=studio&status=issued&format=jwt&page=1&limit=10`,
		{
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		}
	);
	const result = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(result).toHaveProperty('credentials');
	expect(result).toHaveProperty('total');
	expect(Array.isArray(result.credentials)).toBe(true);
	expect(result.credentials.length).toBeLessThanOrEqual(10);
});

test('Get a single issued credential by UUID', async ({ request }) => {
	const response = await request.get(`/credentials/issued/${DEFAULT_TESTNET_CRED_IDENTIFIER}`, {
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});

	const result = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(result).toHaveProperty('issuedCredentialId');
	expect(result).toHaveProperty('providerId');
	expect(result).toHaveProperty('format');
	expect(result).toHaveProperty('type');
	expect(result).toHaveProperty('status');
	expect(result).toHaveProperty('issuedAt');
	expect(result).toHaveProperty('createdAt');
	expect(result).toHaveProperty('updatedAt');
});

test('Get a single issued credential by providerCredentialId', async ({ request }) => {
	const response = await request.get(`/credentials/issued/${DEFAULT_TESTNET_CRED_IDENTIFIER}?providerId=studio`, {
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});

	const result = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(result).toHaveProperty('issuedCredentialId');
	expect(result).toHaveProperty('providerId');
	expect(result.providerId).toBe('studio');
});

test('Get a single issued credential with includeCredential=true', async ({ request }) => {
	const response = await request.get(
		`/credentials/issued/${DEFAULT_TESTNET_CRED_IDENTIFIER}?includeCredential=true`,
		{
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		}
	);

	const result = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(result).toHaveProperty('issuedCredentialId');
	expect(result).toHaveProperty('credential');
	// Verify credential structure
	expect(result.credential).toHaveProperty('@context');
	expect(result.credential).toHaveProperty('type');
	expect(result.credential).toHaveProperty('issuer');
	expect(result.credential).toHaveProperty('credentialSubject');
	expect(result.credential).toHaveProperty('issuanceDate');
});

test('Get a single issued credential with syncStatus=true', async ({ request }) => {
	const response = await request.get(`/credentials/issued/${DEFAULT_TESTNET_CRED_IDENTIFIER}?syncStatus=true`, {
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const result = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(result).toHaveProperty('issuedCredentialId');
	expect(result).toHaveProperty('status');
	// Status should be one of the valid values
	expect(['issued', 'suspended', 'revoked']).toContain(result.status);
});

test('Get a single issued credential with both includeCredential and syncStatus', async ({ request }) => {
	const response = await request.get(
		`/credentials/issued/${DEFAULT_TESTNET_CRED_IDENTIFIER}?includeCredential=true&syncStatus=true`,
		{
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		}
	);
	const result = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);
	expect(result).toHaveProperty('issuedCredentialId');
	expect(result).toHaveProperty('credential');
	expect(result).toHaveProperty('status');
	expect(['issued', 'suspended', 'revoked']).toContain(result.status);
});

test('Get a non-existent credential returns 404', async ({ request }) => {
	const response = await request.get(`/credentials/issued/${NOT_EXISTENT_RESOURCE_ID}`, {
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});

	expect(response.status()).toBe(StatusCodes.NOT_FOUND);
	const result = await response.json();
	expect(result).toHaveProperty('error');
	expect(result.error).toContain('not found');
});

test('List response structure validation', async ({ request }) => {
	const response = await request.get(`/credentials/issued?limit=1`, {
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const result = await response.json();
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);

	// Validate the structure of returned credentials
	if (result.credentials.length > 0) {
		const credential = result.credentials[0];
		expect(credential).toHaveProperty('issuedCredentialId');
		expect(credential).toHaveProperty('providerId');
		expect(credential).toHaveProperty('format');
		expect(credential).toHaveProperty('type');
		expect(Array.isArray(credential.type)).toBe(true);
		expect(credential).toHaveProperty('status');
		expect(['issued', 'suspended', 'revoked', 'offered', 'rejected']).toContain(credential.status);
		expect(credential).toHaveProperty('issuedAt');
		expect(credential).toHaveProperty('createdAt');
		expect(credential).toHaveProperty('updatedAt');

		// Optional fields
		if (credential.providerCredentialId) {
			expect(typeof credential.providerCredentialId).toBe('string');
		}
		if (credential.issuerId) {
			expect(typeof credential.issuerId).toBe('string');
		}
		if (credential.subjectId) {
			expect(typeof credential.subjectId).toBe('string');
		}
		if (credential.expiresAt) {
			expect(typeof credential.expiresAt).toBe('string');
		}
		if (credential.statusUpdatedAt) {
			expect(typeof credential.statusUpdatedAt).toBe('string');
		}
	}
});
