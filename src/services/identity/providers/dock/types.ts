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
