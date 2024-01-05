import type { CheqdNetwork, MethodSpecificIdAlgo, Service, VerificationMethods } from '@cheqd/sdk';
import type { DIDDocument } from 'did-resolver';

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
