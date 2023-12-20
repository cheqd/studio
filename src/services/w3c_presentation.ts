import { StatusCodes } from 'http-status-codes';
import type { ICommonErrorResponse } from '../types/authentication.js';
import type {
	CompactJWT,
	ContextType,
	UnsignedPresentation,
	VerifiablePresentation,
	W3CVerifiablePresentation,
} from '@veramo/core';
import { jwtDecode, type JwtPayload } from 'jwt-decode';
import type { IIdentityService } from './identity/index.js';
import type { CustomerEntity } from '../database/entities/customer.entity.js';
import { CheqdW3CVerifiableCredential } from './w3c_credential.js';
import { CommonReturn } from '../types/shared.js';
import { JWT_PROOF_TYPE } from '../types/constants.js';

export interface ICheqdPresentation extends UnsignedPresentation {
	proof: {
		type: string;
		jwt: string;
	};
}

export interface IJWTPayloadVP extends JwtPayload {
	vp: ICheqdPresentation;
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
		this.issuanceDate = presentation.issuanceDate;
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
		// nbf - issuanceDate
		presentation.issuanceDate = new Date((decoded.nbf as number) * 1000).toISOString();
		presentation.proof = {
			type: JWT_PROOF_TYPE,
			jwt: jwt,
		};
		return presentation as VerifiablePresentation;
	}

	public isPaymentNeeded(): boolean {
		if (this.verifiableCredential) {
			return this.verifiableCredential
				.filter((credential) => credential.credentialStatus)
				.some(async (credential) => await credential.isPaymentNeeded());
		}
		return false;
	}

	public async trySetStatusList2021(agent: IIdentityService): Promise<ICommonErrorResponse> {
		// It returns an error only if there is logical errors inside
		if (this.verifiableCredential) {
			const setResults = await Promise.all(
				this.verifiableCredential
					.filter((credential) => credential.credentialStatus)
					.map(
						async (credential) =>
							(await credential.trySetStatusList2021(agent)) satisfies ICommonErrorResponse
					)
			);
			if (setResults.some((setResult) => setResult.error)) {
				return this.returnError(
					StatusCodes.BAD_REQUEST,
					`Errors while setting statusList2021: ${setResults.filter((setResult) => setResult.error)}`
				);
			}
		}
		return this.returnOk();
	}

	public async makeFeePayment(agent: IIdentityService, customer: CustomerEntity): Promise<ICommonErrorResponse> {
		// If no credentials in presentation we cannot make payments
		if (!this.verifiableCredential) {
			return this.returnError(
				StatusCodes.BAD_REQUEST,
				'Verifiable credentials are not placed in presentation. Cannot make fee payment.'
			);
		}

		const feePaymentResults = await Promise.all(
			this.verifiableCredential
				.filter((credential) => credential.credentialStatus)
				.map(async (credential) => await credential.makeFeePayment(agent, customer))
		);

		if (feePaymentResults.some((result) => result.error)) {
			return this.returnError(
				StatusCodes.BAD_REQUEST,
				`Errors while making payment for the presentation: ${feePaymentResults.filter(
					(result) => result.error
				)}`
			);
		}
		return this.returnOk();
	}
}
