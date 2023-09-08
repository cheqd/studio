import {
    DID_METHOD,
    TESTNET_DID,
    TESTNET_DID_FRAGMENT,
    TESTNET_DID_IDENTIFIER,
    APPLICATION_DID_LD_JSON,
    TESTNET_DID_CREATED_TIME
} from '../constants';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';

test('[Positive] It can search with an existent DID', async ({ request }) => {
    const response = await request.get(`/did/search/${TESTNET_DID}`);
    expect(response.status()).toBe(StatusCodes.OK);

    const body = await response.json();
    const expected = {
        didResolutionMetadata: {
            contentType: APPLICATION_DID_LD_JSON,
            did: {
                didString: TESTNET_DID,
                methodSpecificId: TESTNET_DID_IDENTIFIER,
                method: DID_METHOD
            }
        },
        didDocumentMetadata: {
            created: TESTNET_DID_CREATED_TIME
        }
    };

    expect(body.didResolutionMetadata.contentType).toBe(expected.didResolutionMetadata.contentType);
    expect(body.didResolutionMetadata.did).toStrictEqual(expected.didResolutionMetadata.did);
    expect(body.didDocument.id).toBe(TESTNET_DID);
    expect(body.didDocumentMetadata.created).toBe(expected.didDocumentMetadata.created);
});

test('[Positive] It can search with an existent DID and metadata=true query parameter', async ({ request }) => {
    const response = await request.get(`/did/search/${TESTNET_DID}?metadata=true`);
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
});

test('[Positive] It can search with an existent DID and fragment', async ({ request }) => {
    const hashTag = '%23';
    const url = `/did/search/${TESTNET_DID}${encodeURI(hashTag)}${TESTNET_DID_FRAGMENT}`;
    const response = await request.get(url);
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
            id: `${TESTNET_DID}#${TESTNET_DID_FRAGMENT}`
        },
        contentMetadata: {
            created: TESTNET_DID_CREATED_TIME
        }
    };

    expect(body.dereferencingMetadata.contentType).toBe(expected.dereferencingMetadata.contentType);
    expect(body.dereferencingMetadata.did).toStrictEqual(expected.dereferencingMetadata.did);
    expect(body.contentStream.id).toBe(expected.contentStream.id);
    expect(body.contentMetadata.created).toBe(expected.contentMetadata.created);
});
