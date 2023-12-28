import { StatusCodes } from 'http-status-codes';
import type { ICommonErrorResponse } from '../types/authentication.js';
import type {
	CompactJWT,
	ContextType,
	CredentialStatusReference,
	CredentialSubject,
	ProofType,
	UnsignedCredential,
	VerifiableCredential,
	W3CVerifiableCredential,
} from '@veramo/core';
import { JwtPayload, jwtDecode } from 'jwt-decode';
import type { IIdentityService } from './identity/index.js';
import type { CustomerEntity } from '../database/entities/customer.entity.js';
import { toNetwork } from '../helpers/helpers.js';
import { CommonReturn } from '../types/shared.js';
import type { FeePaymentOptions } from '../types/credential-status.js';
import { JWT_PROOF_TYPE } from '../types/constants.js';
import type { StatusList2021Revocation, StatusList2021Suspension } from '@cheqd/did-provider-cheqd';

export interface ICheqdCredential extends UnsignedCredential {
	proof: ProofType;
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
	proof: ProofType;
	statusList?: StatusList2021Revocation | StatusList2021Suspension;

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

	public async trySetStatusList2021(agent: IIdentityService): Promise<ICommonErrorResponse> {
		if (!this.credentialStatus) {
			return this.returnError(
				StatusCodes.BAD_REQUEST,
				'Credential status is not placed in credential. Cannot search for statusList'
			);
		}
		const url = new URL(this.credentialStatus.id);
		const statusListName = url.searchParams.get('resourceName');
		const statusPurpose = this.credentialStatus.statusPurpose;
		const did = this.issuer;

		if (!statusListName) {
			return this.returnError(
				StatusCodes.BAD_REQUEST,
				'Cannot get statusList name from the credential. Cannot search for statusList'
			);
		}
		if (!statusPurpose) {
			return this.returnError(
				StatusCodes.BAD_REQUEST,
				'Cannot get status purpose from the credential. Cannot search for statusList.'
			);
		}

		// ensure status list
		const statusList = await agent.searchStatusList2021(did, statusListName, statusPurpose);
		// if no such statusList - error
		if (statusList.error) {
			return this.returnError(
				StatusCodes.BAD_REQUEST,
				`Cannot get status list from the ledger. Cannot search for statusList. Error: ${statusList.error}`
			);
		}
		// if status list is empty - error
		if (!statusList.resource) {
			return this.returnError(
				StatusCodes.BAD_GATEWAY,
				`Cannot get status list from the ledger. Cannot search for statusList. Error: ${statusList.error}`
			);
		}
		this.statusList = statusList.resource;
		return this.returnOk();
	}

	public isPaymentNeeded(): boolean {
		if (!this.statusList) {
			return false;
		}
		return this.statusList.metadata.encrypted;
	}

	public async makeFeePayment(agent: IIdentityService, customer: CustomerEntity): Promise<ICommonErrorResponse> {
		const did = this.issuer;
		const statusList = this.statusList;

		// make fee payment
		const feePaymentResult = await Promise.all(
			statusList?.metadata?.paymentConditions?.map(async (condition) => {
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
