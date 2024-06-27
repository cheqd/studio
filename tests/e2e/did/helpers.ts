import { expect, APIRequestContext } from '@playwright/test';

import { DIDDocument } from '@cheqd/sdk';
import { CreateDidResponseBody, UpdateDidResponseBody } from '@cheqd/studio/src/types/did';

// Structures
export type ResponseBody = CreateDidResponseBody | UpdateDidResponseBody;

// Helpers
export async function searchDID(did: string, request: APIRequestContext): Promise<DIDDocument> {
	const response = await request.get(`/did/search/${did}`);
	expect(response).toBeOK();

	return await response.json().then((result) => result.didDocument);
}

export async function isDeactivated(did: string, request: APIRequestContext): Promise<boolean> {
	const response = await request.get(`/did/search/${did}`);
	expect(response).toBeOK();

	return await response.json().then((result) => JSON.parse(result.didDocumentMetadata.deactivated));
}

export function mustIncludeKey(didResponse: ResponseBody, keyRef: string) {
	expect(didResponse.controllerKeys.some((key) => key.kid === keyRef)).toBeTruthy();
}

export function mustIncludeKeyControllerRef(didResponse: ResponseBody, keyRef: string) {
	expect(didResponse.controllerKeyRefs.some((key) => key === keyRef)).toBeTruthy();
}

export function mustAllControllerKeysHaveController(didResponse: ResponseBody) {
	expect(didResponse.controllerKeys.every((key) => Object.keys(key).includes('controller'))).toBeTruthy();
}
