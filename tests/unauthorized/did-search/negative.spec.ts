import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import { NOT_EXISTENT_TESTNET_DID } from '../constants';

test('[Negative] It cannot search not existent DID', async ({ request }) => {
    const response = await request.get(`/did/search/${NOT_EXISTENT_TESTNET_DID}`);
    expect(response.status()).toBe(StatusCodes.NOT_FOUND);
    
    const body = await response.json();
    const expected = JSON.parse(fs.readFileSync('./tests/unauthorized/payloads/did-search/not-existent-did.json', 'utf-8'));

    expect(body.didResolutionMetadata.did).toStrictEqual(expected.didResolutionMetadata.did);
    expect(body.didDocument).toStrictEqual(expected.didDocument);
    expect(body.didDocumentMetadata).toStrictEqual(expected.didDocumentMetadata);
});
