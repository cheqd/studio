import { StatusCodes } from 'http-status-codes';
import type { IReturn } from '../middleware/auth/routine';
import type { ICommonErrorResponse } from './authentication';
import type {
	CompactJWT,
	ContextType,
	CredentialStatusReference,
	CredentialSubject,
	UnsignedCredential,
	UnsignedPresentation,
	VerifiableCredential,
	VerifiablePresentation,
	W3CVerifiableCredential,
	W3CVerifiablePresentation,
} from '@veramo/core';
import { jwtDecode, type JwtPayload } from 'jwt-decode';
import type { IIdentityService } from '../services/identity/index.js';
import type { CustomerEntity } from '../database/entities/customer.entity.js';
import { toNetwork } from '../helpers/helpers.js';
import type { FeePaymentOptions } from './shared.js';

export interface IErrorResponse {
	errorCode: string;
	message: string;
}

export class CommonReturn implements IReturn {
	returnOk(data = {}): ICommonErrorResponse {
		return {
			status: StatusCodes.OK,
			error: '',
			data: data,
		};
	}

	returnError(status: number, error: string, data = {}): ICommonErrorResponse {
		return {
			status: status,
			error: error,
			data: data,
		};
	}
}

export interface ICheqdCredential extends UnsignedCredential {
	proof: {
		type: string;
		jwt: string;
	};
}

export interface ICheqdPresentation extends UnsignedPresentation {
	proof: {
		type: string;
		jwt: string;
	};
}

export interface IJWTPayloadVC extends JwtPayload {
	vc: ICheqdCredential;
}

export interface IJWTPayloadVP extends JwtPayload {
	vp: ICheqdPresentation;
}

// ToDo: make unit tests
export class CheqdW3CVerifiableCredential extends CommonReturn implements ICheqdCredential {
	issuer: string;
	credentialSubject: CredentialSubject;
	type?: string[] | string;
	'@context': ContextType;
	issuanceDate: string;
	expirationDate?: string;
	credentialStatus?: CredentialStatusReference;
	id?: string;
	proof: {
		type: string;
		jwt: string;
	};

	constructor(w3Credential: W3CVerifiableCredential) {
		super();
		let credential: VerifiableCredential;

		credential = w3Credential as VerifiableCredential;
		if (typeof w3Credential === 'string') {
			credential = this.fromVCCompactJWT(w3Credential);
		}

		this['@context'] = credential['@context'];
		this.type = credential.type;
		this.credentialSubject = credential.credentialSubject;
		this.credentialStatus = credential.credentialStatus;
		this.issuer = typeof credential.issuer === 'string' ? credential.issuer : credential.issuer.id;
		this.issuanceDate = credential.issuanceDate;
		this.proof = (credential as ICheqdCredential).proof;
	}

	public fromVCCompactJWT(jwt: CompactJWT): VerifiableCredential {
		const decoded = jwtDecode(jwt) as IJWTPayloadVC;

		if (!Object.keys(decoded).includes('vc')) {
			throw new Error('JWT does not contain a verifiable credential');
		}
		const credential = decoded.vc;
		// As described here: https://www.w3.org/TR/vc-data-model/#jwt-encoding
		// iss - issuer
		// nbf - issuanceDate
		// sub - credentialSubject.id
		credential.issuer = {
			id: decoded.iss as string,
		};
		credential.issuanceDate = new Date((decoded.nbf as number) * 1000).toISOString();
		credential.credentialSubject.id = decoded.sub as string;
		credential.proof = {
			type: 'JwtProof2020',
			jwt: jwt,
		};
		return credential as VerifiableCredential;
	}

	public async makeFeePayment(agent: IIdentityService, customer: CustomerEntity): Promise<ICommonErrorResponse> {
		if (!this.credentialStatus) {
			return this.returnError(
				StatusCodes.BAD_REQUEST,
				'Credential status is not placed in credential. Cannot make fee payment.'
			);
		}
		const url = new URL(this.credentialStatus.id);
		const statusListName = url.searchParams.get('resourceName');
		const statusPurpose = this.credentialStatus.statusPurpose;
		const did = this.issuer;

		if (!statusListName) {
			return this.returnError(
				StatusCodes.BAD_REQUEST,
				'Cannot get statusList name from the credential. Cannot make fee payment.'
			);
		}
		if (!statusPurpose) {
			return this.returnError(
				StatusCodes.BAD_REQUEST,
				'Cannot get status purpose from the credential. Cannot make fee payment.'
			);
		}

		// ensure status list
		const statusList = await agent.searchStatusList2021(did, statusListName, statusPurpose);
		//if no such statusList - error
		if (!statusList) {
			return this.returnError(
				StatusCodes.BAD_REQUEST,
				'Cannot get status list from the ledger. Cannot make fee payment.'
			);
		}

		// No fee payment required
		if (!statusList?.resource?.metadata?.encrypted) {
			return this.returnOk();
		}

		// make fee payment
		const feePaymentResult = await Promise.all(
			statusList?.resource?.metadata?.paymentConditions?.map(async (condition) => {
				return await agent.remunerateStatusList2021(
					{
						feePaymentAddress: condition.feePaymentAddress,
						feePaymentAmount: condition.feePaymentAmount,
						feePaymentNetwork: toNetwork(did),
						memo: 'Automated status check fee payment, orchestrated by CaaS.',
					} satisfies FeePaymentOptions,
					customer
				);
			}) || []
		);

		// handle error
		if (feePaymentResult.some((result) => result.error)) {
			return this.returnError(
				StatusCodes.BAD_REQUEST,
				`payment: error: ${feePaymentResult.find((result) => result.error)?.error}`
			);
		}

		return this.returnOk();
	}
}

// ToDo: make unit tests
export class CheqdW3CVerifiablePresentation extends CommonReturn implements ICheqdPresentation {
	holder: string;
	verifiableCredential?: CheqdW3CVerifiableCredential[];
	type?: string[] | string;
	'@context': ContextType;
	verifier?: string[];
	issuanceDate?: string;
	expirationDate?: string;
	id?: string;
	proof: {
		type: string;
		jwt: string;
	};

	constructor(w3Presentation: W3CVerifiablePresentation) {
		super();
		let presentation: VerifiablePresentation;
		presentation = w3Presentation as VerifiablePresentation;
		if (typeof w3Presentation === 'string') {
			presentation = this.fromVPCompactJWT(w3Presentation);
		}

		this['@context'] = presentation['@context'];
		this.type = presentation.type;
		this.verifiableCredential = presentation.verifiableCredential?.map(
			(vc) => new CheqdW3CVerifiableCredential(vc)
		);
		this.holder = presentation.holder;
		this.verifier = presentation.verifier;
		this.proof = (presentation as ICheqdPresentation).proof;
	}

	public fromVPCompactJWT(jwt: CompactJWT): VerifiablePresentation {
		const decoded = jwtDecode(jwt) as IJWTPayloadVP;

		if (!Object.keys(decoded).includes('vp')) {
			throw new Error('JWT does not contain a verifiable presentation');
		}
		const presentation: W3CVerifiablePresentation = decoded.vp;
		// As described here: https://www.w3.org/TR/vc-data-model/#jwt-encoding
		// iss - holder
		presentation.holder = decoded.iss as string;
		if (typeof decoded.aud === 'string') {
			presentation.verifier = [decoded.aud] as string[];
		} else if (Array.isArray(decoded.aud)) {
			presentation.verifier = decoded.aud as string[];
		}
		presentation.proof = {
			type: 'JwtProof2020',
			jwt: jwt,
		};
		return presentation as VerifiablePresentation;
	}

	public async makeFeePayment(agent: IIdentityService, customer: CustomerEntity): Promise<ICommonErrorResponse> {
		if (!this.verifiableCredential) {
			return this.returnError(
				StatusCodes.BAD_REQUEST,
				'Verifiable credentials are not placed in presentation. Cannot make fee payment.'
			);
		}

		const feePaymentResults = await Promise.all(
			this.verifiableCredential.map(async (credential) => {
				return await credential.makeFeePayment(agent, customer);
			})
		);

		// handle error
		if (feePaymentResults.some((result) => result.error)) {
			return this.returnError(
				StatusCodes.BAD_REQUEST,
				`payment: error: ${feePaymentResults.find((result) => result.error)?.error}`
			);
		}

		return this.returnOk();
	}
}
