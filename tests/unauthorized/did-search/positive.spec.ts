import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import { TESTNET_DID } from '../constants';

test('/did/search/{did} endpoint', async ({ request }) => {
    const response = await request.get(`/did/search/${TESTNET_DID}`);
    expect(response.ok()).toBeTruthy();
    
    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync('./tests/unauthorized/payloads/did-search/resolve-did.json', 'utf-8'));

    expect(body.didResolutionMetadata.did).toStrictEqual(expected.didResolutionMetadata.did);
    expect(body.didDocument).toStrictEqual(expected.didDocument);
    expect(body.didDocumentMetadata).toStrictEqual(expected.didDocumentMetadata);
});

test('/did/search/{did} with metadata query parameter', async ({ request }) => {
    const response = await request.get(`/did/search/${TESTNET_DID}?metadata=true`);
    expect(response.ok()).toBeTruthy();
    
    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync('./tests/unauthorized/payloads/did-search/did-metadata.json', 'utf-8'));

    expect(body.dereferencingMetadata.did).toStrictEqual(expected.dereferencingMetadata.did);
    expect(body.contentStream).toStrictEqual(expected.contentStream);
    expect(body.contentMetadata).toStrictEqual(expected.contentMetadata);
})
