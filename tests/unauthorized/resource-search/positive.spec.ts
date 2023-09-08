import {
    APPLICATION_DID_LD_JSON,
    DID_METHOD, TESTNET_DID,
    TESTNET_DID_CREATED_TIME,
    TESTNET_DID_IDENTIFIER,
    TESTNET_DID_RESOURCE_ID,
    TESTNET_RESOURCE
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
            contentType: APPLICATION_DID_LD_JSON,
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
