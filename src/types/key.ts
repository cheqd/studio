import type { ManagedKeyInfo } from '@veramo/core';
import type { KeyEntity } from '../database/entities/key.entity.js';
import type { UnsuccessfulQueryResponseBody, UnsuccessfulResponseBody } from './shared.js';

// Interfaces

export interface KeyImport {
	privateKeyHex: string;
	encrypted: boolean;
	ivHex: string | undefined;
	salt: string | undefined;
	alias?: string;
	type: 'Ed25519' | 'Secp256k1';
}

// Requests
export type ImportKeyRequestBody = KeyImport;

export type GetKeyRequestBody = {
    kid: string;
}

// Positive

export type CreateKeyResponseBody = KeyEntity;

export type ImportKeyResponseBody = KeyEntity;

export type QueryKeyResponseBody = ManagedKeyInfo;

//Negative

export type UnsuccessfulCreateKeyResponseBody = UnsuccessfulResponseBody;

export type UnsuccessfulImportKeyResponseBody = UnsuccessfulResponseBody;

export type UnsuccessfulQueryKeyResponseBody = UnsuccessfulQueryResponseBody;
