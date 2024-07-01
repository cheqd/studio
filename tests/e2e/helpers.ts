import { APIRequestContext, expect } from '@playwright/test';
import {
	DEFAULT_STATUS_LIST_ENCRYPTED_NAME,
	DEFAULT_STATUS_LIST_INDICES,
	DEFAULT_STATUS_LIST_PAYMENT_ADDRESS,
	DEFAULT_STATUS_LIST_UNENCRYPTED_NAME,
	DEFAULT_SUBJECT_DID,
	DEFAULT_TESTNET_DID,
} from './constants';
import { VerificationMethods } from '@cheqd/sdk';

export const buildSimpleCreateDID = (network = 'testnet') => {
	return {
		identifierFormatType: 'uuid',
		verificationMethodType: 'Ed255192018',
		assertionMethod: true,
		network: network,
	};
};

export const buildUpdateSimpleDID = (
	did = DEFAULT_TESTNET_DID,
	pubkey = 'BTJiso1S4iSiReP6wGksSneGfiKHxz9SYcm2KknpqBJt'
) => {
	return {
		did: did,
		service: [
			{
				id: `${did}#service-1`,
				type: 'LinkedDomains',
				serviceEndpoint: ['https://example.com'],
			},
		],
		verificationMethod: [
			{
				controller: did,
				id: `${did}#key-1`,
				publicKeyBase58: pubkey,
				type: VerificationMethods.Ed255192018,
			},
		],
		authentication: ['string'],
		didDocument: {
			'@context': ['https://www.w3.org/ns/did/v1'],
			id: did,
			controller: [did],
			verificationMethod: [
				{
					id: `${did}#key-1`,
					type: VerificationMethods.Ed255192018,
					controller: did,
					publicKeyBase58: pubkey,
				},
			],
			authentication: [`${did}#key-1`],
			service: [
				{
					id: `${did}#service-1`,
					type: 'LinkedDomains',
					serviceEndpoint: ['https://example.com'],
				},
			],
		},
	};
};

export const buildSimpleEncryptedCreateCredentialStatus2021 = (
	did: string,
	statusListName = DEFAULT_STATUS_LIST_ENCRYPTED_NAME,
	feePaymentaddress = DEFAULT_STATUS_LIST_PAYMENT_ADDRESS
) => {
	return {
		did: did,
		statusListName: statusListName,
		paymentConditions: [
			{
				feePaymentAddress: feePaymentaddress,
				feePaymentAmount: 20,
				feePaymentWindow: 10,
			},
		],
	};
};

export const buildSimpleUnencryptedCreateCredentialStatus2021 = (
	did: string,
	statusListName = DEFAULT_STATUS_LIST_ENCRYPTED_NAME
) => {
	return {
		did: did,
		statusListName: statusListName,
		length: 140000,
		encoding: 'base64url',
	};
};

export const buildSimpleUnencryptedUpdateCredentialStatus2021 = (
	did: string,
	statusListName = DEFAULT_STATUS_LIST_ENCRYPTED_NAME,
	indicies = DEFAULT_STATUS_LIST_INDICES
) => {
	return {
		did: did,
		statusListName: statusListName,
		indices: indicies,
	};
};

export const buildSimpleEncryptedUpdateCredentialStatus2021 = (
	did: string,
	statusListName = DEFAULT_STATUS_LIST_ENCRYPTED_NAME,
	symmetricKey = process.env.DEFAULT_SYMMETRIC_KEY
) => {
	return {
		...buildSimpleUnencryptedUpdateCredentialStatus2021(did, statusListName),
		symmetricKey: symmetricKey,
	};
};

export const buildSimpleIssueCredentialRequest = (
	issuerDid = DEFAULT_TESTNET_DID,
	subjectDid = DEFAULT_SUBJECT_DID,
	statusPurpose = 'revocation',
	statusListName = DEFAULT_STATUS_LIST_UNENCRYPTED_NAME
) => {
	return {
		issuerDid: issuerDid,
		subjectDid: subjectDid,
		attributes: {
			gender: 'male',
			name: 'Bob',
		},
		'@context': ['https://schema.org'],
		type: ['Person'],
		format: 'jwt',
		credentialStatus: {
			statusPurpose: statusPurpose,
			statusListName: statusListName,
			statusListIndex: 10,
		},
	};
};

export const buildSimpleService = (
	idFragment = 'service-1',
	type = 'LinkedDomains',
	serviceEndpoint = ['https://example.com']
) => {
	return {
		idFragment: idFragment,
		type: type,
		serviceEndpoint: serviceEndpoint,
	};
};

export async function createDID(request: APIRequestContext, payload): Promise<string> {
	const response = await request.post('/did/create', {
		data: payload,
		headers: { 'Content-Type': 'application/json' },
	});

	expect(response).toBeOK();
	const reponseJson = await response.json();
	return reponseJson.did as string;
}
