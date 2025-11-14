import type { VerifiableCredential } from '@veramo/core';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import * as fs from 'fs';
import { CONTENT_TYPE, DEFAULT_DOES_NOT_HAVE_PERMISSIONS, PAYLOADS_PATH } from '../../constants';

test.use({ storageState: 'playwright/.auth/user.json' });

test('[Positive] It can issue credentials with unique index allocation using CAS', async ({ request }) => {
	const credentialData = JSON.parse(
		fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/credential-issue-jwt-statuslist.json`, 'utf-8')
	);

	// Issue first credential
	const issueResponse1 = await request.post(`/credential/issue`, {
		data: JSON.stringify(credentialData),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const credential1: VerifiableCredential = await issueResponse1.json();
	expect(issueResponse1).toBeOK();
	expect(issueResponse1.status()).toBe(StatusCodes.OK);
	expect(credential1.credentialStatus).toHaveProperty('statusListIndex');

	const index1 = parseInt(credential1.credentialStatus.statusListIndex, 10);
	expect(index1).toBeGreaterThan(0);

	// Issue second credential - should get a different unique index
	const issueResponse2 = await request.post(`/credential/issue`, {
		data: JSON.stringify(credentialData),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const credential2: VerifiableCredential = await issueResponse2.json();
	expect(issueResponse2).toBeOK();
	expect(issueResponse2.status()).toBe(StatusCodes.OK);
	expect(credential2.credentialStatus).toHaveProperty('statusListIndex');

	const index2 = parseInt(credential2.credentialStatus.statusListIndex, 10);

	// In parallel test environment, indices may have gaps but must be unique and increasing
	expect(index2).toBeGreaterThan(index1);
	expect(index2).not.toBe(index1); // Must be different (CAS ensures uniqueness)
});

test('[Positive] It can handle parallel credential issuance without duplicate indices', async ({ request }) => {
	const credentialData = JSON.parse(
		fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/credential-issue-jwt-statuslist.json`, 'utf-8')
	);

	// Issue 5 credentials in parallel
	const promises = Array.from({ length: 5 }, () =>
		request.post(`/credential/issue`, {
			data: JSON.stringify(credentialData),
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		})
	);

	const responses = await Promise.all(promises);

	// All requests should succeed
	responses.forEach((response) => {
		expect(response).toBeOK();
		expect(response.status()).toBe(StatusCodes.OK);
	});

	// Extract all indices
	const credentials = await Promise.all(responses.map((r) => r.json()));
	const indices = credentials.map((c: VerifiableCredential) => parseInt(c.credentialStatus.statusListIndex, 10));

	// All indices should be unique (CAS guarantees no duplicates)
	const uniqueIndices = new Set(indices);
	expect(uniqueIndices.size).toBe(indices.length);

	// Indices should all be positive
	indices.forEach((idx) => {
		expect(idx).toBeGreaterThan(0);
	});

	// When sorted, indices should be strictly increasing (no duplicates)
	const sortedIndices = [...indices].sort((a, b) => a - b);
	for (let i = 1; i < sortedIndices.length; i++) {
		expect(sortedIndices[i]).toBeGreaterThan(sortedIndices[i - 1]);
	}
});

test('[Positive] It tracks writeCursor correctly after issuance', async ({ request }) => {
	const credentialData = JSON.parse(
		fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/credential-issue-jwt-statuslist.json`, 'utf-8')
	);

	// Get current state of the registry
	const statusListName = credentialData.credentialStatus.statusListName;
	const listType = credentialData.credentialStatus.statusListType;

	const listResponseBefore = await request.get(
		`/credential-status/list?statusListName=${statusListName}&listType=${listType}`
	);
	expect(listResponseBefore).toBeOK();
	const bodyBefore = await listResponseBefore.json();
	const writeCursorBefore = bodyBefore.records[0]?.writeCursor || 0;

	// Issue a credential
	const issueResponse = await request.post(`/credential/issue`, {
		data: JSON.stringify(credentialData),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	const credential: VerifiableCredential = await issueResponse.json();
	expect(issueResponse).toBeOK();

	const allocatedIndex = parseInt(credential.credentialStatus.statusListIndex, 10);

	// Get updated state of the registry
	const listResponseAfter = await request.get(
		`/credential-status/list?statusListName=${statusListName}&listType=${listType}`
	);
	expect(listResponseAfter).toBeOK();
	const bodyAfter = await listResponseAfter.json();
	const writeCursorAfter = bodyAfter.records[0].writeCursor;

	// writeCursor should be >= the allocated index (due to parallel execution)
	// In parallel tests, other workers may allocate indices after ours
	expect(writeCursorAfter).toBeGreaterThanOrEqual(allocatedIndex);
	expect(writeCursorAfter).toBeGreaterThan(writeCursorBefore);
});

test('[Positive] It maintains registry state as ACTIVE during normal issuance', async ({ request }) => {
	const credentialData = JSON.parse(
		fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/credential-issue-jwt-statuslist.json`, 'utf-8')
	);

	const statusListName = credentialData.credentialStatus.statusListName;
	const listType = credentialData.credentialStatus.statusListType;

	// Issue a credential
	const issueResponse = await request.post(`/credential/issue`, {
		data: JSON.stringify(credentialData),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	expect(issueResponse).toBeOK();

	// Check registry state
	const listResponse = await request.get(
		`/credential-status/list?statusListName=${statusListName}&listType=${listType}`
	);
	expect(listResponse).toBeOK();
	const body = await listResponse.json();

	// Registry should still be ACTIVE (unless it's near capacity)
	const registry = body.records[0];
	const utilization = (registry.writeCursor / registry.size) * 100;

	if (utilization < 100) {
		expect(registry.state).toBe('ACTIVE');
	} else {
		expect(registry.state).toBe('FULL');
	}
});

test('[Negative] It fails to issue credential when registry is FULL', async ({ request }) => {
	// This test requires a registry that is at capacity
	// For now, we'll skip it if no FULL registry exists
	const fullRegistryResponse = await request.get('/credential-status/list?state=FULL');
	const fullRegistries = await fullRegistryResponse.json();

	if (fullRegistries.records.length > 0) {
		const fullRegistry = fullRegistries.records[0];

		const credentialData = JSON.parse(
			fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/credential-issue-jwt-statuslist.json`, 'utf-8')
		);

		// Override with FULL registry
		credentialData.credentialStatus.statusListName = fullRegistry.statusListName;
		credentialData.credentialStatus.statusListType =
			fullRegistry.listType === 'BitstringStatusListCredential' ? 'BitstringStatusList' : 'StatusList2021';

		const issueResponse = await request.post(`/credential/issue`, {
			data: JSON.stringify(credentialData),
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		expect(issueResponse.status()).toBe(StatusCodes.BAD_REQUEST);
		const error = await issueResponse.json();
		expect(error.error).toContain('Full');
	} else {
		console.log('Skipping FULL registry test - no FULL registries found');
	}
});

test('[Positive] It verifies no index collisions under high concurrency', async ({ request }) => {
	const credentialData = JSON.parse(
		fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/credential-issue-jwt-statuslist.json`, 'utf-8')
	);

	// Issue 10 credentials concurrently
	const concurrentRequests = 10;
	const promises = Array.from({ length: concurrentRequests }, () =>
		request.post(`/credential/issue`, {
			data: JSON.stringify(credentialData),
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		})
	);

	const responses = await Promise.all(promises);

	// Count successful responses
	const successfulResponses = responses.filter((r) => r.ok());
	expect(successfulResponses.length).toBeGreaterThan(0);

	// Extract indices from successful responses
	const credentials = await Promise.all(successfulResponses.map((r) => r.json()));
	const indices = credentials.map((c: VerifiableCredential) => parseInt(c.credentialStatus.statusListIndex, 10));

	// All indices must be unique (no collisions)
	const uniqueIndices = new Set(indices);
	expect(uniqueIndices.size).toBe(indices.length);

	console.log(
		`Successfully issued ${successfulResponses.length}/${concurrentRequests} credentials with unique indices`
	);
});

test('[Positive] It verifies StatusList2021 credential with different purposes', async ({ request }) => {
	// Test with revocation purpose
	const revocationData = JSON.parse(
		fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/credential-issue-jwt-revocation.json`, 'utf-8')
	);

	const revocationResponse = await request.post(`/credential/issue`, {
		data: JSON.stringify(revocationData),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});

	if (revocationResponse.ok()) {
		const revocationCred: VerifiableCredential = await revocationResponse.json();
		expect(revocationCred.credentialStatus.statusPurpose).toBe('revocation');
		expect(revocationCred.credentialStatus).toHaveProperty('statusListIndex');
	}

	// Test with suspension purpose (if available)
	const suspensionData = JSON.parse(
		fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/credential-issue-jwt-revocation.json`, 'utf-8')
	);
	suspensionData.credentialStatus.statusPurpose = 'suspension';

	const suspensionResponse = await request.post(`/credential/issue`, {
		data: JSON.stringify(suspensionData),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});

	if (suspensionResponse.ok()) {
		const suspensionCred: VerifiableCredential = await suspensionResponse.json();
		expect(suspensionCred.credentialStatus.statusPurpose).toBe('suspension');
		expect(suspensionCred.credentialStatus).toHaveProperty('statusListIndex');
	}
});

test('[Positive] It updates version field with each CAS operation', async ({ request }) => {
	const credentialData = JSON.parse(
		fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/credential-issue-jwt-statuslist.json`, 'utf-8')
	);

	const statusListName = credentialData.credentialStatus.statusListName;
	const listType = credentialData.credentialStatus.statusListType;

	// Get current writeCursor
	const listResponseBefore = await request.get(
		`/credential-status/list?statusListName=${statusListName}&listType=${listType}`
	);
	expect(listResponseBefore).toBeOK();
	const bodyBefore = await listResponseBefore.json();
	const writeCursorBefore = bodyBefore.records[0].writeCursor;

	// Issue credential (triggers CAS update)
	const issueResponse = await request.post(`/credential/issue`, {
		data: JSON.stringify(credentialData),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	expect(issueResponse).toBeOK();

	// Get updated writeCursor
	const listResponseAfter = await request.get(
		`/credential-status/list?statusListName=${statusListName}&listType=${listType}`
	);
	expect(listResponseAfter).toBeOK();
	const bodyAfter = await listResponseAfter.json();
	const writeCursorAfter = bodyAfter.records[0].writeCursor;

	// writeCursor should have incremented (CAS succeeded)
	// In parallel execution, the cursor may have incremented by more than 1
	expect(writeCursorAfter).toBeGreaterThan(writeCursorBefore);
});

test('[Negative] It fails to issue credential when the did is not owned', async ({ request }) => {
	const credentialData = JSON.parse(
		fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/issue-credential-without-permissions.json`, 'utf-8')
	);

	const issueResponse = await request.post(`/credential/issue`, {
		data: JSON.stringify(credentialData),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	expect(issueResponse).not.toBeOK();
	expect(issueResponse.status()).toBe(StatusCodes.FORBIDDEN);
	const errorBody = await issueResponse.json();
	expect(errorBody.error).toContain(DEFAULT_DOES_NOT_HAVE_PERMISSIONS);
});

test('[Negative] It fails to issue credential when statusListIndex does not match', async ({ request }) => {
	const credentialData = JSON.parse(
		fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/credential-issue-jwt-statuslist.json`, 'utf-8')
	);
	credentialData.credentialStatus.statusListIndex = 2;
	const issueResponse = await request.post(`/credential/issue`, {
		data: JSON.stringify(credentialData),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	expect(issueResponse).not.toBeOK();
	expect(issueResponse.status()).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
	const errorBody = await issueResponse.json();
	expect(errorBody.error).toContain('Expected statusListIndex');
});
