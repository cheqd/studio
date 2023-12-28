
export type CreateDIDService = {
	idFragment: string;
	type: string;
	serviceEndpoint: string[];
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
	jws: string;
};
export type CheqdCredentialStatus = {
	id: string;
	type: string;
	statusPurpose: string;
	statusListIndex: string;
};

