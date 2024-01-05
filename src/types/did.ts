import type { CheqdNetwork, MethodSpecificIdAlgo, Service, VerificationMethods } from '@cheqd/sdk';
import type { DIDDocument, DIDResolutionResult } from 'did-resolver';
import type { UnsuccessfulQueryResponseBody, UnsuccessfulResponseBody } from './shared.js';
import type { IIdentifier } from '@veramo/core';

export type CreateDidRequestBody = {
	didDocument?: DIDDocument;
	identifierFormatType: MethodSpecificIdAlgo;
	network: CheqdNetwork;
	verificationMethodType?: VerificationMethods;
	service?: Service | Service[];
	'@context'?: string | string[];
	key?: string;
	options?: {
		verificationMethodType: VerificationMethods;
		key: string;
	};
};

export interface KeyImportRequest {
	privateKeyHex: string;
	encrypted: boolean;
	ivHex: string | undefined;
	salt: string | undefined;
}

export interface DidImportRequest {
	did: string;
	keys: KeyImportRequest[];
}

//Positive

export type CreateDidResponseBody = IIdentifier;

export type UpdateDidResponseBody = IIdentifier;

export type DeactivateDidResponseBody = DIDResolutionResult;

export type ListDidsResponseBody = string[];

export type QueryDidResponseBody = DIDResolutionResult;

export type ResolveDidResponseBody = any;

// Negative

export type UnsuccessfulCreateDidResponseBody = UnsuccessfulResponseBody;

export type UnsuccessfulUpdateDidResponseBody = UnsuccessfulResponseBody;

export type UnsuccessfulDeactivateDidResponseBody = UnsuccessfulResponseBody & { deactivated: boolean };

export type UnsuccessfulGetDidResponseBody = UnsuccessfulQueryResponseBody;

export type UnsuccessfulResolveDidResponseBody = UnsuccessfulQueryResponseBody;
