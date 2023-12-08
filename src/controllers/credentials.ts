import type { Request, Response } from 'express';
import type { VerifiableCredential } from '@veramo/core';
import { StatusCodes } from 'http-status-codes';

import { check, query, validationResult } from 'express-validator';

import { Credentials } from '../services/credentials.js';
import { IdentityServiceStrategySetup } from '../services/identity/index.js';
import { jwtDecode } from 'jwt-decode';
import type { ITrackOperation } from '../types/shared.js';
import { Cheqd } from '@cheqd/did-provider-cheqd';
import { OPERATION_CATEGORY_NAME_CREDENTIAL } from '../types/constants.js';

export class CredentialController {
	public static issueValidator = [
		check(['subjectDid', 'issuerDid'])
			.exists()
			.withMessage('DID is required')
			.isString()
			.withMessage('DID should be a string')
			.contains('did:')
			.withMessage('Invalid DID'),
		check('attributes')
			.exists()
			.withMessage('attributes are required')
			.isObject()
			.withMessage('attributes should be an object'),
		check('expirationDate').optional().isDate().withMessage('Invalid expiration date'),
		check('format').optional().isString().withMessage('Invalid credential format'),
	];

	public static credentialValidator = [
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
		check('policies').optional().isObject().withMessage('Verification policies should be an object'),
		query('verifyStatus').optional().isBoolean().withMessage('verifyStatus should be a boolean value'),
		query('publish').optional().isBoolean().withMessage('publish should be a boolean value'),
	];

	/**
	 * @openapi
	 *
	 * /credential/issue:
	 *   post:
	 *     tags: [ Credential ]
	 *     summary: Issue a Verifiable Credential
	 *     description: This endpoint issues a Verifiable Credential. As input it takes the list of issuerDid, subjectDid, attributes, and other parameters of the credential to be issued.
	 *     requestBody:
	 *       content:
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             $ref: '#/components/schemas/CredentialRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/CredentialRequest'
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/Credential'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public async issue(request: Request, response: Response) {
		// validate request
		const result = validationResult(request);
		// handle error
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array().pop()?.msg });
		}

		// Handles string input instead of an array
		if (typeof request.body.type === 'string') {
			request.body.type = [request.body.type];
		}
		if (typeof request.body['@context'] === 'string') {
			request.body['@context'] = [request.body['@context']];
		}

		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);

		try {
			// resolve issuer DID-Document
			const resolvedResult = await identityServiceStrategySetup.agent.resolve(request.body.issuerDid);
			// check if DID-Document is resolved
			const body = await resolvedResult.json();
			if (!body?.didDocument) {
				return response.status(resolvedResult.status).send({ body });
			}
			if (body.didDocumentMetadata.deactivated) {
				return response.status(StatusCodes.BAD_REQUEST).send({
					error: `${request.body.issuerDid} is deactivated`,
				});
			}
			// issue credential
			const credential: VerifiableCredential = await Credentials.instance.issue_credential(
				request.body,
				response.locals.customer
			);
			return response.status(StatusCodes.OK).json(credential);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			});
		}
	}

	/**
	 * @openapi
	 *
	 * /credential/verify:
	 *   post:
	 *     tags: [ Credential ]
	 *     summary: Verify a Verifiable Credential.
	 *     description: This endpoint verifies a Verifiable Credential passed to it. As input, it can take the VC-JWT as a string or the entire credential itself.
	 *     operationId: verify
	 *     parameters:
	 *       - in: query
	 *         name: verifyStatus
	 *         description: If set to `true` the verification will also check the status of the credential. Requires the VC to have a `credentialStatus` property.
	 *         schema:
	 *           type: boolean
	 *           default: false
	 *       - in: query
	 *         name: fetchRemoteContexts
	 *         description: When dealing with JSON-LD you also MUST provide the proper contexts. Set this to `true` ONLY if you want the `@context` URLs to be fetched in case they are a custom context.
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
	 *             $ref: '#/components/schemas/CredentialVerifyRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/CredentialVerifyRequest'
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/VerifyCredentialResult'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public async verify(request: Request, response: Response) {
		// validate request
		const result = validationResult(request);
		// handle error
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array().pop()?.msg });
		}
		// Get params from request
		const { credential, policies } = request.body;
		const verifyStatus = request.query.verifyStatus === 'true';
		const allowDeactivatedDid = request.query.allowDeactivatedDid === 'true';
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup();

		try {
			if (!allowDeactivatedDid && await this.isIssuerDidDeactivated(credential)) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: `Credential issuer DID is deactivated`,
				});
			}

			const verifyResult = await identityServiceStrategySetup.agent.verifyCredential(
				credential,
				{
					verifyStatus,
					policies,
				},
				response.locals.customer
			);
			if (verifyResult.error) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					verified: verifyResult.verified,
					error: verifyResult.error.message,
				});
			}
			return response.status(StatusCodes.OK).json(verifyResult);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			});
		}
	}

	// ToDo: move it to helpers
	private async isIssuerDidDeactivated(credential: any) {
		let issuerDid = '';
		const identityServiceStrategySetup = new IdentityServiceStrategySetup();

		if (typeof credential === 'object' && credential?.issuer?.id) {
			issuerDid = credential.issuer.id;
		} else {
			const decoded: any = jwtDecode(credential);
			issuerDid = decoded.iss;
		}
		
		const resolutionResult = await identityServiceStrategySetup.agent.resolve(issuerDid);
		const body = await resolutionResult.json();

		return body.didDocumentMetadata.deactivated
	}

	/**
	 * @openapi
	 *
	 * /credential/revoke:
	 *   post:
	 *     tags: [ Credential ]
	 *     summary: Revoke a Verifiable Credential.
	 *     description: This endpoint revokes a given Verifiable Credential. As input, it can take the VC-JWT as a string or the entire credential itself. The StatusList2021 resource should already be setup in the VC and `credentialStatus` property present in the VC.
	 *     operationId: revoke
	 *     parameters:
	 *       - in: query
	 *         name: publish
	 *         description: Set whether the StatusList2021 resource should be published to the ledger or not. If set to `false`, the StatusList2021 publisher should manually publish the resource.
	 *         required: true
	 *         schema:
	 *           type: boolean
	 *           default: true
	 *     requestBody:
	 *       content:
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             $ref: '#/components/schemas/CredentialRevokeRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/CredentialRevokeRequest'
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/RevocationResult'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public async revoke(request: Request, response: Response) {
		// validate request
		const result = validationResult(request);
		// handle error
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array().pop()?.msg });
		}
		// Get publish flag
		const publish = request.query.publish === 'false' ? false : true;
		// Get symmetric key
		const symmetricKey = request.body.symmetricKey as string;
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);

		try {
			const result = await identityServiceStrategySetup.agent.revokeCredentials(
				request.body.credential,
				publish,
				response.locals.customer,
				symmetricKey
			);
			// Track operation if revocation was successful and publish is true
			// Otherwise the StatusList2021 publisher should manually publish the resource
			// and it will be tracked there
			if (!result.error && result.resourceMetadata && publish) {
				// decode credential for getting issuer did
				const credential =
					typeof request.body.credential === 'string'
						? await Cheqd.decodeCredentialJWT(request.body.credential)
						: request.body.credential;
				// get issuer did
				const issuerDid =
					typeof credential.issuer === 'string'
						? credential.issuer
						: (credential.issuer as { id: string }).id;
				const trackInfo = {
					category: OPERATION_CATEGORY_NAME_CREDENTIAL,
					operation: 'revoke',
					customer: response.locals.customer,
					user: response.locals.user,
					did: issuerDid,
					data: {
						encrypted: result.statusList?.metadata?.encrypted,
						resource: result.resourceMetadata,
						symmetricKey: '',
					},
				} as ITrackOperation;

				// Track operation
				const trackResult = await identityServiceStrategySetup.agent.trackOperation(trackInfo);
				if (trackResult.error) {
					return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
						error: trackResult.error,
					});
				}
			}
			// Return Ok response
			return response.status(StatusCodes.OK).json(result);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			});
		}
	}

	/**
	 * @openapi
	 *
	 * /credential/suspend:
	 *   post:
	 *     tags: [ Credential ]
	 *     summary: Suspend a Verifiable Credential.
	 *     description: This endpoint suspends a given Verifiable Credential.  As input, it can take the VC-JWT as a string or the entire credential itself.
	 *     operationId: suspend
	 *     parameters:
	 *       - in: query
	 *         name: publish
	 *         description: Set whether the StatusList2021 resource should be published to the ledger or not. If set to `false`, the StatusList2021 publisher should manually publish the resource.
	 *         schema:
	 *           type: boolean
	 *     requestBody:
	 *       content:
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             $ref: '#/components/schemas/CredentialRevokeRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/CredentialRevokeRequest'
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/SuspensionResult'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public async suspend(request: Request, response: Response) {
		// validate request
		const result = validationResult(request);
		// handle error
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array().pop()?.msg });
		}

		// Get publish flag
		const publish = request.query.publish === 'false' ? false : true;
		// Get symmetric key
		const symmetricKey = request.body.symmetricKey as string;
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);

		try {

			const result = await identityServiceStrategySetup.agent.suspendCredentials(
				request.body.credential,
				publish,
				response.locals.customer,
				symmetricKey
			);

			// Track operation if suspension was successful and publish is true
			// Otherwise the StatusList2021 publisher should manually publish the resource
			// and it will be tracked there
			if (!result.error && result.resourceMetadata && publish) {
				// decode credential for getting issuer did
				const credential =
					typeof request.body.credential === 'string'
						? await Cheqd.decodeCredentialJWT(request.body.credential)
						: request.body.credential;
				// get issuer did
				const issuerDid =
					typeof credential.issuer === 'string'
						? credential.issuer
						: (credential.issuer as { id: string }).id;
				const trackInfo = {
					category: OPERATION_CATEGORY_NAME_CREDENTIAL,
					operation: 'suspend',
					customer: response.locals.customer,
					user: response.locals.user,
					did: issuerDid,
					data: {
						encrypted: result.statusList?.metadata?.encrypted,
						resource: result.resourceMetadata,
						symmetricKey: '',
					},
				} as ITrackOperation;

				// Track operation
				const trackResult = await identityServiceStrategySetup.agent.trackOperation(trackInfo);
				if (trackResult.error) {
					return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
						error: trackResult.error,
					});
				}
			}

			return response.status(StatusCodes.OK).json(result);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			});
		}
	}

	/**
	 * @openapi
	 *
	 * /credential/reinstate:
	 *   post:
	 *     tags: [ Credential ]
	 *     summary: Reinstate a suspended Verifiable Credential.
	 *     description: Set whether the StatusList2021 resource should be published to the ledger or not. If set to `false`, the StatusList2021 publisher should manually publish the resource.
	 *     operationId: reinstate
	 *     parameters:
	 *       - in: query
	 *         name: publish
	 *         description: Set whether the StatusList2021 resource should be published to the ledger or not. If set to `false`, the StatusList2021 publisher should manually publish the resource.
	 *         schema:
	 *           type: boolean
	 *     requestBody:
	 *       content:
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             $ref: '#/components/schemas/CredentialRevokeRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/CredentialRevokeRequest'
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/UnsuspensionResult'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public async reinstate(request: Request, response: Response) {
		// validate request
		const result = validationResult(request);
		// handle error
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array().pop()?.msg });
		}
		// Get publish flag
		const publish = request.query.publish === 'false' ? false : true;
		// Get symmetric key
		const symmetricKey = request.body.symmetricKey as string;
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);

		try {
			const result = await identityServiceStrategySetup.agent.reinstateCredentials(
				request.body.credential,
				publish,
				response.locals.customer,
				symmetricKey
			);
			// Track operation if the process of reinstantiating was successful and publish is true
			// Otherwise the StatusList2021 publisher should manually publish the resource
			// and it will be tracked there
			if (!result.error && result.resourceMetadata && publish) {
				// decode credential for getting issuer did
				const credential =
					typeof request.body.credential === 'string'
						? await Cheqd.decodeCredentialJWT(request.body.credential)
						: request.body.credential;
				// get issuer did
				const issuerDid =
					typeof credential.issuer === 'string'
						? credential.issuer
						: (credential.issuer as { id: string }).id;
				const trackInfo = {
					category: OPERATION_CATEGORY_NAME_CREDENTIAL,
					operation: 'reinstate',
					customer: response.locals.customer,
					user: response.locals.user,
					did: issuerDid,
					data: {
						encrypted: result.statusList?.metadata?.encrypted,
						resource: result.resourceMetadata,
						symmetricKey: '',
					},
				} as ITrackOperation;

				// Track operation
				const trackResult = await identityServiceStrategySetup.agent.trackOperation(trackInfo);
				if (trackResult.error) {
					return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
						error: trackResult.error,
					});
				}
			}
			// Return Ok response
			return response.status(StatusCodes.OK).json(result);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			});
		}
	}
}
