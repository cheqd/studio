import {
    CONTENT_TYPE,
    TESTNET_RESOURCE,
    TESTNET_DID_IDENTIFIER,
    TESTNET_DID_RESOURCE_ID,
    DID_METHOD, TESTNET_DID,
    TESTNET_DID_CREATED_TIME,
    NOT_EXISTENT_TESTNET_DID,
    NOT_EXISTENT_RESOURCE_ID,
    NOT_EXISTENT_TESTNET_DID_IDENTIFIER
} from '../constants';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';

test('[Positive] It can search resource with an existent DID and resourceId', async ({ request }) => {
    const response = await request.get(`/resource/search/${TESTNET_DID}?resourceId=${TESTNET_DID_RESOURCE_ID}`);
    expect(response.status()).toBe(StatusCodes.OK);

    const body = (await response.body()).toString();

    expect(body).toEqual(TESTNET_RESOURCE);
});

test('[Positive] It can search resource with an existent DID and resourceMetadata=true query parameter', async ({ request }) => {
    const response = await request.get(`/resource/search/${TESTNET_DID}?resourceMetadata=true`);
    expect(response.status()).toBe(StatusCodes.OK);

    const body = await response.json();
    const expected = {
        dereferencingMetadata: {
            contentType: CONTENT_TYPE.APPLICATION_DID_LD_JSON,
            did: {
                didString: TESTNET_DID,
                methodSpecificId: TESTNET_DID_IDENTIFIER,
                method: DID_METHOD
            }
        },
        contentStream: {
            created: TESTNET_DID_CREATED_TIME
        },
        contentMetadata: {}
    };

    expect(body.dereferencingMetadata.contentType).toBe(expected.dereferencingMetadata.contentType);
    expect(body.dereferencingMetadata.did).toStrictEqual(expected.dereferencingMetadata.did);
    expect(body.contentStream.created).toBe(expected.contentStream.created);
    expect(body.contentMetadata).toStrictEqual(expected.contentMetadata);
})

test('[Negative] It cannot search not existent {did} and {resourceId}', async ({ request }) => {
    const response = await request.get(
        `/did/search/${NOT_EXISTENT_TESTNET_DID}?` +
        `resourceId=${NOT_EXISTENT_RESOURCE_ID}`
    );
    expect(response.status()).toBe(StatusCodes.NOT_FOUND);

    const body = await response.json();
    const expected = {
        dereferencingMetadata: {
            contentType: CONTENT_TYPE.APPLICATION_DID_LD_JSON,
            error: "notFound",
            did: {
                didString: NOT_EXISTENT_TESTNET_DID,
                methodSpecificId: NOT_EXISTENT_TESTNET_DID_IDENTIFIER,
                method: DID_METHOD
            }
        },
        contentStream: null,
        contentMetadata: {}
    };

    expect(body.dereferencingMetadata.contentType).toBe(expected.dereferencingMetadata.contentType);
    expect(body.dereferencingMetadata.error).toBe(expected.dereferencingMetadata.error);
    expect(body.dereferencingMetadata.did).toStrictEqual(expected.dereferencingMetadata.did);
    expect(body.contentStream).toBe(expected.contentStream);
    expect(body.contentMetadata).toStrictEqual(expected.contentMetadata);
});

