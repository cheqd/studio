import {
    DID_METHOD,
    APPLICATION_DID_LD_JSON,
    NOT_EXISTENT_TESTNET_DID,
    NOT_EXISTENT_TESTNET_DID_IDENTIFIER,
} from '../../constants';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';

test('[Negative] It cannot search not existent DID', async ({ request }) => {
    const response = await request.get(`/did/search/${NOT_EXISTENT_TESTNET_DID}`);
    expect(response.status()).toBe(StatusCodes.NOT_FOUND);

    const body = await response.json();
    const expected = {
        didResolutionMetadata: {
            contentType: APPLICATION_DID_LD_JSON,
            error: "notFound",
            did: {
                didString: NOT_EXISTENT_TESTNET_DID,
                methodSpecificId: NOT_EXISTENT_TESTNET_DID_IDENTIFIER,
                method: DID_METHOD
            }
        },
        didDocument: null,
        didDocumentMetadata: {}
    };

    expect(body.didResolutionMetadata.contentType).toBe(expected.didResolutionMetadata.contentType);
    expect(body.didResolutionMetadata.error).toBe(expected.didResolutionMetadata.error);
    expect(body.didResolutionMetadata.did).toStrictEqual(expected.didResolutionMetadata.did);
    expect(body.didDocument).toBe(expected.didDocument);
    expect(body.didDocumentMetadata).toStrictEqual(expected.didDocumentMetadata);
});
