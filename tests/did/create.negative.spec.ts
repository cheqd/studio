import {
	NETWORK,
	ID_TYPE,
	INVALID_ID,
	INVALID_DID,
	NOT_EXISTENT_KEY,
	VERIFICATION_METHOD_TYPES,
	DEFAULT_DOES_NOT_HAVE_PERMISSIONS,
	NOT_SUPPORTED_VERIFICATION_METHOD_TYPE,
} from '../constants';
import * as fs from 'fs';
import { v4 } from 'uuid';
import { test, expect } from '@playwright/test';
import { StatusCodes } from 'http-status-codes';

const PAYLOADS_BASE_PATH = './tests/payloads/did';

test.use({ storageState: 'playwright/.auth/user.json' });

test('[Negative] It cannot create DID with missed verificationMethodType field in request body (Form based)', async ({
	request,
}) => {
	const response = await request.post(`/did/create`, {
		data: `network=${NETWORK.TESTNET}&identifierFormatType=${ID_TYPE.BASE58BTC}`,
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
			`network=${NETWORK.TESTNET}&identifierFormatType=${ID_TYPE.BASE58BTC}&` +
			`verificationMethodType=${VERIFICATION_METHOD_TYPES.Ed25519VerificationKey2020}&` +
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
			network: NETWORK.TESTNET,
			identifierFormatType: ID_TYPE.UUID,
			options: {
				verificationMethodType: VERIFICATION_METHOD_TYPES.Ed25519VerificationKey2020,
				key: NOT_EXISTENT_KEY,
			},
			didDocument: {
				id: did,
				controller: [did],
				authentication: [`${did}#key-1`],
			},
		},
		headers: { 'Content-Type': 'application/json' },
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
			network: NETWORK.TESTNET,
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
		headers: { 'Content-Type': 'application/json' },
	});
	expect(response.status()).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
	expect(await response.text()).toEqual(expect.stringContaining('Unsupported verificationMethod type'));
});

test('[Negative] It cannot create DID with an invalid length of id in DIDDocument in request body (JSON based)', async ({
	request,
}) => {
	const invalidDidLength = `did:cheqd:testnet:${INVALID_ID}`;
	const response = await request.post('/did/create', {
		data: {
			network: NETWORK.TESTNET,
			identifierFormatType: ID_TYPE.UUID,
			options: {
				verificationMethodType: VERIFICATION_METHOD_TYPES.Ed25519VerificationKey2018,
			},
			didDocument: {
				id: invalidDidLength,
				controller: [invalidDidLength],
				authentication: [`${invalidDidLength}#key-1`],
			},
		},
		headers: { 'Content-Type': 'application/json' },
	});
	expect(response.status()).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
	expect(await response.text()).toEqual(
		expect.stringContaining('unique id should be one of: 16 bytes of decoded base58 string or UUID')
	);
});

test('[Negative] It cannot create DID with an invalid id format in DIDDocument in request body (JSON based)', async ({
	request,
}) => {
	const response = await request.post('/did/create', {
		data: {
			network: NETWORK.TESTNET,
			identifierFormatType: ID_TYPE.UUID,
			options: {
				verificationMethodType: VERIFICATION_METHOD_TYPES.Ed25519VerificationKey2018,
			},
			didDocument: {
				id: INVALID_DID,
				controller: [INVALID_DID],
				authentication: [`${INVALID_DID}#key-1`],
			},
		},
		headers: { 'Content-Type': 'application/json' },
	});
	expect(response.status()).toBe(StatusCodes.BAD_REQUEST);
	expect(await response.text()).toEqual(expect.stringContaining('Invalid didDocument'));
});

test('[Negative] It cannot create DID without VerificationMethodType in request body (JSON based)', async ({
	request,
}) => {
	const response = await request.post('/did/create', {
		data: {
			network: NETWORK.TESTNET,
			identifierFormatType: ID_TYPE.UUID,
			didDocument: {
				id: INVALID_DID,
				controller: [INVALID_DID],
				authentication: [`${INVALID_DID}#key-1`],
			},
		},
		headers: { 'Content-Type': 'application/json' },
	});
	expect(response.status()).toBe(StatusCodes.BAD_REQUEST);
	expect(await response.text()).toEqual(expect.stringContaining('Invalid didDocument'));
});

test('[Negative] It cannot create DID without DidDocument in request body (JSON based)', async ({ request }) => {
	const response = await request.post('/did/create', {
		data: {
			network: NETWORK.TESTNET,
			identifierFormatType: ID_TYPE.UUID,
			options: {
				verificationMethodType: VERIFICATION_METHOD_TYPES.Ed25519VerificationKey2020,
			},
		},
		headers: { 'Content-Type': 'application/json' },
	});
	expect(response.status()).toBe(StatusCodes.BAD_REQUEST);
	expect(await response.text()).toEqual(
		expect.stringContaining('Provide a DID Document or the VerificationMethodType to create a DID')
	);
});

test('[Negative] It cannot create DID in mainnet network for user with testnet role', async ({ request }) => {
	const response = await request.post(`/did/create`, {
		data: JSON.parse(fs.readFileSync(`${PAYLOADS_BASE_PATH}/did-create-without-permissions.json`, 'utf-8')),
		headers: {
			'Content-Type': 'application/json',
		},
	});
	expect(response).not.toBeOK();
	expect(response.status()).toBe(StatusCodes.FORBIDDEN);
	expect(await response.text()).toEqual(expect.stringContaining(DEFAULT_DOES_NOT_HAVE_PERMISSIONS));
});
