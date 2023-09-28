import { test, expect } from '@playwright/test';
import { ID_TYPE, INVALID_DID, INVALID_ID, NETWORK, NOT_EXISTENT_KEY, NOT_SUPPORTED_VERIFICATION_METHOD_TYPE, VERIFICATION_METHOD_TYPES } from '../constants';
import { StatusCodes } from 'http-status-codes';
import { v4 } from 'uuid';

test.use({ storageState: 'playwright/.auth/user.json' });

test('[Negative] It cannot create DID with missed verificationMethodType field in request body (Form based)', async ({ request }) => {
    const response = await request.post(`/did/create`, {
        data: `network=${NETWORK.TESTNET}&identifierFormatType=${ID_TYPE.BASE58BTC}&]`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    expect(response.status()).toBe(StatusCodes.BAD_REQUEST);
    // TODO: change error message
    expect(await response.text()).toEqual(expect.stringContaining("Provide a DID Document or the network type to create a DID"));
});

test('[Negative] It cannot create DID with not existent key in request body (Form based)', async ({ request }) => {
    const response = await request.post(`/did/create`, {
        data: `network=${NETWORK.TESTNET}&identifierFormatType=${ID_TYPE.BASE58BTC}&]` + 
        `verificationMethodType=${VERIFICATION_METHOD_TYPES.Ed25519VerificationKey2020}` + 
        `key=${NOT_EXISTENT_KEY}`,
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
    });
    expect(response.status()).toBe(StatusCodes.BAD_REQUEST);
    // TODO: change error message
    expect(await response.text()).toEqual(expect.stringContaining("Provide a DID Document or the network type to create a DID"));
});

test('[Negative] It cannot create DID with not existent key in request body (JSON based)', async ({ request }) => {
    const did = `did:cheqd:testnet:${v4()}`;
    const response = await request.post('/did/create', {
        data: {
            network: NETWORK.TESTNET,
            identifierFormatType: ID_TYPE.UUID,
            options: {
                verificationMethodType: VERIFICATION_METHOD_TYPES.Ed25519VerificationKey2020,
                key: NOT_EXISTENT_KEY
            },
            didDocument: {
                id: did,
                controller: [
                    did
                ],
                authentication: [
                    `${did}#key-1`
                ]
            }
        },
        headers: { "Content-Type": "application/json" }
    });
    // TODO: change status code to 404
    expect(response.status()).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
    expect(await response.text()).toEqual(expect.stringContaining("Key not found"));
});

test('[Negative] It cannot create DID with an invalid VerificationMethodType in request body (JSON based)', async ({ request }) => {
    const did = `did:cheqd:testnet:${v4()}`;
    const response = await request.post('/did/create', {
        data: {
            network: NETWORK.TESTNET,
            identifierFormatType: ID_TYPE.UUID,
            options: {
                verificationMethodType: NOT_SUPPORTED_VERIFICATION_METHOD_TYPE
            },
            didDocument: {
                id: did,
                controller: [
                    did
                ],
                authentication: [
                    `${did}#key-1`
                ]
            }
        },
        headers: { "Content-Type": "application/json" }
    });
    // TODO: change status code
    expect(response.status()).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
    expect(await response.text()).toEqual(expect.stringContaining("Unsupported verificationMethod type"));
});

test('[Negative] It cannot create DID with an invalid length of id in DIDDocument in request body (JSON based)', async ({ request }) => {
    const invalidDidLength = `did:cheqd:testnet:${INVALID_ID}`;
    const response = await request.post('/did/create', {
        data: {
            network: NETWORK.TESTNET,
            identifierFormatType: ID_TYPE.UUID,
            options: {
                verificationMethodType: VERIFICATION_METHOD_TYPES.Ed25519VerificationKey2018
            },
            didDocument: {
                id: invalidDidLength,
                controller: [
                    invalidDidLength
                ],
                authentication: [
                    `${invalidDidLength}#key-1`
                ]
            }
        },
        headers: { "Content-Type": "application/json" }
    });
    // change status code
    expect(response.status()).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
    expect(await response.text()).toEqual(expect.stringContaining("unique id should be one of: 16 bytes of decoded base58 string or UUID"));
});

test('[Negative] It cannot create DID with an invalid id format in DIDDocument in request body (JSON based)', async ({ request }) => {
    const response = await request.post('/did/create', {
        data: {
            network: NETWORK.TESTNET,
            identifierFormatType: ID_TYPE.UUID,
            options: {
                verificationMethodType: VERIFICATION_METHOD_TYPES.Ed25519VerificationKey2018
            },
            didDocument: {
                id: INVALID_DID,
                controller: [
                    INVALID_DID
                ],
                authentication: [
                    `${INVALID_DID}#key-1`
                ]
            }
        },
        headers: { "Content-Type": "application/json" }
    });
    // TODO: change status code
    expect(response.status()).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
    expect(await response.text()).toEqual(expect.stringContaining("unable to split did into method, namespace and id"));
});

test('[Negative] It cannot create DID without VerificationMethodType in request body (JSON based)', async ({ request }) => {
    const response = await request.post('/did/create', {
        data: {
            network: NETWORK.TESTNET,
            identifierFormatType: ID_TYPE.UUID,
            didDocument: {
                id: INVALID_DID,
                controller: [
                    INVALID_DID
                ],
                authentication: [
                    `${INVALID_DID}#key-1`
                ]
            }
        },
        headers: { "Content-Type": "application/json" }
    });
    expect(response.status()).toBe(StatusCodes.BAD_REQUEST);
    // TODO: Change error message
    expect(await response.text()).toEqual(expect.stringContaining("Provide options section to create a DID"));
});

test('[Negative] It cannot create DID without DidDocument in request body (JSON based)', async ({ request }) => {
    const response = await request.post('/did/create', {
        data: {
            network: NETWORK.TESTNET,
            identifierFormatType: ID_TYPE.UUID,
            options: {
                verificationMethodType: VERIFICATION_METHOD_TYPES.Ed25519VerificationKey2020
            },
        },
        headers: { "Content-Type": "application/json" }
    });
    expect(response.status()).toBe(StatusCodes.BAD_REQUEST);
    expect(await response.text()).toEqual(expect.stringContaining("Provide a DID Document or the network type to create a DID"));
});
