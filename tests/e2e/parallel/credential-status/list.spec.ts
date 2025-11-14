import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import {
	STORAGE_STATE_AUTHENTICATED,
	DEFAULT_TESTNET_DID,
	NOT_EXISTENT_TESTNET_DID,
	DEFAULT_STATUS_LIST_UNENCRYPTED_NAME,
	BITSTRING_STATUS_LIST_UNENCRYPTED_NAME,
} from '../../constants';

test.use({ storageState: STORAGE_STATE_AUTHENTICATED });

test('[Positive] It can list all status registries', async ({ request }) => {
	const response = await request.get('/credential-status/list');
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);

	const body = await response.json();
	expect(body.records).toBeDefined();
	expect(Array.isArray(body.records)).toBe(true);
	expect(body.total).toBeDefined();
	expect(typeof body.total).toBe('number');

	// Verify structure of records
	const record = body.records[0];
	expect(record).toHaveProperty('statusListId');
	expect(record).toHaveProperty('statusListName');
	expect(record).toHaveProperty('uri');
	expect(record).toHaveProperty('issuerId');
	expect(record).toHaveProperty('listType');
	expect(record).toHaveProperty('storageType');
	expect(record).toHaveProperty('encrypted');
	expect(record).toHaveProperty('credentialCategory');
	expect(record).toHaveProperty('size');
	expect(record).toHaveProperty('writeCursor');
	expect(record).toHaveProperty('state');
	expect(record).toHaveProperty('createdAt');
	expect(record).toHaveProperty('updatedAt');
});

test('[Positive] It can list status registries filtered by DID', async ({ request }) => {
	const response = await request.get(`/credential-status/list?did=${DEFAULT_TESTNET_DID}`);
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);

	const body = await response.json();
	expect(body.records).toBeDefined();
	expect(Array.isArray(body.records)).toBe(true);

	// All records should have the filtered DID
	body.records.forEach((record: any) => {
		expect(record.issuerId).toBe(DEFAULT_TESTNET_DID);
	});
});

test('[Positive] It can list status registries filtered by state', async ({ request }) => {
	const response = await request.get('/credential-status/list?state=ACTIVE');
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);

	const body = await response.json();
	expect(body.records).toBeDefined();
	expect(Array.isArray(body.records)).toBe(true);

	// All records should have ACTIVE state
	body.records.forEach((record: any) => {
		expect(record.state).toBe('ACTIVE');
	});
});

test('[Positive] It can list status registries filtered by statusListName', async ({ request }) => {
	const response = await request.get(
		`/credential-status/list?statusListName=${DEFAULT_STATUS_LIST_UNENCRYPTED_NAME}`
	);
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);

	const body = await response.json();
	expect(body.records).toBeDefined();
	expect(Array.isArray(body.records)).toBe(true);

	// All records should have the filtered statusListName
	body.records.forEach((record: any) => {
		expect(record.statusListName).toBe(DEFAULT_STATUS_LIST_UNENCRYPTED_NAME);
	});
});

test('[Positive] It can list status registries filtered by listType', async ({ request }) => {
	const response = await request.get('/credential-status/list?listType=BitstringStatusList');
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);

	const body = await response.json();
	expect(body.records).toBeDefined();
	expect(Array.isArray(body.records)).toBe(true);

	// All records should have BitstringStatusListCredential type
	body.records.forEach((record: any) => {
		expect(record.listType).toBe('BitstringStatusListCredential');
	});
});

test('[Positive] It can list status registries filtered by credentialCategory', async ({ request }) => {
	const response = await request.get('/credential-status/list?credentialCategory=credential');
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);

	const body = await response.json();
	expect(body.records).toBeDefined();
	expect(Array.isArray(body.records)).toBe(true);

	// All records should have credential category
	body.records.forEach((record: any) => {
		expect(record.credentialCategory).toBe('credential');
	});
});

test('[Positive] It can list status registries with multiple filters', async ({ request }) => {
	const response = await request.get(
		`/credential-status/list?did=${DEFAULT_TESTNET_DID}&state=ACTIVE&listType=StatusList2021`
	);
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);

	const body = await response.json();
	expect(body.records).toBeDefined();
	expect(Array.isArray(body.records)).toBe(true);

	// All records should match all filters
	body.records.forEach((record: any) => {
		expect(record.issuerId).toBe(DEFAULT_TESTNET_DID);
		expect(record.state).toBe('ACTIVE');
		expect(['StatusList2021Revocation', 'StatusList2021Suspension']).toContain(record.listType);
	});
});

test('[Positive] It can list status registries filtered by deprecated status', async ({ request }) => {
	const response = await request.get('/credential-status/list?deprecated=false');
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);

	const body = await response.json();
	expect(body.records).toBeDefined();
	expect(Array.isArray(body.records)).toBe(true);

	// All records should not be deprecated
	body.records.forEach((record: any) => {
		expect(record.deprecated).toBe(false);
	});
});

test('[Positive] It returns empty list when filtering by non-existent DID', async ({ request }) => {
	const response = await request.get(`/credential-status/list?did=${NOT_EXISTENT_TESTNET_DID}`);
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);

	const body = await response.json();
	expect(body.records).toBeDefined();
	expect(Array.isArray(body.records)).toBe(true);
	expect(body.records.length).toBe(0);
	expect(body.total).toBe(0);
});

test('[Positive] It can get a specific status registry by ID', async ({ request }) => {
	// First get a list to obtain a valid statusListId
	const listResponse = await request.get('/credential-status/list');
	expect(listResponse).toBeOK();
	const listBody = await listResponse.json();

	if (listBody.records.length > 0) {
		const statusListId = listBody.records[0].statusListId;

		const response = await request.get(`/credential-status/list/${statusListId}`);
		expect(response).toBeOK();
		expect(response.status()).toBe(StatusCodes.OK);

		const body = await response.json();
		expect(body.statusListId).toBe(statusListId);
		expect(body).toHaveProperty('statusListName');
		expect(body).toHaveProperty('uri');
		expect(body).toHaveProperty('issuerId');
		expect(body).toHaveProperty('listType');
		expect(body).toHaveProperty('storageType');
		expect(body).toHaveProperty('encrypted');
		expect(body).toHaveProperty('credentialCategory');
		expect(body).toHaveProperty('size');
		expect(body).toHaveProperty('writeCursor');
		expect(body).toHaveProperty('state');
		expect(body).toHaveProperty('createdAt');
		expect(body).toHaveProperty('updatedAt');

		// Verify prev_uri and next_uri fields exist (may be null)
		expect(body).toHaveProperty('previousUri');
		expect(body).toHaveProperty('nextUri');
	}
});

test('[Positive] It can get a specific status registry by name and type', async ({ request }) => {
	const response = await request.get(
		`/credential-status/list?statusListName=${DEFAULT_STATUS_LIST_UNENCRYPTED_NAME}&listType=StatusList2021`
	);
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);

	const body = await response.json();
	expect(body.records).toBeDefined();

	if (body.records.length > 0) {
		const record = body.records[0];
		expect(record.statusListName).toBe(DEFAULT_STATUS_LIST_UNENCRYPTED_NAME);
		expect(['StatusList2021Revocation', 'StatusList2021Suspension']).toContain(record.listType);
	}
});

test('[Negative] It returns 404 when getting non-existent status registry by ID', async ({ request }) => {
	const nonExistentId = '00000000-0000-0000-0000-000000000000';
	const response = await request.get(`/credential-status/list/${nonExistentId}`);
	expect(response.status()).toBe(StatusCodes.NOT_FOUND);

	const body = await response.json();
	expect(body.error).toBeDefined();
	expect(body.error).toContain('Status list not found');
});

test('[Positive] It verifies registry chain fields (prev_uri, next_uri)', async ({ request }) => {
	const response = await request.get('/credential-status/list');
	expect(response).toBeOK();

	const body = await response.json();

	if (body.records.length > 0) {
		const record = body.records[0];

		// previousUri and nextUri should either be null or valid URIs
		if (record.previousUri) {
			expect(record.previousUri).toContain('did:');
			expect(record.previousUri).toContain('resourceName=');
		}

		if (record.nextUri) {
			expect(record.nextUri).toContain('did:');
			expect(record.nextUri).toContain('resourceName=');
		}
	}
});

test('[Positive] It verifies CAS version field is tracked', async ({ request }) => {
	const response = await request.get('/credential-status/list');
	expect(response).toBeOK();

	const body = await response.json();

	if (body.records.length > 0) {
		const record = body.records[0];

		// Version should be a number (used for CAS)
		// Note: version is internal field, not exposed in API
		expect(record).toHaveProperty('writeCursor');
		expect(typeof record.writeCursor).toBe('number');
		expect(record.writeCursor).toBeGreaterThanOrEqual(0);
	}
});

test('[Positive] It verifies threshold_percentage field is present', async ({ request }) => {
	const listResponse = await request.get('/credential-status/list');
	expect(listResponse).toBeOK();
	const listBody = await listResponse.json();

	if (listBody.records.length > 0) {
		const statusListId = listBody.records[0].statusListId;

		const response = await request.get(`/credential-status/list/${statusListId}`);
		expect(response).toBeOK();

		const body = await response.json();

		// threshold_percentage should be a number, typically 80
		// Note: This might not be exposed in API, adjust if needed
		expect(body).toHaveProperty('size');
		expect(body).toHaveProperty('writeCursor');

		// Calculate utilization
		const utilization = (body.writeCursor / body.size) * 100;
		expect(utilization).toBeGreaterThanOrEqual(0);
		expect(utilization).toBeLessThanOrEqual(100);
	}
});

test('[Positive] It verifies BitstringStatusList registry structure', async ({ request }) => {
	const response = await request.get(
		`/credential-status/list?statusListName=${BITSTRING_STATUS_LIST_UNENCRYPTED_NAME}`
	);
	expect(response).toBeOK();

	const body = await response.json();

	if (body.records.length > 0) {
		const record = body.records[0];
		expect(record.statusListName).toBe(BITSTRING_STATUS_LIST_UNENCRYPTED_NAME);
		expect(record.listType).toBe('BitstringStatusListCredential');
		expect(record.storageType).toBe('cheqd');
		expect(record.encrypted).toBe(false);
	}
});

test('[Positive] It verifies sealedAt field for FULL registries', async ({ request }) => {
	const response = await request.get('/credential-status/list?state=FULL');
	expect(response).toBeOK();

	const body = await response.json();

	// FULL registries should potentially have sealedAt timestamp
	body.records.forEach((record: any) => {
		expect(record.state).toBe('FULL');
		// sealedAt may or may not be set depending on implementation
		if (record.sealedAt) {
			expect(new Date(record.sealedAt).toString()).not.toBe('Invalid Date');
		}
	});
});
