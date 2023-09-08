import {
    DID_METHOD,
    APPLICATION_DID_LD_JSON,
    NOT_EXISTENT_RESOURCE_ID,
    NOT_EXISTENT_TESTNET_DID,
    NOT_EXISTENT_TESTNET_DID_IDENTIFIER
} from '../constants';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';

test('[Negative] It cannot search not existent {did} and {resourceId}', async ({ request }) => {
    const response = await request.get(
        `/did/search/${NOT_EXISTENT_TESTNET_DID}?` +
        `resourceId=${NOT_EXISTENT_RESOURCE_ID}`
    );
    expect(response.status()).toBe(StatusCodes.NOT_FOUND);

    const body = await response.json();
    const expected = {
        dereferencingMetadata: {
            contentType: APPLICATION_DID_LD_JSON,
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
