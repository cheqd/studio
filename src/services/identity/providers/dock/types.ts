import { DIDDocument } from 'did-resolver';

export type DockTrustRegistry = {
	id: string;
	name: string;
	logoUrl: string;
};

export type DockDidProfile = {
	name: string;
	description: string;
	logo: string;
};

export type DockListDidsResponse = {
	id: string;
	did: string;
	type: string;
	controller: string;
	profile: DockDidProfile;
	keyId: string;
	jobId: string | null;
	trustRegistries: DockTrustRegistry[];
}[];

export type DockCreateDidResponse = {
	id: string;
	data: {
		did: string;
		controller: string;
	};
};

export type DockIssueCredentialRequestBody = {
	persist?: boolean;
	password?: string;
	template?: string; // uuid for pdf and web rendering customization
	recipientEmail?: string;
	distribute?: boolean;
	revocable?: boolean;

	format: 'jsonld' | 'jwt' | 'sdjwt';
	credential: {
		id?: string;
		name?: string;
		description?: string;
		schema?: string;
		context?: string[];
		type?: string[];
		issuer: string;
		issuanceDate?: string;
		expirationDate?: string;
		subject: Record<string, any>;
		status?: string | object;
	};
};

export type DockExportDidResponse = {
	'@context': string[];
	id: string;
	type: string[];
	issuer: string;
	issuanceDate: string;
	credentialSubject: {
		id: string;
		encryptedWalletContents: {
			protected: string;
			recipients: Array<{
				encrypted_key: string;
				header: {
					kid: string;
					alg: string;
					epk: {
						kty: string;
						crv: string;
						x: string;
					};
					apu: string;
					apv: string;
				};
			}>;
			iv: string;
			ciphertext: string;
			tag: string;
		};
	};
};

export type DockDecryptedKey = {
	controller: string;
	type: string;
	id: string;
	publicKeyMultibase: string;
	privateKeyMultibase: string;
	privateKeyBase58: string;
	publicKeyBase58: string;
	'@context': string[];
};

export type DockDecryptedCredentialContent =
	| {
			'@context': string[];
			id: string;
			type: string[];
			tags: string[];
			correlation: string[];
			created: string;
			didDocument: DIDDocument;
			didDocumentMetadata: {
				'content-type': string;
			};
			didResolutionMetadata: object;
	  }
	| DockDecryptedKey;

export type DockDecryptedCredential = {
	'@context': string[];
	id: string;
	type: string[];
	status: string;
	contents: DockDecryptedCredentialContent[];
};

export type DockListCredentialResponse = {
	id: string;
	issuerKey: string;
	subjectRef: string;
	issuerName: string;
	type: string;
	revocationRegistry: string;
	revoked: boolean;
	index: string;
	createdAt: string;
	expiryDate: string | null;
	expirationDate: string | null;
	issuanceDate: string;
	byteSize: number;
	persist: boolean;
	whitelabel: string | null;
	algorithm: string;
}[];

export type DockListCredentialRequestOptions = {
	offset?: number;
	limit?: number;
	filter: {
		id?: string;
		issuerDid?: string;
		type?: string;
	};
};
