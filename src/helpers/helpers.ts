import type { DIDDocument } from 'did-resolver';
import type { ParsedQs } from 'qs';
import type { SpecValidationResult } from '../types/shared.js';
import type { Coin } from '@cosmjs/amino';
import {
	MethodSpecificIdAlgo,
	CheqdNetwork,
	TVerificationKey,
	TVerificationKeyPrefix,
	VerificationMethods,
	createVerificationKeys,
	createDidVerificationMethod,
	createDidPayload,
} from '@cheqd/sdk';
import { createHmac } from 'node:crypto';
import { DEFAULT_DENOM_EXPONENT, MINIMAL_DENOM } from '../types/constants.js';
import { LitCompatibleCosmosChains, type DkgOptions, LitNetworks } from '@cheqd/did-provider-cheqd';
import { fromString } from 'uint8arrays';

import { config } from 'dotenv';
import { DIDUrlParams, isDidAndResourceId, isDidAndResourceName, isDidUrl } from '../types/accreditation.js';

config();

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
				network: LitNetworks.datildev,
			};
		case CheqdNetwork.Testnet:
		default:
			return {
				chain: LitCompatibleCosmosChains.cheqdTestnet,
				network: LitNetworks.datildev,
			};
	}
}

export function validateDidCreatePayload(didDocument: DIDDocument): SpecValidationResult {
	if (!didDocument) return { valid: true };

	// id is required, validated on both compile and runtime
	if (!didDocument.id || !didDocument.id.startsWith('did:cheqd:')) return { valid: false, error: 'id is required' };

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

export async function generateSaltFromConstantInput(constant: string): Promise<Uint8Array> {
	const derivedSource = await crypto.subtle.importKey(
		'raw',
		Buffer.from(constant),
		{ name: 'PBKDF2', hash: 'SHA-256' },
		false,
		['deriveBits', 'deriveKey']
	);

	const salt = await crypto.subtle.deriveBits(
		{
			name: 'PBKDF2',
			salt: Buffer.from(constant),
			iterations: 100_000,
			hash: 'SHA-256',
		},
		derivedSource,
		256
	);

	return new Uint8Array(salt);
}

export async function deriveSymmetricKeyFromSecret(
	encryptionKey: string,
	constant: string,
	iterations = 100_000
): Promise<CryptoKey> {
	// generate salt from constant input
	const salt = await generateSaltFromConstantInput(constant);

	// import as key
	const key = await crypto.subtle.importKey('raw', fromString(encryptionKey), { name: 'PBKDF2' }, false, [
		'deriveBits',
		'deriveKey',
	]);

	// derive key from encryption secret
	const derivedKey = await crypto.subtle.deriveKey(
		{
			name: 'PBKDF2',
			salt,
			iterations, // 10x iterations since outcome is exposed in client storage, around 1s
			hash: 'SHA-256',
		},
		key,
		{
			name: 'AES-GCM',
			length: 256,
		},
		false,
		['encrypt', 'decrypt']
	);

	return derivedKey;
}

export async function decryptPrivateKey(encryptedPrivateKeyHex: string, ivHex: string, salt: string) {
	if (!process.env.CREDS_DECRYPTION_SECRET) {
		throw new Error('Missing encryption secret');
	}
	// derive key from passphrase
	const derivedKey = await deriveSymmetricKeyFromSecret(process.env.CREDS_DECRYPTION_SECRET, salt);

	// unwrap encrypted key with iv
	const encryptedKey = Buffer.from(encryptedPrivateKeyHex, 'hex');
	const iv = Buffer.from(ivHex, 'hex');

	// decrypt private key with derived key
	const decrypted = await crypto.subtle.decrypt(
		{
			name: 'AES-GCM',
			iv,
		},
		derivedKey,
		encryptedKey
	);

	const secretKey = new Uint8Array(decrypted);

	return secretKey;
}

export function parseDidFromDidUrl(didUrl: string) {
	return didUrl.includes('?') ? didUrl.split('?')[0] : didUrl.split('/')[0];
}

export function constructDidUrl(data: DIDUrlParams) {
	let didUrl: string | undefined = undefined;
	if (isDidUrl(data)) {
		didUrl = data.didUrl;
	} else if (isDidAndResourceId(data)) {
		didUrl = `${data.did}/resources/${data.resourceId}`;
	} else if (isDidAndResourceName(data)) {
		didUrl = `${data.did}?resourceName=${data.resourceName}&resourceType=${data.resourceType}`;
	}

	return didUrl;
}
