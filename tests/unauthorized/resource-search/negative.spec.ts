import * as fs from 'fs';
import { test, expect } from '@playwright/test';
import { NOT_EXISTENT_RESOURCE_ID, NOT_EXISTENT_TESTNET_DID } from '../constants';
import { StatusCodes } from 'http-status-codes';

test('[Negative] It cannot search not existent {did} and {resourceId}', async ({ request }) => {
    const response = await request.get(
        `/did/search/${NOT_EXISTENT_TESTNET_DID}?` + 
        `resourceId=${NOT_EXISTENT_RESOURCE_ID}`
    );
    expect(response.status()).toBe(StatusCodes.NOT_FOUND);
    
    const body = await response.json();
    const expected = JSON.parse(
        fs.readFileSync('./tests/unauthorized/payloads/resource-search/not-existent-resource.json', 'utf-8')
    );

    expect(body.dereferencingMetadata.did).toStrictEqual(expected.dereferencingMetadata.did);
    expect(body.contentStream).toStrictEqual(expected.contentStream);
    expect(body.contentMetadata).toStrictEqual(expected.contentMetadata);
});
