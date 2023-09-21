import type { DIDDocument, VerificationMethod } from 'did-resolver';
import {
	MethodSpecificIdAlgo,
	CheqdNetwork,
	TVerificationKey,
	TVerificationKeyPrefix,
	VerificationMethods,
	createVerificationKeys,
	createDidVerificationMethod,
	createDidPayload,
	toMultibaseRaw,
} from '@cheqd/sdk';
import { createHmac } from 'node:crypto';
import type { ParsedQs } from 'qs';
import type { SpecValidationResult } from '../types/shared.js';
import { DEFAULT_DENOM_EXPONENT, MINIMAL_DENOM } from '../types/constants.js';
import { LitCompatibleCosmosChains, type DkgOptions, LitNetworks } from '@cheqd/did-provider-cheqd';
import type { Coin } from '@cosmjs/amino';
import { fromString, toString } from 'uint8arrays';
import { bases } from "multiformats/basics";
import { base64ToBytes } from "did-jwt";

export interface IDidDocOptions {
	verificationMethod: VerificationMethods;
	verificationMethodId: TVerificationKey<TVerificationKeyPrefix, number>;
	methodSpecificIdAlgo: MethodSpecificIdAlgo;
	network: CheqdNetwork;
	publicKey: string;
}

export function toMinimalDenom(amount: number): number {
	return amount * 10 ** DEFAULT_DENOM_EXPONENT;
}

export function toCoin(amount: string): Coin {
	return {
		amount: amount.replace(/\D+.*/, ''),
		denom: MINIMAL_DENOM,
	};
}

export function toNetwork(did: string): CheqdNetwork {
	// switch on namespace
	switch (did.split(':')[2]) {
		case CheqdNetwork.Mainnet:
			return CheqdNetwork.Mainnet;
		case CheqdNetwork.Testnet:
		default:
			return CheqdNetwork.Testnet;
	}
}

export function toDefaultDkg(did: string): DkgOptions {
	// define network
	const network = toNetwork(did);

	// switch on namespace
	switch (network) {
		case CheqdNetwork.Mainnet:
			return {
				chain: LitCompatibleCosmosChains.cheqdMainnet,
				network: LitNetworks.serrano,
			};
		case CheqdNetwork.Testnet:
		default:
			return {
				chain: LitCompatibleCosmosChains.cheqdTestnet,
				network: LitNetworks.serrano,
			};
	}
}

export function validateDidCreatePayload(didDocument: DIDDocument): SpecValidationResult {
	// id is required, validated on both compile and runtime
	if (!didDocument.id && !didDocument.id.startsWith('did:cheqd:')) return { valid: false, error: 'id is required' };

	if (!isValidService(didDocument)) return { valid: false, error: 'Service is Invalid' };
	return { valid: true } as SpecValidationResult;
}

export function validateSpecCompliantPayload(didDocument: DIDDocument): SpecValidationResult {
	// id is required, validated on both compile and runtime
	if (!didDocument.id && !didDocument.id.startsWith('did:cheqd:')) return { valid: false, error: 'id is required' };

	// verificationMethod is required
	if (!didDocument.verificationMethod) return { valid: false, error: 'verificationMethod is required' };

	// verificationMethod must be an array
	if (!Array.isArray(didDocument.verificationMethod))
		return { valid: false, error: 'verificationMethod must be an array' };

	// verificationMethod must be not be empty
	if (!didDocument.verificationMethod.length)
		return { valid: false, error: 'verificationMethod must be not be empty' };

	// verificationMethod types must be supported
	if (!isValidVerificationMethod(didDocument))
		return { valid: false, error: 'verificationMethod publicKey is Invalid' };

	if (!isValidService(didDocument)) return { valid: false, error: 'Service is Invalid' };
	return { valid: true } as SpecValidationResult;
}

export function isValidService(didDocument: DIDDocument): boolean {
	return didDocument.service
		? didDocument?.service?.every((s) => {
			return s?.serviceEndpoint && s?.id && s?.type;
		})
		: true;
}

export function isValidVerificationMethod(didDocument: DIDDocument): boolean {
	if (!didDocument.verificationMethod) return false;
	return didDocument.verificationMethod.every((vm) => {
		switch (vm.type) {
			case VerificationMethods.Ed255192020:
				return vm.publicKeyMultibase != null;
			case VerificationMethods.JWK:
				return vm.publicKeyJwk != null;
			case VerificationMethods.Ed255192018:
				return vm.publicKeyBase58 != null;
			default:
				return false;
		}
	});
}

export function generateDidDoc(options: IDidDocOptions) {
	const { verificationMethod, methodSpecificIdAlgo, verificationMethodId, network, publicKey } = options;
	const verificationKeys = createVerificationKeys(publicKey, methodSpecificIdAlgo, verificationMethodId, network);
	if (!verificationKeys) {
		throw new Error('Invalid DID options');
	}
	const verificationMethods = createDidVerificationMethod([verificationMethod], [verificationKeys]);

	return createDidPayload(verificationMethods, [verificationKeys]);
}

export function generateVerificationMethod(
	did: string, 
	publicKeyHex: string,
	verificationMethodType: VerificationMethods
): VerificationMethod {
	const pkBase64 = publicKeyHex.length == 43 ? publicKeyHex : toString(fromString(publicKeyHex, 'hex'), 'base64');
	switch (verificationMethodType) {
		case VerificationMethods.Ed255192018:
			return generateVerificationMethodEd255192018(did, pkBase64);
		case VerificationMethods.Ed255192020:
			return generateVerificationMethodEd255192020(did, pkBase64);
		case VerificationMethods.JWK:
			return generateVerificationMethodJWK(did, pkBase64);
	};
}

function generateVerificationMethodEd255192018(did: string, pkBase64: string) {
	return {
		id: `${did}#key-1`,
		type: VerificationMethods.Ed255192018,
		controller: did,
		publicKeyBase58: bases['base58btc'].encode(base64ToBytes(pkBase64)).slice(1)
	};
}

function generateVerificationMethodEd255192020(did: string, pkBase64: string) {
	return {
		id: `${did}#key-1`,
		type: VerificationMethods.Ed255192020,
		controller: did,
		publicKeyMultibase: toMultibaseRaw(base64ToBytes(pkBase64))
	};
}

function generateVerificationMethodJWK(did: string, pkBase64: string) {
	return {
		id: `${did}#key-1`,
		type: VerificationMethods.JWK,
		controller: did,
		publicKeyJwk: {
			crv: 'Ed25519',
			kty: 'OKP',
			x: toString(fromString(pkBase64, 'base64pad'), 'base64url')
		}
	};
}

export function verifyHookSignature(signingKey: string, rawBody: string, expectedSignature: string): boolean {
	const hmac = createHmac('sha256', signingKey);
	hmac.update(rawBody);
	const signature = hmac.digest('hex');
	return signature === expectedSignature;
}

export function getQueryParams(queryParams: ParsedQs) {
	// Convert the query parameters object to a single string in text format
	const queryParamsText = Object.keys(queryParams)
		.map((key) => `${key}=${queryParams[key]}`)
		.join('&');

	return queryParamsText.length == 0 ? queryParamsText : '?' + queryParamsText;
}
