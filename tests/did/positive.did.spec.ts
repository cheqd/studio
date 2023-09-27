import { test, expect } from '@playwright/test';
import { DEFAULT_CONTEXT, ID_TYPE, NETWORK, VERIFICATION_METHOD_TYPES } from '../constants';
import { StatusCodes } from 'http-status-codes';
import { buildSimpleService } from 'helpers';
import { v4 } from 'uuid';

test.use({ storageState: 'playwright/.auth/user.json' });

test('[Positive] It can create DID with mandatory properties (Form based + Indy style)', async ({ request }) => {
    // send request to create DID
    let response = await request.post(`/did/create`, {
        data: `network=${NETWORK.TESTNET}&identifierFormatType=${ID_TYPE.BASE58BTC}&` +
            `verificationMethodType=${VERIFICATION_METHOD_TYPES.Ed25519VerificationKey2020}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    // resolve a created DID
    response = await request.get(`/did/search/${(await response.json()).did}`, {
        headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    const didDocument = (await response.json()).didDocument;

    // Check mandatory properties
    expect(didDocument.id.split(":")[2]).toBe(NETWORK.TESTNET);
    // TODO: Add check for checking ID is Indy Style identifier
    expect(didDocument.verificationMethod[0].type).toBe(VERIFICATION_METHOD_TYPES.Ed25519VerificationKey2020);
});

test('[Positive] It can create DID with mandatory and optional properties (Form based + UUID style)', async ({ request }) => {
    // send request to create key
    let response = await request.post('/key/create', {
        headers: { "Content-Type": "application/json" }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    const kid = (await response.json()).kid;

    // send request to create DID
    response = await request.post(`/did/create`, {
        data: `network=${NETWORK.TESTNET}&identifierFormatType=${ID_TYPE.BASE58BTC}&` +
            `verificationMethodType=${VERIFICATION_METHOD_TYPES.Ed25519VerificationKey2020}&` +
            `service=${JSON.stringify(buildSimpleService())}&key=${kid}&@context=${DEFAULT_CONTEXT}`,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    const body = await response.json();

    // Check mandatory properties
    expect(body.did.split(":")[2]).toBe(NETWORK.TESTNET);
    // TODO: Add check for checking ID is UUID identifier
    expect(body.controllerKeyId).toBe(kid);

    // resolve a created DID
    response = await request.get(`/did/search/${body.did}`, {
        headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    const didDocument = (await response.json()).didDocument;

    // check optional properties
    expect(didDocument.verificationMethod[0].type).toBe(VERIFICATION_METHOD_TYPES.Ed25519VerificationKey2020);
    expect(didDocument.service[0].id).toBe(`${body.did}#service-1`);
    expect(didDocument.service[0].type).toBe("LinkedDomains");
    expect(didDocument.service[0].serviceEndpoint[0]).toBe("https://example.com");
});

test('[Positive] It can create  DID with mandatory properties (JSON based + Indy style)', async ({ request }) => {
    // send request to create DID
    // let response = await request.post('/did/create', {
    //     data: {
    //         network: NETWORK.TESTNET,
    //         identifierFormatType: ID_TYPE.BASE58BTC,
    //         options: {
    //             verificationMethodType: VERIFICATION_METHOD_TYPES.Ed25519VerificationKey2020
    //         },
    //         didDocument: {
    //             id: "", // how to generate Indy style identifier?
    //             controller: [{
    //                 // your did
    //             }],
    //             authentication: [{
    //                 // your did+#key-1
    //             }]
    //         }
    //     },
    //     headers: { "Content-Type": "application/json" }
    // });
    // expect(response.status()).toBe(StatusCodes.OK);

    // // resolve a created DID
    // response = await request.get(`/did/search/${(await response.json()).did}`, {
    //     headers: { 'Content-Type': 'application/json' }
    // });
    // expect(response.status()).toBe(StatusCodes.OK);

    // const didDocument = (await response.json()).didDocument;

    // // Check mandatory properties
    // expect(didDocument.id.split(":")[2]).toBe(NETWORK.TESTNET);
    // // TODO: Add check for checking ID is Indy Style identifier
    // expect(didDocument.verificationMethod[0].type).toBe(VERIFICATION_METHOD_TYPES.Ed25519VerificationKey2020);
});

test('[Positive] It can create DID with mandatory and optional properties (JSON based + UUID style)', async ({ request }) => {
    // send request to create key
    let response = await request.post('/key/create', {
        headers: { "Content-Type": "application/json" }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    const kid = (await response.json()).kid;

    const did = `did:cheqd:testnet:${v4()}`;
    response = await request.post('/did/create', {
        data: {
            network: NETWORK.TESTNET,
            identifierFormatType: ID_TYPE.UUID,
            assertionMethod: true,
            options: {
                verificationMethodType: VERIFICATION_METHOD_TYPES.JsonWebKey2020,
                key: kid
            },
            didDocument: {
                "@context": [
                    "https://www.w3.org/ns/did/v1"
                ],
                id: did,
                controller: [
                    did
                ],
                authentication: [
                    `${did}#key-1`
                ],
                service: [{
                    id: `${did}#service-1`,
                    type: "LinkedDomains",
                    serviceEndpoint: [
                        "https://example.com"
                    ]
                }]
            }
        },
        headers: { "Content-Type": "application/json" }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    // resolve a created DID
    response = await request.get(`/did/search/${(did)}`, {
        headers: { 'Content-Type': 'application/json' }
    });
    expect(response.status()).toBe(StatusCodes.OK);

    const didDocument = (await response.json()).didDocument;

    // check optional properties
    expect(didDocument.verificationMethod[0].type).toBe(VERIFICATION_METHOD_TYPES.JsonWebKey2020);
    expect(didDocument.service[0].id).toBe(`${did}#service-1`);
    expect(didDocument.service[0].type).toBe("LinkedDomains");
    expect(didDocument.service[0].serviceEndpoint[0]).toBe("https://example.com");
});
