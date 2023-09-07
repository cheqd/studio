import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import { TESTNET_DID, TESTNET_DID_RESOURCE_ID } from '../constants';

test('[Positive] It can search existent DID and resourceId', async ({ request }) => {
    const response = await request.get(`/did/search/${TESTNET_DID}?resourceId=${TESTNET_DID_RESOURCE_ID}`);
    expect(response.ok()).toBeTruthy();
    
    const body = (await response.body()).toString();
    const expected = fs.readFileSync('./tests/unauthorized/payloads/resource-search/resource.txt', 'utf-8');

    expect(body).toStrictEqual(expected);
});

test('[Positive] It can search existent DID and resourceMetadata=true query parameter', async ({ request }) => {
    const response = await request.get(`/did/search/${TESTNET_DID}?resourceMetadata=true`);
    expect(response.ok()).toBeTruthy();
    
    const body = await response.json();
    const expected = JSON.parse(
        fs.readFileSync('./tests/unauthorized/payloads/did-search/did-metadata.json', 'utf-8')
    );

    expect(body.dereferencingMetadata.did).toStrictEqual(expected.dereferencingMetadata.did);
    expect(body.contentStream).toStrictEqual(expected.contentStream);
    expect(body.contentMetadata).toStrictEqual(expected.contentMetadata);
})
