import {
	ID_TYPE,
	INVALID_ID,
	INVALID_DID,
	NOT_EXISTENT_KEY,
	DEFAULT_DOES_NOT_HAVE_PERMISSIONS,
	NOT_SUPPORTED_VERIFICATION_METHOD_TYPE,
	PAYLOADS_PATH,
	CONTENT_TYPE,
} from '../../constants';
import * as fs from 'fs';
import { v4 } from 'uuid';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';
import { CheqdNetwork, createVerificationKeys, MethodSpecificIdAlgo, VerificationMethods } from '@cheqd/sdk';
import { UnsuccessfulResponseBody } from '@cheqd/credential-service/src/types/shared.js';
import { buildUpdateSimpleDID } from 'helpers';

test.use({ storageState: 'playwright/.auth/user.json' });

test('[Negative] It cannot create DID with missed verificationMethodType field in request body (Form based)', async ({
	request,
}) => {
	const response = await request.post(`/did/create`, {
		data: `network=${CheqdNetwork.Testnet}&identifierFormatType=${ID_TYPE.BASE58BTC}`,
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
	});
	expect(response.status()).toBe(StatusCodes.BAD_REQUEST);
	expect(await response.text()).toEqual(
		expect.stringContaining('Provide a DID Document or the VerificationMethodType to create a DID')
	);
});

test('[Negative] It cannot create DID with not existent key in request body (Form based)', async ({ request }) => {
	const response = await request.post(`/did/create`, {
		data:
			`network=${CheqdNetwork.Testnet}&identifierFormatType=${ID_TYPE.BASE58BTC}&` +
			`verificationMethodType=${VerificationMethods.Ed255192020}&` +
			`key=${NOT_EXISTENT_KEY}`,
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
	});
	expect(response.status()).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
	expect(await response.text()).toEqual(expect.stringContaining('Key not found'));
});

test('[Negative] It cannot create DID with not existent key in request body (JSON based)', async ({ request }) => {
	const did = `did:cheqd:testnet:${v4()}`;
	const response = await request.post('/did/create', {
		data: {
			network: CheqdNetwork.Testnet,
			identifierFormatType: ID_TYPE.UUID,
			options: {
				verificationMethodType: VerificationMethods.Ed255192020,
				key: NOT_EXISTENT_KEY,
			},
			didDocument: {
				id: did,
				controller: [did],
				authentication: [`${did}#key-1`],
			},
		},
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON },
	});
	expect(response.status()).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
	expect(await response.text()).toEqual(expect.stringContaining('Key not found'));
});

test('[Negative] It cannot create DID with an invalid VerificationMethodType in request body (JSON based)', async ({
	request,
}) => {
	const did = `did:cheqd:testnet:${v4()}`;
	const response = await request.post('/did/create', {
		data: {
			network: CheqdNetwork.Testnet,
			identifierFormatType: ID_TYPE.UUID,
			options: {
				verificationMethodType: NOT_SUPPORTED_VERIFICATION_METHOD_TYPE,
			},
			didDocument: {
				id: did,
				controller: [did],
				authentication: [`${did}#key-1`],
			},
		},
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON },
	});
	expect(response.status()).toBe(StatusCodes.BAD_REQUEST);
	expect(await response.text()).toEqual(expect.stringContaining('Unsupported verificationMethod type'));
});

test('[Negative] It cannot create DID with an invalid length of id in DIDDocument in request body (JSON based)', async ({
	request,
}) => {
	const invalidDidLength = `did:cheqd:testnet:${INVALID_ID}`;
	const response = await request.post('/did/create', {
		data: {
			network: CheqdNetwork.Testnet,
			identifierFormatType: ID_TYPE.UUID,
			options: {
				verificationMethodType: VerificationMethods.Ed255192018,
			},
			didDocument: {
				id: invalidDidLength,
				controller: [invalidDidLength],
				authentication: [`${invalidDidLength}#key-1`],
			},
		},
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON },
	});
	expect(response.status()).toBe(StatusCodes.BAD_REQUEST);
	expect(await response.text()).toEqual(expect.stringContaining('Cheqd DID identifier is not valid'));
});

test('[Negative] It cannot create DID with an invalid id format in DIDDocument in request body (JSON based)', async ({
	request,
}) => {
	const response = await request.post('/did/create', {
		data: {
			network: CheqdNetwork.Testnet,
			identifierFormatType: ID_TYPE.UUID,
			options: {
				verificationMethodType: VerificationMethods.Ed255192018,
			},
			didDocument: {
				id: INVALID_DID,
				controller: [INVALID_DID],
				authentication: [`${INVALID_DID}#key-1`],
			},
		},
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON },
	});
	expect(response.status()).toBe(StatusCodes.BAD_REQUEST);
	expect(await response.text()).toEqual(
		expect.stringContaining('Invalid format of DID. Expected to start with did:<method>')
	);
});

test('[Negative] It cannot create DID without VerificationMethodType in request body (JSON based)', async ({
	request,
}) => {
	// send request to create key
	let response = await request.post('/key/create', {
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON },
	});
	expect(response).toBeOK();
	expect(response.status()).toBe(StatusCodes.OK);

	const did = createVerificationKeys((await response.json()).kid, MethodSpecificIdAlgo.Base58, 'key-1').didUrl;
	const kid = (await response.json()).kid;
	response = await request.post('/did/create', {
		data: {
			network: CheqdNetwork.Testnet,
			identifierFormatType: ID_TYPE.UUID,
			options: { key: kid },
			didDocument: {
				id: did,
				controller: [did],
				authentication: [`${did}#key-1`],
			},
		},
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON },
	});
	expect(response.status()).toBe(StatusCodes.BAD_REQUEST);
	expect(await response.text()).toEqual(
		expect.stringContaining('If key is provided, options.verificationMethodType is required')
	);
});

test('[Negative] It cannot create DID in mainnet network for user with testnet role', async ({ request }) => {
	const response = await request.post(`/did/create`, {
		data: JSON.parse(fs.readFileSync(`${PAYLOADS_PATH.DID}/did-create-without-permissions.json`, 'utf-8')),
		headers: {
			'Content-Type': CONTENT_TYPE.APPLICATION_JSON,
		},
	});
	expect(response).not.toBeOK();
	expect(response.status()).toBe(StatusCodes.FORBIDDEN);
	const { error } = (await response.json()) as UnsuccessfulResponseBody;
	expect(error).toEqual(expect.stringContaining(DEFAULT_DOES_NOT_HAVE_PERMISSIONS));
});

test('[Negative] It cannot create DID without correct serviceEndpoint format', async ({ request }) => {
	let didDocBuild = buildUpdateSimpleDID();
	didDocBuild.didDocument.service[0].serviceEndpoint = null; // remove serviceEndpoint to make it invalid
	let response = await request.post('/did/create', {
		data: {
			network: CheqdNetwork.Testnet,
			identifierFormatType: ID_TYPE.UUID,
			didDocument: didDocBuild.didDocument,
		},
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON },
	});
	expect(response.status()).toBe(StatusCodes.BAD_REQUEST);
	expect(await response.text()).toEqual(
		expect.stringContaining('Service has validation errors: service.serviceEndpoint is required')
	);
});

test('[Negative] It cannot create DID without correct service', async ({ request }) => {
	let didDocBuild = buildUpdateSimpleDID();
	didDocBuild.didDocument.service[0]['priority'] = 'invalid'; // pass string to make it invalid
	let response = await request.post('/did/create', {
		data: {
			network: CheqdNetwork.Testnet,
			identifierFormatType: ID_TYPE.UUID,
			didDocument: didDocBuild.didDocument,
		},
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON },
	});
	expect(response.status()).toBe(StatusCodes.BAD_REQUEST);
	expect(await response.text()).toEqual(
		expect.stringContaining('Service has validation errors: service.priority should be a non-negative number')
	);
});

test('[Negative] It cannot create DID without correct routingKeys', async ({ request }) => {
	let didDocBuild = buildUpdateSimpleDID();
	didDocBuild.didDocument.service[0]['routingKeys'] = 'invalid'; // pass string to make it invalid
	let response = await request.post('/did/create', {
		data: {
			network: CheqdNetwork.Testnet,
			identifierFormatType: ID_TYPE.UUID,
			didDocument: didDocBuild.didDocument,
		},
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON },
	});
	expect(response.status()).toBe(StatusCodes.BAD_REQUEST);
	expect(await response.text()).toEqual(
		expect.stringContaining('Service has validation errors: service.routingKeys should be an array of strings')
	);
});

test('[Negative] It cannot create DID without correct recipientKeys', async ({ request }) => {
	let didDocBuild = buildUpdateSimpleDID();
	didDocBuild.didDocument.service[0]['recipientKeys'] = [2, 3]; // pass number  to make it invalid
	let response = await request.post('/did/create', {
		data: {
			network: CheqdNetwork.Testnet,
			identifierFormatType: ID_TYPE.UUID,
			didDocument: didDocBuild.didDocument,
		},
		headers: { 'Content-Type': CONTENT_TYPE.APPLICATION_JSON },
	});
	expect(response.status()).toBe(StatusCodes.BAD_REQUEST);
	expect(await response.text()).toEqual(
		expect.stringContaining('Service has validation errors: service.recipientKeys should be an array of strings')
	);
});
