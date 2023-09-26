import { test, expect } from '@playwright/test';
import { DEFAULT_CONTEXT, ID_TYPE, NETWORK, VERIFICATION_METHOD_TYPES } from '../constants';
import { StatusCodes } from 'http-status-codes';
import { buildSimpleService } from 'helpers';

test.use({ storageState: 'playwright/.auth/user.json' });

test('[Positive] It can create DID with mandatory properties (Indy style)', async ({ request }) => {
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

test('[Positive] It can create DID with mandatory and optional properties (UUID style)', async ({ request }) => {
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
    const resolvedDid = await request.get(`/did/search/${body.did}`, {
        headers: { 'Content-Type': 'application/json' }
    });
    expect(resolvedDid.status()).toBe(StatusCodes.OK);

    const didDocument = (await resolvedDid.json()).didDocument;

    // check optional properties
    expect(didDocument.verificationMethod[0].type).toBe(VERIFICATION_METHOD_TYPES.Ed25519VerificationKey2020);
    expect(didDocument.service[0].id).toBe(`${body.did}#service-1`);
    expect(didDocument.service[0].type).toBe("LinkedDomains");
    expect(didDocument.service[0].serviceEndpoint[0]).toBe("https://example.com");
});
