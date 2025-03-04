import {
	DID_METHOD,
	DEFAULT_TESTNET_DID,
	CONTENT_TYPE,
	TESTNET_DID_FRAGMENT,
	DEFAULT_TESTNET_DID_IDENTIFIER,
	NOT_EXISTENT_TESTNET_DID,
	STORAGE_STATE_UNAUTHENTICATED,
	DID_NOT_FOUND_ERROR,
} from '../../constants';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';

test.use({ storageState: STORAGE_STATE_UNAUTHENTICATED });

test('[Positive] It can search with an existent DID', async ({ request }) => {
	const response = await request.get(`/did/search/${DEFAULT_TESTNET_DID}`);

	expect(response).toBeOK();

	const body = await response.json();

	expect(body.didResolutionMetadata.contentType).toBe(CONTENT_TYPE.APPLICATION_LD_JSON);
	expect(body.didResolutionMetadata.did.didString).toStrictEqual(DEFAULT_TESTNET_DID);
	expect(body.didResolutionMetadata.did.methodSpecificId).toBe(DEFAULT_TESTNET_DID_IDENTIFIER);
	expect(body.didResolutionMetadata.did.method).toBe(DID_METHOD);
});

test('[Positive] It can search with an existent DID and metadata=true query parameter', async ({ request }) => {
	const response = await request.get(`/did/search/${DEFAULT_TESTNET_DID}?metadata=true`);
	expect(response).toBeOK();

	const body = await response.json();

	expect(body.didResolutionMetadata.contentType).toBe(CONTENT_TYPE.APPLICATION_LD_JSON);
	expect(body.didResolutionMetadata.did.didString).toStrictEqual(DEFAULT_TESTNET_DID);
	expect(body.didResolutionMetadata.did.methodSpecificId).toBe(DEFAULT_TESTNET_DID_IDENTIFIER);
	expect(body.didResolutionMetadata.did.method).toBe(DID_METHOD);
	expect(body.didDocumentMetadata).not.toBeNull();
});

test('[Positive] It can search with an existent DID and fragment', async ({ request }) => {
	const hashTag = '%23';
	const url = `/did/search/${DEFAULT_TESTNET_DID}${encodeURI(hashTag)}${TESTNET_DID_FRAGMENT}`;
	const response = await request.get(url);

	expect(response).toBeOK();

	const body = await response.json();

	expect(body.dereferencingMetadata.contentType).toBe(CONTENT_TYPE.APPLICATION_LD_JSON);
	expect(body.dereferencingMetadata.did.didString).toStrictEqual(DEFAULT_TESTNET_DID);
	expect(body.dereferencingMetadata.did.methodSpecificId).toBe(DEFAULT_TESTNET_DID_IDENTIFIER);
	expect(body.dereferencingMetadata.did.method).toBe(DID_METHOD);
	expect(body.contentMetadata).not.toBeNull();
	expect(body.contentStream).not.toBeNull();
	expect(body.contentStream.id).toBe(`${DEFAULT_TESTNET_DID}#${TESTNET_DID_FRAGMENT}`);
});

test('[Negative] It cannot search not existent DID', async ({ request }) => {
	const response = await request.get(`/did/search/${NOT_EXISTENT_TESTNET_DID}`);
	expect(response.status()).toBe(StatusCodes.NOT_FOUND);

	const body = await response.json();
	expect(body.didResolutionMetadata.error).toBe(DID_NOT_FOUND_ERROR);
});
