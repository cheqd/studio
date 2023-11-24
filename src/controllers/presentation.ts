import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

import { check, query, validationResult } from 'express-validator';
import { IIdentityService, IdentityServiceStrategySetup } from '../services/identity/index.js';
import { JwtPayload, jwtDecode } from 'jwt-decode';
import type { FeePaymentOptions } from '../types/shared.js';
import { toNetwork } from '../helpers/helpers.js';
import type { CompactJWT, ContextType, CredentialStatusReference, CredentialSubject, UnsignedCredential, UnsignedPresentation, VerifiableCredential, VerifiablePresentation, W3CVerifiableCredential, W3CVerifiablePresentation } from '@veramo/core';
import type { IReturn } from '../middleware/auth/routine.js';
import type { ICommonErrorResponse } from '../types/authentication.js';
import type { CustomerEntity } from '../database/entities/customer.entity.js';

export class PresentationController {

    public static presentationCreateValidator = [
        check('credential')
            .exists()
            .withMessage('W3c verifiable credential was not provided')
            .custom((value) => {
                if (typeof value === 'string' || typeof value === 'object') {
                    return true;
                }
                return false;
            })
            .withMessage('Entry must be a JWT or a credential body with JWT proof')
            .custom((value) => {
                if (typeof value === 'string') {
                    try {
                        jwtDecode(value);
                    } catch (e) {
                        return false;
                    }
                }
                return true;
            })
            .withMessage('An invalid JWT string'),
        check('holderDid').optional().isString().withMessage('Invalid holder DID'),
        check('verifierDid').optional().isString().withMessage('Invalid verifier DID'),
        check('policies').optional().isObject().withMessage('Verification policies should be an object'),
    ];

	public static presentationVerifyValidator = [
		check('presentation')
			.exists()
			.withMessage('W3c verifiable presentation was not provided')
			.custom((value) => {
				if (typeof value === 'string' || typeof value === 'object') {
					return true;
				}
				return false;
			})
			.withMessage('Entry must be a JWT or a presentation body with JWT proof')
			.custom((value) => {
				if (typeof value === 'string') {
					try {
						jwtDecode(value);
					} catch (e) {
						return false;
					}
				}
				return true;
			})
			.withMessage('An invalid JWT string'),
		check('verifierDid').optional().isString().withMessage('Invalid verifier DID'),
		check('policies').optional().isObject().withMessage('Verification policies should be an object'),
        check('makeFeePayment').optional().isBoolean().withMessage('makeFeePayment: should be a boolean').bail(),
		query('verifyStatus').optional().isBoolean().withMessage('verifyStatus should be a boolean value'),
	];

    /**
     * @openapi
     *
     * /presentation/create:
     *   post:
     *     tags: [ Presentation ]
     *     summary: Create a Verifiable Presentation from credential(s).
     *     description: This endpoint creates a Verifiable Presentation from credential(s). As input, it can take the credential(s) as a string or the entire credential(s) itself.
     *     requestBody:
     *       content:
     *         application/x-www-form-urlencoded:
     *           schema:
     *             $ref: '#/components/schemas/PresentationCreateRequest'
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/PresentationCreateRequest'
     *     responses:
     *       200:
     *         description: The request was successful.
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/PresentationCreateResult'
     *       400:
     *         $ref: '#/components/schemas/InvalidRequest'
     *       401:
     *         $ref: '#/components/schemas/UnauthorizedError'
     *       500:
     *         $ref: '#/components/schemas/InternalError'
     */

    public async createPresentation(request: Request, response: Response) {
        const result = validationResult(request);
        if (!result.isEmpty()) {
            return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array()[0].msg });
        }

        const { credential, holderDid, verifierDid } = request.body;

        try {
            const result = await new IdentityServiceStrategySetup(
                response.locals.customer.customerId
            ).agent.createPresentation(
                {
                    verifiableCredential: [credential],
                    holder: holderDid,
                },
                {
                    domain: verifierDid
                },
                response.locals.customer
            );
            if (result.error) {
                return response.status(StatusCodes.BAD_REQUEST).json({
                    presentation: result.presentation,
                    error: result.error,
                });
            }
            return response.status(StatusCodes.OK).json(result);
        } catch (error) {
            return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
                error: `${error}`,
            });
        }
    }

	/**
	 * @openapi
	 *
	 * /presentation/verify:
	 *   post:
	 *     tags: [ Presentation ]
	 *     summary: Verify a Verifiable Presentation generated from credential(s).
	 *     description: This endpoint verifies the Verifiable Presentation generated from credential(s). As input, it can take the Verifiable Presentation JWT as a string or the entire Verifiable Presentation itself.
	 *     parameters:
	 *       - in: query
	 *         name: verifyStatus
	 *         description: If set to `true` the verification will also check the status of the presentation. Requires the VP to have a `credentialStatus` property.
	 *         schema:
	 *           type: boolean
	 *           default: false
	 *       - in: query
	 *         name: fetchRemoteContexts
	 *         description: When dealing with JSON-LD you also MUST provide the proper contexts. * Set this to `true` ONLY if you want the `@context` URLs to be fetched in case they are a custom context.
	 *         schema:
	 *           type: boolean
	 *           default: false
	 *       - in: query
	 *         name: allowDeactivatedDid
	 *         description: If set to `true` allow to verify credential which based on deactivated DID.
	 *         schema:
	 *           type: boolean
	 *           default: false
	 *     requestBody:
	 *       content:
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             $ref: '#/components/schemas/PresentationVerifyRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/PresentationVerifyRequest'
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/IVerifyResult'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public async verifyPresentation(request: Request, response: Response) {
		const result = validationResult(request);
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array()[0].msg });
		}

		const { presentation, verifierDid, policies, makeFeePayment } = request.body;
		const verifyStatus = request.query.verifyStatus === 'true';
		const allowDeactivatedDid = request.query.allowDeactivatedDid === 'true';


        // define identity service strategy setup
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);
        // create cheqd presentation from w3c presentation
        const cheqdPresentation = new CheqdW3CVerifiablePresentation(presentation);
        // get holder did
        const holderDid = cheqdPresentation.holder;

		if (!allowDeactivatedDid) {
			const result = await new IdentityServiceStrategySetup().agent.resolve(holderDid);
			const body = await result.json();
			if (!body?.didDocument) {
				return response.status(result.status).send({ body });
			}

			if (body.didDocumentMetadata.deactivated) {
				return response.status(StatusCodes.BAD_REQUEST).send({
					error: `${holderDid} is deactivated`,
				});
			}
		}

        if (makeFeePayment) {
            const feePaymentResult = await cheqdPresentation.makeFeePayment(identityServiceStrategySetup.agent, response.locals.customer);
            if (feePaymentResult.error) {
                return response.status(StatusCodes.BAD_REQUEST).json({
                    checked: false,
                    error: `verify: payment: error: ${feePaymentResult.error}`,
                });
            }
        }

		try {
			const result = await identityServiceStrategySetup.agent.verifyPresentation(
				cheqdPresentation,
				{
					verifyStatus,
					policies,
					domain: verifierDid,
				},
				response.locals.customer
			);
			if (result.error) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					verified: result.verified,
					error: result.error.message,
				});
			}
			return response.status(StatusCodes.OK).json(result);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `${JSON.stringify(error)}`,
			});
		}
	}
}

export interface IErrorResponse {
    errorCode: string;
    message: string
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
    }
}

export interface ICheqdPresentation extends UnsignedPresentation{
    proof: {
        type: string;
        jwt: string;
    }
}

export interface IJWTPayloadVC extends JwtPayload {
    vc: ICheqdCredential;
}

export interface IJWTPayloadVP extends JwtPayload {
    vp: ICheqdPresentation;
}

// ToDo: make unit tests
export class CheqdW3CVerifiableCredential extends CommonReturn implements ICheqdCredential {
    issuer: string
    credentialSubject: CredentialSubject
    type?: string[] | string
    '@context': ContextType
    issuanceDate: string
    expirationDate?: string
    credentialStatus?: CredentialStatusReference
    id?: string
    proof: {
        type: string;
        jwt: string;
    }

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
            id: decoded.iss as string
        };
        credential.issuanceDate = new Date(decoded.nbf as number * 1000).toISOString();
        credential.credentialSubject.id = decoded.sub as string;
        credential.proof = {
            type: "JwtProof2020",
            jwt: jwt,
        }
        return credential as VerifiableCredential;
    }

    public async makeFeePayment(agent: IIdentityService, customer: CustomerEntity): Promise<ICommonErrorResponse>{
        if (!this.credentialStatus) {
            return this.returnError(StatusCodes.BAD_REQUEST, 'Credential status is not placed in credential. Cannot make fee payment.');
        }
        const url = new URL(this.credentialStatus.id);
        const statusListName = url.searchParams.get('resourceName');
        const statusPurpose = this.credentialStatus.statusPurpose;
        const did = this.issuer;

        if (!statusListName) {
            return this.returnError(StatusCodes.BAD_REQUEST, 'Cannot get statusList name from the credential. Cannot make fee payment.');
        }
        if (!statusPurpose) {
            return this.returnError(StatusCodes.BAD_REQUEST, 'Cannot get status purpose from the credential. Cannot make fee payment.');
        }

        // ensure status list
        const statusList = await agent.searchStatusList2021(
			did,
			statusListName,
			statusPurpose
		);
        //if no such statusList - error
        if (!statusList) {
            return this.returnError(StatusCodes.BAD_REQUEST, 'Cannot get status list from the ledger. Cannot make fee payment.');
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
                `payment: error: ${feePaymentResult.find((result) => result.error)?.error}`);
        }

        return this.returnOk();
    }
}

// ToDo: make unit tests
export class CheqdW3CVerifiablePresentation extends CommonReturn implements ICheqdPresentation {
    holder: string
    verifiableCredential?: CheqdW3CVerifiableCredential[]
    type?: string[] | string
    '@context': ContextType
    verifier?: string[]
    issuanceDate?: string
    expirationDate?: string
    id?: string
    proof: {
        type: string;
        jwt: string;
    }

    constructor(w3Presentation: W3CVerifiablePresentation) {
        super();
        let presentation: VerifiablePresentation;
        presentation = w3Presentation as VerifiablePresentation;
        if (typeof w3Presentation === 'string') {
            presentation = this.fromVPCompactJWT(w3Presentation);
        }

        this['@context'] = presentation['@context'];
        this.type = presentation.type;
        this.verifiableCredential = presentation.verifiableCredential?.map((vc) => new CheqdW3CVerifiableCredential(vc));
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
            type: "JwtProof2020",
            jwt: jwt,
        }
        return presentation as VerifiablePresentation;
    }

    public async makeFeePayment(agent: IIdentityService, customer: CustomerEntity): Promise<ICommonErrorResponse>{
        if (!this.verifiableCredential) {
            return this.returnError(StatusCodes.BAD_REQUEST, 'Verifiable credentials are not placed in presentation. Cannot make fee payment.');
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
                `payment: error: ${feePaymentResults.find((result) => result.error)?.error}`);
        }

        return this.returnOk();
    }
}