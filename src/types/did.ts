import type { CheqdNetwork, MethodSpecificIdAlgo, Service, VerificationMethods } from '@cheqd/sdk';
import type { DIDDocument, DIDResolutionResult, VerificationMethod } from 'did-resolver';
import type { UnsuccessfulQueryResponseBody, UnsuccessfulResponseBody } from './shared.js';
import type { KeyImport } from './key.js';
import type { ICheqdIDentifier } from '@cheqd/did-provider-cheqd';
import { IdentifierEntity } from '../database/entities/identifier.entity.js';

// Interfaces
export interface DidImportRequest {
	did: string;
	keys: KeyImport[];
	controllerKeyId?: string;
}

// Requests

export type DIDRequest = {
	did: string;
};

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
	providerId?: string;
};

export type UpdateDidRequestBody = {
	did: string;
	service: Service[];
	verificationMethod: VerificationMethod[];
	authentication: string[];
	didDocument?: DIDDocument;
} & { publicKeyHexs?: string[] };

export type ImportDidRequestBody = DidImportRequest;

export type DeactivateDIDRequestParams = DIDRequest;

export type DeactivateDIDRequestBody = { publicKeyHexs?: string[] };

export type GetDIDRequestParams = { did?: string } & ListDIDRequestOptions;

export type ListDIDRequestOptions = {
	network?: CheqdNetwork;
	page?: number;
	limit?: number;
	createdAt?: number;
	providerId?: string;
	metadata?: string;
};
export type ResolveDIDRequestParams = DIDRequest;

// Responses
//Positive

export type CreateDidResponseBody = ICheqdIDentifier;

export type UpdateDidResponseBody = ICheqdIDentifier;

export type DeactivateDidResponseBody = DIDResolutionResult;

export type ListDidsResponseBody = { total: number; dids: string[] | IdentifierEntity[] };

export type QueryDidResponseBody = DIDResolutionResult;

export type ResolveDidResponseBody = any;

export type ExportDidResponse = DIDResolutionResult & {
	'@context': string[];
	id: string;
	type: string[];
	keys: {
		controller: string;
		type: string;
		id: string;
		publicKeyMultibase: string;
		privateKeyMultibase: string;
		privateKeyBase58: string;
		publicKeyBase58: string;
		'@context'?: string[];
	}[];
};

// Negative

export type UnsuccessfulCreateDidResponseBody = UnsuccessfulResponseBody;

export type UnsuccessfulUpdateDidResponseBody = UnsuccessfulResponseBody;

export type UnsuccessfulDeactivateDidResponseBody = UnsuccessfulResponseBody | { deactivated: boolean };

export type UnsuccessfulGetDidResponseBody = UnsuccessfulQueryResponseBody;

export type UnsuccessfulResolveDidResponseBody = UnsuccessfulQueryResponseBody;
