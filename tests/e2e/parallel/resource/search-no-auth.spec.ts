import {
	CONTENT_TYPE,
	TESTNET_RESOURCE_JSON,
	DEFAULT_TESTNET_DID_IDENTIFIER,
	DID_METHOD,
	DEFAULT_TESTNET_DID,
	NOT_EXISTENT_TESTNET_DID,
	NOT_EXISTENT_RESOURCE_ID,
	NOT_EXISTENT_TESTNET_DID_IDENTIFIER,
	DID_NOT_FOUND_ERROR,
	TESTNET_DID_WITH_IMAGE_RESOURCE,
	TESTNET_DID_WITH_IMAGE_RESOURCE_ID,
	TESTNET_DID_WITH_JSON_RESOURCE_ID,
	TESTNET_DID_WITH_JSON_RESOURCE,
} from '../../constants';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';

test('[Positive] It can search resource with an existent DID and resourceId. Resource: JSON', async ({ request }) => {
	const response = await request.get(
		`/resource/search/${TESTNET_DID_WITH_JSON_RESOURCE}?resourceId=${TESTNET_DID_WITH_JSON_RESOURCE_ID}`
	);
	expect(response.status()).toBe(StatusCodes.OK);

	const body = (await response.body()).toString();

	expect(body).toEqual(TESTNET_RESOURCE_JSON);
	const headers = response.headers();
	expect(headers['content-type']).toBe('application/json; charset=utf-8');
});

test('[Positive] It can search resource with an existent DID and resourceId.Resource is image and MIME type image', async ({
	request,
}) => {
	const response = await request.get(
		`/resource/search/${TESTNET_DID_WITH_IMAGE_RESOURCE}?resourceId=${TESTNET_DID_WITH_IMAGE_RESOURCE_ID}`
	);
	expect(response.status()).toBe(StatusCodes.OK);

	const headers = response.headers();

	expect(headers['content-type']).toBe('image/png; charset=utf-8');
});

test('[Positive] It can search resource with an existent DID and resourceMetadata=true query parameter', async ({
	request,
}) => {
	const response = await request.get(`/resource/search/${DEFAULT_TESTNET_DID}?resourceMetadata=true`);
	expect(response.status()).toBe(StatusCodes.OK);

	const body = await response.json();

	expect(body.dereferencingMetadata.contentType).toBe(CONTENT_TYPE.APPLICATION_LD_JSON);
	expect(body.dereferencingMetadata.did.didString).toStrictEqual(DEFAULT_TESTNET_DID);
	expect(body.dereferencingMetadata.did.methodSpecificId).toBe(DEFAULT_TESTNET_DID_IDENTIFIER);
	expect(body.dereferencingMetadata.did.method).toBe(DID_METHOD);
	expect(body.contentStream).not.toBeNull();
	expect(body.contentMetadata).not.toBeNull();
});

test('[Negative] It cannot search not existent {did} and {resourceId}', async ({ request }) => {
	const response = await request.get(
		`/did/search/${NOT_EXISTENT_TESTNET_DID}?` + `resourceId=${NOT_EXISTENT_RESOURCE_ID}`
	);
	expect(response.status()).toBe(StatusCodes.NOT_FOUND);

	const body = await response.json();

	expect(body.dereferencingMetadata.contentType).toBe(CONTENT_TYPE.APPLICATION_LD_JSON);
	expect(body.dereferencingMetadata.did.didString).toStrictEqual(NOT_EXISTENT_TESTNET_DID);
	expect(body.dereferencingMetadata.did.methodSpecificId).toBe(NOT_EXISTENT_TESTNET_DID_IDENTIFIER);
	expect(body.dereferencingMetadata.did.method).toBe(DID_METHOD);
	expect(body.dereferencingMetadata.error).toBe(DID_NOT_FOUND_ERROR);
	expect(body.contentStream).toBeNull();
	expect(body.contentMetadata).not.toBeNull();
});
