import type { Request, Response } from 'express';
import type { VerifiableCredential } from '@veramo/core';
import { StatusCodes } from 'http-status-codes';

import { check, query, validationResult } from 'express-validator';

import { Credentials } from '../services/credentials.js';
import { IdentityServiceStrategySetup } from '../services/identity/index.js';
import jwt_decode from 'jwt-decode';

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
						jwt_decode(value);
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

	public static presentationValidator = [
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
						jwt_decode(value);
					} catch (e) {
						return false;
					}
				}
				return true;
			})
			.withMessage('An invalid JWT string'),
		check('verifierDid').optional().isString().withMessage('Invalid verifier DID'),
		check('policies').optional().isObject().withMessage('Verification policies should be an object'),
		query('verifyStatus').optional().isBoolean().withMessage('verifyStatus should be a boolean value'),
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
		const result = validationResult(request);
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array()[0].msg });
		}

		// Handles string input instead of an array
		if (typeof request.body.type === 'string') {
			request.body.type = [request.body.type];
		}
		if (typeof request.body['@context'] === 'string') {
			request.body['@context'] = [request.body['@context']];
		}

		const resolvedResult = await new IdentityServiceStrategySetup(response.locals.customerId).agent.resolve(
			request.body.issuerDid
		);
		const body = await resolvedResult.json();
		if (!body?.didDocument) {
			return response.status(resolvedResult.status).send({ body });
		}

		if (body.didDocumentMetadata.deactivated) {
			return response.status(StatusCodes.BAD_REQUEST).send({
				error: `${request.body.issuerDid} is deactivated`,
			});
		}

		try {
			const credential: VerifiableCredential = await Credentials.instance.issue_credential(
				request.body,
				response.locals.customerId
			);
			return response.status(StatusCodes.OK).json(credential);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `${error}`,
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
	 *               $ref: '#/components/schemas/IVerifyResult'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public async verify(request: Request, response: Response) {
		const result = validationResult(request);
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array()[0].msg });
		}

		const { credential, policies } = request.body;
		const verifyStatus = request.query.verifyStatus === 'true';
		const allowDeactivatedDid = request.query.allowDeactivatedDid === 'true';

		let issuerDid = '';
		if (typeof credential === 'object' && credential?.issuer?.id) {
			issuerDid = credential.issuer.id;
		} else {
			const decoded: any = jwt_decode(credential);
			issuerDid = decoded.iss;
		}

		if (!allowDeactivatedDid) {
			const result = await new IdentityServiceStrategySetup(response.locals.customerId).agent.resolve(issuerDid);
			const body = await result.json();
			if (!body?.didDocument) {
				return response.status(result.status).send({ body });
			}

			if (body.didDocumentMetadata.deactivated) {
				return response.status(StatusCodes.BAD_REQUEST).send({
					error: `${issuerDid} is deactivated`,
				});
			}
		}

		try {
			const result = await new IdentityServiceStrategySetup(response.locals.customerId).agent.verifyCredential(
				credential,
				{
					verifyStatus,
					policies,
				},
				response.locals.customerId
			);
			if (result.error) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					verified: result.verified,
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
		const result = validationResult(request);
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array()[0].msg });
		}

		const publish = request.query.publish === 'false' ? false : true;
		try {
			return response
				.status(StatusCodes.OK)
				.json(
					await new IdentityServiceStrategySetup(response.locals.customerId).agent.revokeCredentials(
						request.body.credential,
						publish,
						response.locals.customerId
					)
				);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `${error}`,
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
		const result = validationResult(request);
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array()[0].msg });
		}

		try {
			return response
				.status(StatusCodes.OK)
				.json(
					await new IdentityServiceStrategySetup(response.locals.customerId).agent.suspendCredentials(
						request.body.credential,
						request.body.publish,
						response.locals.customerId
					)
				);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `${error}`,
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
		const result = validationResult(request);
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array()[0].msg });
		}

		try {
			return response
				.status(StatusCodes.OK)
				.json(
					await new IdentityServiceStrategySetup(response.locals.customerId).agent.reinstateCredentials(
						request.body.credential,
						request.body.publish,
						response.locals.customerId
					)
				);
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
	 *     operationId: presentation
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

		const { presentation, verifierDid, policies } = request.body;
		const verifyStatus = request.query.verifyStatus === 'true';
		const allowDeactivatedDid = request.query.allowDeactivatedDid === 'true';

		let issuerDid = '';
		if (typeof presentation === 'object' && presentation?.issuer?.id) {
			issuerDid = presentation.issuer.id;
		} else {
			const decoded: any = jwt_decode(presentation);
			issuerDid = decoded.iss;
		}

		if (!allowDeactivatedDid) {
			const result = await new IdentityServiceStrategySetup(response.locals.customerId).agent.resolve(issuerDid);
			const body = await result.json();
			if (!body?.didDocument) {
				return response.status(result.status).send({ body });
			}

			if (body.didDocumentMetadata.deactivated) {
				return response.status(StatusCodes.BAD_REQUEST).send({
					error: `${issuerDid} is deactivated`,
				});
			}
		}

		try {
			const result = await new IdentityServiceStrategySetup(response.locals.customerId).agent.verifyPresentation(
				presentation,
				{
					verifyStatus,
					policies,
					domain: verifierDid,
				},
				response.locals.customerId
			);
			if (result.error) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					verified: result.verified,
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
}
