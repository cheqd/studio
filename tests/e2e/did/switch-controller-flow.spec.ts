import { ID_TYPE, CONTENT_TYPE } from '../constants';
import { test, expect, APIRequestContext } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';

import { CheqdNetwork, DIDDocument, VerificationMethods } from '@cheqd/sdk';

import { CreateDidResponseBody, UpdateDidResponseBody } from '@cheqd/credential-service/src/types/did';

test.use({ storageState: 'playwright/.auth/user.json' });

// The flow is:
// 1. Create a DID which will be used as an original controller (UUID) . DID-A
// 2. Create a DID which will be used as a new controller (base58). DID-B
// 3. Create a DID which will be used as another new controller (base58). DID-C
// 4. Update the original controller DID with the new controller DID. Adding the new one. Expected amount of controllers: 2. DID-A and DID-B
//    4.1 We expect here to see the list of keys, included all possible keys which can be used for signing. 
//        Also, each element of keys should include `controller` field which will point to the DID with it associated to.
//    4.2 We expect here in response to see the list of controller keyRefs, which are required for signing.
// 5. Create a resource for DID-A.
// 6. Create a resource for DID-B.
// 7. Update the original controller DID with the controller DID-B. Removing the original one. Expected amount of controllers: 1. DID-B
// 8. Create a resource using DID-A.
// 9. Create a resource using DID-B.
// 10. Update controller to the original DID-A. 
//    (Here we wanna to check that DID with replaced controller could be used as a controller for completly another DID). Expected amount of controllers: 1. DID-A
// 11. Create a resource using DID-C.
// 12. Deactivate DID-C.
// 13. Try to set DID-C as a controller for DID-A. Expected error.
// 14. Try to send updated DID Document with empty verificationMEthod list. Expected error.
// 15. Return back te original controller for DID_A Expected amount of controllers: 1
// 16. Create a resource using DID-A, DID-B.

// Structures
type ResponseBody = CreateDidResponseBody | UpdateDidResponseBody;
let DID_A: ResponseBody;
let DID_B: ResponseBody;
let DID_C: ResponseBody;

let DIDDocument_A: DIDDocument;
let DIDDocument_B: DIDDocument;
let DIDDocument_C: DIDDocument;

// Helpers
async function searchDID(did: string, request: APIRequestContext): Promise<DIDDocument> {
	const response = await request.get(`/did/search/${did}`)
	expect(response).toBeOK();

	return await response.json().then(result => result.didDocument)
}

async function isDeactivated(did: string, request: APIRequestContext): Promise<boolean> {
	const response = await request.get(`/did/search/${did}`)
	expect(response).toBeOK();

	return await response.json().then(result => JSON.parse(result.didDocumentMetadata.deactivated))
}

function mustIncludeKey(didResponse: ResponseBody, keyRef: string): boolean {
	return didResponse.controllerKeys.some(key => key.kid === keyRef)
}

function mustIncludeKeyControllerRef(didResponse: ResponseBody, keyRef: string): boolean {
	return didResponse.controllerKeyRefs.some(key => key === keyRef)
}

function allControllerKeysHaveController(didResponse: ResponseBody): boolean {
	return didResponse.controllerKeys.every(key => Object.keys(key).includes('controller'))
}


// Preps
test('1. It creates DID-A', async ({ request }) => {
	// send request to create DID
	const response = await request.post(`/did/create`, {
		data:
			`network=${CheqdNetwork.Testnet}&identifierFormatType=${ID_TYPE.UUID}&` +
			`verificationMethodType=${VerificationMethods.Ed255192018}`,
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_X_WWW_FORM_URLENCODED },
	});
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);

    // use data from the response

    DID_A = await response.json() as ResponseBody;
	expect(DID_A.controllerKeyId).toBeDefined()

	// Additional checks
	// Check that keys in response are the same as in contollerKeys, and controllerKeyRefs except contoller field
	expect(DID_A.keys.length).toBe(DID_A.controllerKeys.length)
	expect(DID_A.controllerKeys.length).toBe(DID_A.controllerKeyRefs.length)
	expect(mustIncludeKey(DID_A, DID_A.controllerKeyId)).toBeTruthy()
	expect(mustIncludeKeyControllerRef(DID_A, DID_A.controllerKeyId)).toBeTruthy()
	expect(allControllerKeysHaveController(DID_A)).toBeTruthy()
	DID_A.controllerKeys.forEach(key => {
		expect(DID_A.keys.some(k => k.kid === key.kid)).toBeTruthy()
	})


	DIDDocument_A = await searchDID(DID_A.did, request)
	expect(DIDDocument_A).toBeDefined()


	console.info(`DIDDocument-A: ${JSON.stringify(DIDDocument_A)}`)
});

test('2. It creates DID-B', async ({ request }) => {
	// send request to create DID
	const response = await request.post(`/did/create`, {
		data:
			`network=${CheqdNetwork.Testnet}&identifierFormatType=${ID_TYPE.BASE58BTC}&` +
			`verificationMethodType=${VerificationMethods.Ed255192018}`,
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_X_WWW_FORM_URLENCODED },
	});
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);

    // use data from the response
    DID_B = await response.json() as ResponseBody;
	expect(DID_B.controllerKeyId).toBeDefined()

	DIDDocument_B = await searchDID(DID_B.did, request)
	expect(DIDDocument_B).toBeDefined()

	console.info(`DIDDocument-B: ${JSON.stringify(DIDDocument_B)}`)
});

test('3. It creates DID-C', async ({ request }) => {
	// send request to create DID
	const response = await request.post(`/did/create`, {
		data:
			`network=${CheqdNetwork.Testnet}&identifierFormatType=${ID_TYPE.BASE58BTC}&` +
			`verificationMethodType=${VerificationMethods.Ed255192018}`,
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_X_WWW_FORM_URLENCODED },
	});
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);

    // use data from the response
    DID_C = await response.json() as ResponseBody;
	expect(DID_C.controllerKeyId).toBeDefined()

	DIDDocument_C = await searchDID(DID_C.did, request)
	expect(DIDDocument_C).toBeDefined()

	console.info(`DIDDocument-C: ${JSON.stringify(DIDDocument_C)}`)
});

// Update dids and have a fun
test('4. It updates DID_A by adding controller DID_B', async({ request }) => {
	const controllers = DIDDocument_A.controller as string[];
	// Update the original DID's controller list with appending new one
	controllers.push(DID_B.did)
	DIDDocument_A.controller = controllers;

	const response = await request.post(`/did/update`, {
		data: {
			did: DIDDocument_A.id,
			didDocument: DIDDocument_A
		},
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
	})

	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);

	// Make specific checks.
	// 1. Check that the response contains all keys from the original DID and the new one.
	const updatedDIDResponse = await response.json()
	console.log(`updatedDIDResponse: ${JSON.stringify(updatedDIDResponse)}`)
	
	expect(updatedDIDResponse.keys.length).toBe(1)
	expect(updatedDIDResponse.controllerKeys.length).toBe(2)
	expect(updatedDIDResponse.controllerKeyRefs.length).toBe(2)
	expect(mustIncludeKey(updatedDIDResponse, DID_A.controllerKeyId)).toBeTruthy()
	expect(mustIncludeKey(updatedDIDResponse, DID_B.controllerKeyId)).toBeTruthy()
	// List of keeys which were used for signing should include both keys
	expect(mustIncludeKeyControllerRef(updatedDIDResponse, DID_A.controllerKeyId)).toBeTruthy()
	expect(mustIncludeKeyControllerRef(updatedDIDResponse, DID_B.controllerKeyId)).toBeTruthy()

	// 2. ControllerKeyId field should be still the first verificationMEthod fron original controller
	expect(updatedDIDResponse.controllerKeyId).toEqual(DID_A.controllerKeyId);

	// 3. Check that each key has a controller field which points to the DID with it associated to.
	expect(allControllerKeysHaveController(updatedDIDResponse)).toBeTruthy()

	// 4. Check that the response contains all controller keyRefs.
	expect(mustIncludeKeyControllerRef(updatedDIDResponse, DID_A.controllerKeyId)).toBeTruthy();
	expect(mustIncludeKeyControllerRef(updatedDIDResponse, DID_B.controllerKeyId)).toBeTruthy();

	// 5. Get actual version of DID_A
	DIDDocument_A = await searchDID(DID_A.did, request)
})

test('5. It creates a resource for DID_A. Controllers are [DID_A, DID_B]', async ({ request }) => {
	const response = await request.post(`/resource/create/${DID_A.did}`, {
		data: {
			data: "SGVsbG8gV29ybGQ=",
			encoding: "base64url",
			name: `ResourceName-DID-A-DID-B`,
			type: "TextDocument"
		  },
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
	})

	expect(response).toBeOK();
})

test('6. It creates a resource for DID_B. Controllers are [DID_B]', async ({ request }) => {
	const response = await request.post(`/resource/create/${DID_B.did}`, {
		data: {
			data: "SGVsbG8gV29ybGQ=",
			encoding: "base64url",
			name: `ResourceName-DID-B`,
			type: "TextDocument"
		  },
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
	})

	expect(response).toBeOK();
})

test('7. It replaces DID_A\'s original controller DID_B', async({ request }) => {
	DIDDocument_A.controller = [DID_B.did];

	const response = await request.post(`/did/update`, {
		data: {
			did: DIDDocument_A.id,
			didDocument: DIDDocument_A
		},
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
	})

	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);

	// Make specific checks.
	// 1. Check that the response contains all keys from the original DID and the new one.
	const updatedDIDResponse = await response.json()
	expect(updatedDIDResponse.keys.length).toBe(1)
	expect(updatedDIDResponse.controllerKeys.length).toBe(1)
	expect(updatedDIDResponse.controllerKeyRefs.length).toBe(2)
	// List of controllerKey should include only one key
	expect(mustIncludeKey(updatedDIDResponse, DID_B.controllerKeyId)).toBeTruthy()

	// List of keeys which were used for signing should include both keys
	expect(mustIncludeKeyControllerRef(updatedDIDResponse, DID_A.controllerKeyId)).toBeTruthy()
	expect(mustIncludeKeyControllerRef(updatedDIDResponse, DID_B.controllerKeyId)).toBeTruthy()

	// 2. ControllerKeyId field should be still the first verificationMEthod fron original controller
	expect(updatedDIDResponse.controllerKeyId).toEqual(DID_A.controllerKeyId);

	// 3. Check that each key has a controller field which points to the DID with it associated to.
	expect(allControllerKeysHaveController(updatedDIDResponse)).toBeTruthy()

	// 4. Check that the response contains all controller keyRefs.
	expect(mustIncludeKeyControllerRef(updatedDIDResponse, DID_B.controllerKeyId)).toBeTruthy();

	// 5. Get actual version of DID_A
	DIDDocument_A = await searchDID(DID_A.did, request)
})

test('8. It creates a resource for DID_A. Controllers are [DID_B]', async ({ request }) => {
	const response = await request.post(`/resource/create/${DID_A.did}`, {
		data: {
			data: "SGVsbG8gV29ybGQ=",
			encoding: "base64url",
			name: `ResourceName-DID-B`,
			type: "TextDocument"
		  },
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
	})

	expect(response).toBeOK();
})

test('9. It creates a resource for DID_B. Controllers are [DID_B]. Round 2', async ({ request }) => {
	const response = await request.post(`/resource/create/${DID_B.did}`, {
		data: {
			data: "SGVsbG8gV29ybGQ=",
			encoding: "base64url",
			name: `ResourceName-DID-B-Round-2`,
			type: "TextDocument"
		  },
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
	})

	expect(response).toBeOK();
})

test('10. It replaces DID_C\'s original controller by DID_A', async({ request }) => {
	DIDDocument_C.controller = [DID_A.did];

	const response = await request.post(`/did/update`, {
		data: {
			did: DIDDocument_C.id,
			didDocument: DIDDocument_C
		},
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
	})

	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);

	// Make specific checks.
	// 1. Check that the response contains all keys from the original DID and the new one.
	const updatedDIDResponse = await response.json()
	console.log(`updatedDIDResponse: ${JSON.stringify(updatedDIDResponse)}`)
	expect(updatedDIDResponse.keys.length).toBe(1)
	expect(updatedDIDResponse.controllerKeys.length).toBe(1)
	expect(updatedDIDResponse.controllerKeyRefs.length).toBe(2)
	// List of keeys which were used for signing should include both keys
	expect(mustIncludeKeyControllerRef(updatedDIDResponse, DID_A.controllerKeyId)).toBeTruthy()
	expect(mustIncludeKeyControllerRef(updatedDIDResponse, DID_C.controllerKeyId)).toBeTruthy()

	expect(mustIncludeKey(updatedDIDResponse, DID_A.controllerKeyId)).toBeTruthy()

	// 2. ControllerKeyId field should be still the first verificationMEthod fron original controller
	expect(updatedDIDResponse.controllerKeyId).toEqual(DID_C.controllerKeyId);

	// 3. Check that each key has a controller field which points to the DID with it associated to.
	expect(allControllerKeysHaveController(updatedDIDResponse)).toBeTruthy()

	// 4. Check that the response contains all controller keyRefs.
	expect(mustIncludeKeyControllerRef(updatedDIDResponse, DID_A.controllerKeyId)).toBeTruthy();

	// 5. Get actual version of DID_C
	DIDDocument_C = await searchDID(DID_C.did, request)
})

test('11. It creates a resource for DID_C. Controllers are [DID_A]', async ({ request }) => {
	const response = await request.post(`/resource/create/${DID_C.did}`, {
		data: {
			data: "SGVsbG8gV29ybGQ=",
			encoding: "base64url",
			name: `ResourceName-DID-C`,
			type: "TextDocument"
		  },
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
	})

	expect(response).toBeOK();
})

test('12. It deactivates DID-C', async({ request }) => {
	const response = await request.post(`/did/deactivate/${DID_C.did}`, {
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
	})

	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);

	// Check that it was really deactivated
	expect(await isDeactivated(DID_C.did, request)).toBeTruthy()
})

test('13. It tries to set DID-C as a controller for DID-A. Expected error', async({ request }) => {
	DIDDocument_A.controller = [DID_C.did];

	const response = await request.post(`/did/update`, {
		data: {
			did: DIDDocument_A.id,
			didDocument: DIDDocument_A
		},
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
	})

	expect(response).not.toBeOK();
	expect(response.status()).toBe(StatusCodes.BAD_REQUEST);
})

test('14. It tries to set empty verificationMethod list for DID-A. Expected error', async({ request }) => {
	const copyDocument = { ...DIDDocument_A };
	copyDocument.verificationMethod = [];

	const response = await request.post(`/did/update`, {
		data: {
			did: copyDocument.id,
			didDocument: copyDocument
		},
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
	})

	expect(response).not.toBeOK();
	expect(response.status()).toBe(StatusCodes.BAD_REQUEST);
})

test('15. It returns back original controller for DID_A', async({ request }) => {
	DIDDocument_A.controller = [DID_A.did];

	const response = await request.post(`/did/update`, {
		data: {
			did: DIDDocument_A.id,
			didDocument: DIDDocument_A
		},
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
	})

	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);

	// Make specific checks.
	// 1. Check that the response contains all keys from the original DID and the new one.
	const updatedDIDResponse = await response.json()
	expect(updatedDIDResponse.keys.length).toBe(1)
	expect(updatedDIDResponse.controllerKeys.length).toBe(1)
	expect(mustIncludeKey(updatedDIDResponse, DID_A.controllerKeyId)).toBeTruthy()

	// 2. ControllerKeyId field should be still the first verificationMEthod fron original controller
	expect(updatedDIDResponse.controllerKeyId).toEqual(DID_A.controllerKeyId);

	// 3. Check that each key has a controller field which points to the DID with it associated to.
	expect(allControllerKeysHaveController(updatedDIDResponse)).toBeTruthy()

	// 4. Check that the response contains all controller keyRefs.
	expect(mustIncludeKeyControllerRef(updatedDIDResponse, DID_A.controllerKeyId)).toBeTruthy();

	// 5. Get actual version of DID_A
	DIDDocument_A = await searchDID(DID_A.did, request)
})

test('16. It creates a resource for DID_A. Controllers are [DID_A]', async ({ request }) => {
	const response = await request.post(`/resource/create/${DID_A.did}`, {
		data: {
			data: "SGVsbG8gV29ybGQ=",
			encoding: "base64url",
			name: `ResourceName-DID-A-The-Final-Step`,
			type: "TextDocument"
		  },
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
	})

	expect(response).toBeOK();
})

test('17. It creates a resource for DID_B. Controllers are [DID_B]. The final creates', async ({ request }) => {
	const response = await request.post(`/resource/create/${DID_B.did}`, {
		data: {
			data: "SGVsbG8gV29ybGQ=",
			encoding: "base64url",
			name: `ResourceName-DID-B-The-Final-Step`,
			type: "TextDocument"
		  },
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON }
	})

	expect(response).toBeOK();
})