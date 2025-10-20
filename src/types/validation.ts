export type CreateDIDService = {
	idFragment: string;
	type: string;
	serviceEndpoint: string[];
	recipientKeys?: string[];
	routingKeys?: string[];
	accept?: string[];
	priority?: number;
};

export type JwtProof2020 = {
	type: string;
	jwt: string;
};

export type JSONLDProofType = {
	type: string;
	created: string;
	verificationMethod: string;
	proofPurpose: string;
	proofValue?: string;
	jws?: string;
};
