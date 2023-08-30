import { test, expect } from '@playwright/test';
import * as fs from 'fs';

export const TESTNET_DID = "did:cheqd:testnet:c1685ca0-1f5b-439c-8eb8-5c0e85ab7cd0";

test('/did/search/{did} endpoint', async ({ request }) => {
    const response = await request.get(`/did/search/${TESTNET_DID}`);
    expect(response.ok()).toBeTruthy();
    
    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync('./tests/authorized/payloads/did-resolve.json', 'utf-8'));

    expect(body.didResolutionMetadata.did).toStrictEqual(expected.didResolutionMetadata.did);
    expect(body.didDocument).toStrictEqual(expected.didDocument);
    expect(body.didDocumentMetadata).toStrictEqual(expected.didDocumentMetadata);
});

test('/did/search/{did} with metadata query parameter', async ({ request }) => {
    const response = await request.get(`/did/search/${TESTNET_DID}?metadata=true`);
    expect(response.ok()).toBeTruthy();
    
    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync('./tests/authorized/payloads/did-metadata.json', 'utf-8'));

    expect(body.dereferencingMetadata.did).toStrictEqual(expected.dereferencingMetadata.did);
    expect(body.contentStream).toStrictEqual(expected.contentStream);
    expect(body.contentMetadata).toStrictEqual(expected.contentMetadata);
})
