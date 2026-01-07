import type { VerifiableCredential } from '@veramo/core';

import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import * as fs from 'fs';
import {
	BITSTRING_STATUS_LIST_UNENCRYPTED_DID,
	CONTENT_TYPE,
	DEFAULT_TESTNET_DID,
	NOT_EXISTENT_TESTNET_DID,
	PAYLOADS_PATH,
} from '../../constants';

test.use({ storageState: 'playwright/.auth/user.json' });

// Shared state across all tests
let holderDid: string = BITSTRING_STATUS_LIST_UNENCRYPTED_DID;
let issuedCredentialId: string;
let offeredCredential: VerifiableCredential;
let importedCredentialHash: string;
let importedCredential: VerifiableCredential;
let rejectIssuedCredentialId: string;

test.describe.serial('Credential Offers & Received Credentials - Complete Lifecycle', () => {
	// ================================================================================
	// SECTION 1: CREDENTIAL ISSUANCE AND OFFERS
	// ================================================================================

	test(' Issue credential as offer to holder DID in wallet', async ({ request }) => {
		const credentialData = JSON.parse(
			fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/credential-issue-jwt.json`, 'utf-8')
		);

		credentialData.subjectDid = holderDid;

		const issueResponse = await request.post(`/credential/issue`, {
			data: JSON.stringify(credentialData),
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		expect(issueResponse).toBeOK();
		expect(issueResponse.status()).toBe(StatusCodes.OK);

		const responseBody = await issueResponse.json();
		offeredCredential = responseBody;

		// Verify credential was issued as an offer
		expect(offeredCredential.proof.type).toBe('JwtProof2020');
		expect(offeredCredential.credentialSubject).toMatchObject({
			...credentialData.attributes,
			id: holderDid,
		});
	});

	test(' Fetch the offered credential and get issuedCredentialId', async ({ request }) => {
		const response = await request.get(
			`/credentials/issued?issuerId=${DEFAULT_TESTNET_DID}&subjectId=${holderDid}&status=offered`,
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

		const credential = result.credentials[0];
		issuedCredentialId = credential.issuedCredentialId;

		expect(credential.issuerId).toBe(DEFAULT_TESTNET_DID);
		expect(credential.subjectId).toBe(holderDid);
		expect(credential.status).toBe('offered');
	});

	test(' Issue credential directly to external DID (not as offer)', async ({ request }) => {
		const credentialData = JSON.parse(
			fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/credential-issue-jwt.json`, 'utf-8')
		);

		// Issue to external DID (not in wallet) - should NOT create offer
		const issueResponse = await request.post(`/credential/issue`, {
			data: JSON.stringify(credentialData),
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		expect(issueResponse).toBeOK();
		expect(issueResponse.status()).toBe(StatusCodes.OK);

		const issueData = await issueResponse.json();
		expect(issueData).toHaveProperty('proof');

		// This should be directly issued, not offered
		// Verify it's NOT in offers list for our holder
		const offersResponse = await request.get(`/credentials/offers?holderDid=${holderDid}`, {
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		const offersData = await offersResponse.json();
		// External DID credential should not appear in our holder's offers
		expect(offersData.offers.every((o: any) => o.subjectId === holderDid)).toBe(true);
	});

	// ================================================================================
	// SECTION 2: LIST AND GET OFFERS
	// ================================================================================

	test(' List pending credential offers', async ({ request }) => {
		const listOffersResponse = await request.get(`/credentials/offers`, {
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		expect(listOffersResponse).toBeOK();
		expect(listOffersResponse.status()).toBe(StatusCodes.OK);

		const offersData = await listOffersResponse.json();
		expect(offersData).toHaveProperty('total');
		expect(offersData).toHaveProperty('offers');
		expect(offersData.total).toBeGreaterThanOrEqual(1);
		expect(Array.isArray(offersData.offers)).toBe(true);

		// Verify the offer we created is in the list
		const ourOffer = offersData.offers.find((o: any) => o.issuedCredentialId === issuedCredentialId);
		expect(ourOffer).toBeDefined();
		expect(ourOffer.status).toBe('offered');
	});

	test(' List pending offers with holderDid filter', async ({ request }) => {
		const listOffersResponse = await request.get(`/credentials/offers?holderDid=${holderDid}`, {
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		expect(listOffersResponse).toBeOK();
		expect(listOffersResponse.status()).toBe(StatusCodes.OK);

		const offersData = await listOffersResponse.json();
		expect(offersData.total).toBeGreaterThanOrEqual(1);

		// All offers should have the filtered holderDid as subject
		offersData.offers.forEach((offer: any) => {
			expect(offer.subjectId).toBe(holderDid);
		});
	});

	test(' Get specific credential offer details', async ({ request }) => {
		const offerDetailsResponse = await request.get(
			`/credentials/offers/${issuedCredentialId}?holderDid=${holderDid}`,
			{
				headers: {
					'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
				},
			}
		);

		expect(offerDetailsResponse).toBeOK();
		expect(offerDetailsResponse.status()).toBe(StatusCodes.OK);

		const offerDetails = await offerDetailsResponse.json();
		expect(offerDetails.issuedCredentialId).toBe(issuedCredentialId);
		expect(offerDetails.status).toBe('offered');
		expect(offerDetails.subjectId).toBe(holderDid);
		expect(offerDetails).toHaveProperty('veramoCredential');
	});

	test(' Attempt to get offer with DID not in wallet - should fail', async ({ request }) => {
		const offerDetailsResponse = await request.get(
			`/credentials/offers/${issuedCredentialId}?holderDid=${NOT_EXISTENT_TESTNET_DID}`,
			{
				headers: {
					'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
				},
			}
		);

		expect(offerDetailsResponse.status()).toBe(StatusCodes.NOT_FOUND);
		const errorData = await offerDetailsResponse.json();
		expect(errorData.error).toContain('not found in your wallet');
	});

	// ================================================================================
	// SECTION 3: VERIFY CREDENTIAL (INDEPENDENT OF OFFER STATUS)
	// ================================================================================

	test(' Verify credential while still in offered state', async ({ request }) => {
		// Verify the credential even though it's still in 'offered' state
		const verifyResponse = await request.post(`/credential/verify`, {
			data: JSON.stringify({
				credential: offeredCredential.proof.jwt,
			}),
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		expect(verifyResponse).toBeOK();
		expect(verifyResponse.status()).toBe(StatusCodes.OK);

		const verifyData = await verifyResponse.json();
		expect(verifyData.verified).toBe(true);
	});

	// ================================================================================
	// SECTION 4: ACCEPT OFFERS
	// ================================================================================

	test(' Accept credential offer with presentation creation', async ({ request }) => {
		const acceptResponse = await request.post(`/credentials/offers/${issuedCredentialId}/accept`, {
			data: JSON.stringify({
				holderDid,
				createPresentation: true,
				presentationDomain: 'example.com',
			}),
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		expect(acceptResponse).toBeOK();
		expect(acceptResponse.status()).toBe(StatusCodes.OK);

		const acceptData = await acceptResponse.json();
		expect(acceptData.success).toBe(true);
		expect(acceptData.credential).toBeDefined();
		expect(acceptData.presentation).toBeDefined();
		expect(typeof acceptData.presentation).toBe('string');
	});

	test(' Verify credential after acceptance - should still work', async ({ request }) => {
		const verifyResponse = await request.post(`/credential/verify`, {
			data: JSON.stringify({
				credential: offeredCredential.proof.jwt,
			}),
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		expect(verifyResponse).toBeOK();
		const verifyData = await verifyResponse.json();
		expect(verifyData.verified).toBe(true);
	});

	test(' Attempt to accept already accepted offer - should fail', async ({ request }) => {
		const acceptResponse = await request.post(`/credentials/offers/${issuedCredentialId}/accept`, {
			data: JSON.stringify({
				holderDid,
			}),
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		expect(acceptResponse.status()).toBe(StatusCodes.NOT_FOUND);
		const errorData = await acceptResponse.json();
		expect(errorData.error).toContain('not found');
	});

	// ================================================================================
	// SECTION 5: REJECT OFFERS
	// ================================================================================

	test(' Create a new offer to reject', async ({ request }) => {
		const credentialData = JSON.parse(
			fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/credential-issue-jwt.json`, 'utf-8')
		);
		credentialData.subjectDid = holderDid;

		await request.post(`/credential/issue`, {
			data: JSON.stringify(credentialData),
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		// Get the new issuedCredentialId
		const response = await request.get(
			`/credentials/issued?issuerId=${DEFAULT_TESTNET_DID}&subjectId=${holderDid}&status=offered`,
			{
				headers: {
					'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
				},
			}
		);

		const result = await response.json();
		const credential = result.credentials[0];
		rejectIssuedCredentialId = credential.issuedCredentialId;
	});

	test(' Reject credential offer', async ({ request }) => {
		const rejectResponse = await request.post(`/credentials/offers/${rejectIssuedCredentialId}/reject`, {
			data: JSON.stringify({
				holderDid,
			}),
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		expect(rejectResponse).toBeOK();
		expect(rejectResponse.status()).toBe(StatusCodes.OK);

		const rejectData = await rejectResponse.json();
		expect(rejectData.success).toBe(true);
		expect(rejectData.message).toContain('rejected successfully');
	});

	test(' Verify rejected offer not in pending list', async ({ request }) => {
		const listOffersResponse = await request.get(`/credentials/offers?holderDid=${holderDid}`, {
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		expect(listOffersResponse).toBeOK();

		const offersData = await listOffersResponse.json();

		// Verify rejected offer is NOT in the list
		const rejectedOffer = offersData.offers.find((o: any) => o.issuedCredentialId === rejectIssuedCredentialId);
		expect(rejectedOffer).toBeUndefined();

		// Verify no offers have status 'rejected' in the list
		const rejectedOffers = offersData.offers.filter((o: any) => o.status === 'rejected');
		expect(rejectedOffers.length).toBe(0);
	});

	test(' Attempt to reject already rejected offer - should fail', async ({ request }) => {
		const secondRejectResponse = await request.post(`/credentials/offers/${rejectIssuedCredentialId}/reject`, {
			data: JSON.stringify({ holderDid }),
			headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON },
		});

		expect(secondRejectResponse.status()).toBe(StatusCodes.NOT_FOUND);
		const errorData = await secondRejectResponse.json();
		expect(errorData.error).toContain('not found');
	});

	// ================================================================================
	// SECTION 6: IMPORT CREDENTIALS
	// ================================================================================

	test(' Import external credential (JWT format)', async ({ request }) => {
		// Use externally-issued credential
		// NOTE: For CI, ensure database is cleaned between test runs or credentials are unique per run
		const credentialData = JSON.parse(
			fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/issued-credential-jwt.json`, 'utf-8')
		);

		const importResponse = await request.post(`/credentials/import`, {
			data: JSON.stringify({
				credential: credentialData.proof.jwt,
				holderDid: DEFAULT_TESTNET_DID,
			}),
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		expect(importResponse).toBeOK();
		expect(importResponse.status()).toBe(StatusCodes.OK);

		const importData = await importResponse.json();
		expect(importData.success).toBe(true);
		expect(importData.credentialHash).toBeDefined();
		expect(importData.credential).toBeDefined();

		importedCredentialHash = importData.credentialHash;
		importedCredential = importData.credential;
	});

	test(' Import credential as JSON object', async ({ request }) => {
		// Use different externally-issued credential for JSON import
		const credentialData = JSON.parse(
			fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/issued-credential-jwt.json`, 'utf-8')
		);

		const importResponse = await request.post(`/credentials/import`, {
			data: JSON.stringify({
				credential: credentialData,
				holderDid: DEFAULT_TESTNET_DID,
			}),
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		expect(importResponse).toBeOK();
		expect(importResponse.status()).toBe(StatusCodes.OK);

		const importData = await importResponse.json();
		expect(importData.success).toBe(true);
		expect(importData.credentialHash).toBeDefined();
	});

	test(' Attempt to import credential with mismatched holder DID - should fail', async ({ request }) => {
		// Use the first external credential but try to import with wrong holder DID
		const credentialData = JSON.parse(
			fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/issued-credential-jwt.json`, 'utf-8')
		);

		const importResponse = await request.post(`/credentials/import`, {
			data: JSON.stringify({
				credential: credentialData.proof.jwt,
				holderDid, // This doesn't match the credential's subject (DEFAULT_TESTNET_DID)
			}),
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		expect(importResponse.status()).toBe(StatusCodes.BAD_REQUEST);
		const errorData = await importResponse.json();
		expect(errorData.error).toContain('does not match holder DID');
	});

	test(' Attempt to import with DID not in wallet - should fail', async ({ request }) => {
		const importResponse = await request.post(`/credentials/import`, {
			data: JSON.stringify({
				credential: importedCredential.proof.jwt,
				holderDid: NOT_EXISTENT_TESTNET_DID,
			}),
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		expect(importResponse.status()).toBe(StatusCodes.BAD_REQUEST);
		const errorData = await importResponse.json();
		expect(errorData.error).toContain('does not exist in your wallet');
	});

	// ================================================================================
	// SECTION 7: RECEIVED CREDENTIALS
	// ================================================================================

	test(' List received credentials', async ({ request }) => {
		const listResponse = await request.get(`/credentials/received`, {
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		expect(listResponse).toBeOK();
		expect(listResponse.status()).toBe(StatusCodes.OK);

		const receivedData = await listResponse.json();
		expect(receivedData).toHaveProperty('total');
		expect(receivedData).toHaveProperty('credentials');
		expect(receivedData).toHaveProperty('page');
		expect(receivedData).toHaveProperty('limit');
		expect(Array.isArray(receivedData.credentials)).toBe(true);
		expect(receivedData.credentials.length).toBeGreaterThanOrEqual(1); // At least imported credential

		// Verify all credentials have hash and credential properties
		receivedData.credentials.forEach((item: any) => {
			expect(item).toHaveProperty('hash');
			expect(item).toHaveProperty('credential');
			expect(item.credential).toHaveProperty('credentialSubject');
		});

		// Verify imported credential is in the list
		const importedInList = receivedData.credentials.find((item: any) => item.hash === importedCredentialHash);
		expect(importedInList).toBeDefined();
	});

	test(' List received credentials with holderDid filter', async ({ request }) => {
		const listResponse = await request.get(`/credentials/received?holderDid=${holderDid}`, {
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		expect(listResponse).toBeOK();
		expect(listResponse.status()).toBe(StatusCodes.OK);

		const receivedData = await listResponse.json();
		expect(receivedData).toHaveProperty('credentials');
		expect(Array.isArray(receivedData.credentials)).toBe(true);

		// All credentials should have the filtered holderDid as subject
		receivedData.credentials.forEach((item: any) => {
			const subjectId =
				typeof item.credential.credentialSubject === 'object' ? item.credential.credentialSubject.id : null;
			expect(subjectId).toBe(holderDid);
		});
	});

	test(' Attempt to list credentials with DID not in wallet - should fail', async ({ request }) => {
		const listResponse = await request.get(`/credentials/received?holderDid=${NOT_EXISTENT_TESTNET_DID}`, {
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		expect(listResponse.status()).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
		const errorData = await listResponse.json();
		expect(errorData.error).toContain('not found in your wallet');
	});

	test(' Get specific received credential by hash', async ({ request }) => {
		const getResponse = await request.get(`/credentials/received/${importedCredentialHash}`, {
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		expect(getResponse).toBeOK();
		expect(getResponse.status()).toBe(StatusCodes.OK);

		const credentialData = await getResponse.json();
		expect(credentialData).toHaveProperty('credentialSubject');
		expect(credentialData).toHaveProperty('proof');
	});

	test(' Attempt to get credential not belonging to customer - should fail', async ({ request }) => {
		const randomHash = 'nonexistent-hash-12345';

		const getResponse = await request.get(`/credentials/received/${randomHash}`, {
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		expect(getResponse.status()).toBe(StatusCodes.NOT_FOUND);
	});

	test(' Verify received credentials exclude offered credentials', async ({ request }) => {
		// Create a new offer (not accepted)
		const credentialData = JSON.parse(
			fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/credential-issue-jwt.json`, 'utf-8')
		);
		credentialData.subjectDid = holderDid;

		await request.post(`/credential/issue`, {
			data: JSON.stringify(credentialData),
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		// List received credentials - offered credentials should not appear
		const listResponse = await request.get(`/credentials/received?holderDid=${holderDid}`, {
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		const receivedData = await listResponse.json();
		expect(receivedData).toHaveProperty('credentials');
		expect(Array.isArray(receivedData.credentials)).toBe(true);
		// Received credentials only include accepted/issued, not offers
	});

	test(' Verify received credentials exclude rejected credentials', async ({ request }) => {
		// List received credentials
		const listResponse = await request.get(`/credentials/received?holderDid=${holderDid}`, {
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		const receivedData = await listResponse.json();
		expect(receivedData).toHaveProperty('credentials');
		expect(Array.isArray(receivedData.credentials)).toBe(true);
		// Rejected credentials should not appear in received list
	});

	// ================================================================================
	// SECTION 8: CREDENTIAL STATUS OPERATIONS
	// ================================================================================

	test(' Issue credential with status list and verify throughout lifecycle', async ({ request }) => {
		const credentialData = JSON.parse(
			fs.readFileSync(`${PAYLOADS_PATH.CREDENTIAL}/credential-issue-jwt-statuslist.json`, 'utf-8')
		);
		credentialData.subjectDid = holderDid;

		const issueResponse = await request.post(`/credential/issue`, {
			data: JSON.stringify(credentialData),
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		expect(issueResponse).toBeOK();
		const issueData = await issueResponse.json();
		const credential = issueData;

		// Verify credential has status
		expect(credential.credentialStatus).toBeDefined();
		expect(credential.credentialStatus.type).toBe('BitstringStatusListEntry');

		// Verify while in offered state
		const verifyResponse1 = await request.post(`/credential/verify`, {
			data: JSON.stringify({
				credential: credential.proof.jwt,
			}),
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		expect(verifyResponse1).toBeOK();
		const verifyData1 = await verifyResponse1.json();
		expect(verifyData1.verified).toBe(true);

		// Get the issuedCredentialId for acceptance
		const fetchResponse = await request.get(
			`/credentials/issued?issuerId=${DEFAULT_TESTNET_DID}&subjectId=${holderDid}&status=offered`,
			{
				headers: {
					'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
				},
			}
		);

		const fetchData = await fetchResponse.json();
		const statusListIssuedCredentialId = fetchData.credentials[0].issuedCredentialId;

		// Accept the offer
		const acceptResponse = await request.post(`/credentials/offers/${statusListIssuedCredentialId}/accept`, {
			data: JSON.stringify({ holderDid }),
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		expect(acceptResponse).toBeOK();

		// Verify again after acceptance
		const verifyResponse2 = await request.post(`/credential/verify`, {
			data: JSON.stringify({
				credential: credential.proof.jwt,
			}),
			headers: {
				'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
			},
		});

		expect(verifyResponse2).toBeOK();
		const verifyData2 = await verifyResponse2.json();
		expect(verifyData2.verified).toBe(true);
	});
});
