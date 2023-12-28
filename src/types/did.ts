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
