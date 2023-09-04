import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import { TESTNET_DID, TESTNET_DID_FRAGMENT } from '../constants';

test('/did/search/{did} endpoint', async ({ request }) => {
    const response = await request.get(`/did/search/${TESTNET_DID}`);
    expect(response.ok()).toBeTruthy();
    
    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync('./tests/unauthorized/payloads/did-search/resolve-did.json', 'utf-8'));

    expect(body['@context']).toStrictEqual(expected['@context']);
    expect(body.didResolutionMetadata.did).toStrictEqual(expected.didResolutionMetadata.did);
    expect(body.didDocument).toStrictEqual(expected.didDocument);
    expect(body.didDocumentMetadata).toStrictEqual(expected.didDocumentMetadata);
});

test('/did/search/{did} with metadata query parameter', async ({ request }) => {
    const response = await request.get(`/did/search/${TESTNET_DID}?metadata=true`);
    expect(response.ok()).toBeTruthy();
    
    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync('./tests/unauthorized/payloads/did-search/did-metadata.json', 'utf-8'));

    expect(body['@context']).toStrictEqual(expected['@context']);
    expect(body.dereferencingMetadata.did).toStrictEqual(expected.dereferencingMetadata.did);
    expect(body.contentStream).toStrictEqual(expected.contentStream);
    expect(body.contentMetadata).toStrictEqual(expected.contentMetadata);
});

test('/did/search/{did#fragment-id}', async ({ request }) => {
    // change hashTag value
    const hashTag = '%2523';
    const url = `/did/search/${TESTNET_DID}${hashTag}${TESTNET_DID_FRAGMENT}`;
    const response = await request.get(url);
    expect(response.ok()).toBeTruthy();

    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync('./tests/unauthorized/payloads/did-search/did-fragment.json', 'utf-8'));

    expect(body['@context']).toStrictEqual(expected['@context']);
    expect(body.dereferencingMetadata.did).toStrictEqual(expected.dereferencingMetadata.did);
    expect(body.contentStream).toStrictEqual(expected.contentStream);
    expect(body.contentMetadata).toStrictEqual(expected.contentMetadata);
});
