
import { StatusCodes } from 'http-status-codes';
import type { ICommonErrorResponse } from './authentication.js';
import type {
	CompactJWT,
	ContextType,
	CredentialStatusReference,
	CredentialSubject,
	UnsignedCredential,
	VerifiableCredential,
	W3CVerifiableCredential,
} from '@veramo/core';
import { JwtPayload, jwtDecode } from 'jwt-decode';
import type { IIdentityService } from '../services/identity/index.js';
import type { CustomerEntity } from '../database/entities/customer.entity.js';
import { toNetwork } from '../helpers/helpers.js';
import { CommonReturn, type FeePaymentOptions } from './shared.js';
import { JWT_PROOF_TYPE } from './constants.js';


export interface ICheqdCredential extends UnsignedCredential {
	proof: {
		type: string;
		jwt: string;
	};
}

export interface IJWTPayloadVC extends JwtPayload {
	vc: ICheqdCredential;
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
		credential.credentialStatus = decoded.vc.credentialStatus;
		credential.credentialSubject.id = decoded.sub as string;
		credential.proof = {
			type: JWT_PROOF_TYPE,
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
