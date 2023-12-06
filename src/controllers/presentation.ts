import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

import { check, query, validationResult } from 'express-validator';
import { IdentityServiceStrategySetup } from '../services/identity/index.js';
import { jwtDecode } from 'jwt-decode';
import { CheqdW3CVerifiablePresentation } from '../services/w3c_presentation.js';

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
		check('policies').optional().isObject().withMessage('Verification policies should be an Object'),
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
						return true;
					} catch (e) {
						return false;
					}
				} else {
					return value.isJSON();
				}
			})
			.withMessage('Presentation is invalid provide a valid JWT string or JSON'),
		check('verifierDid').optional().isString().withMessage('Invalid verifier DID'),
		check('policies').optional().isObject().withMessage('Verification policies should be an Object'),
		check('makeFeePayment').optional().isBoolean().withMessage('makeFeePayment: should be a boolean').bail(),
		query('verifyStatus').optional().isBoolean().withMessage('verifyStatus should be a boolean value'),
	];

	/**
	 * @openapi
	 *
	 * /presentation/create:
	 *   post:
	 *     tags: [ Presentation ]
	 *     summary: "!!! WARN. Such endpoint is made mostly for testing purposes and it is not supposed to be used in production !!! Create a Verifiable Presentation from credential(s)."
	 *     description: "This endpoint creates a Verifiable Presentation from credential(s). As input, it can take the credential(s) as a string or the entire credential(s) itself. \n !!! WARN. Such endpoint is made only for testing purposes !!!"
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

		const { credentials, holderDid, verifierDid } = request.body;

		try {
			const result = await new IdentityServiceStrategySetup(
				response.locals.customer.customerId
			).agent.createPresentation(
				{
					verifiableCredential: credentials,
					holder: holderDid,
				},
				{
					domain: verifierDid,
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
				error: `Internal error: ${(error as Error)?.message || error}`,
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
			const resolutionResult = await new IdentityServiceStrategySetup().agent.resolveDid(holderDid);

			if (resolutionResult.didDocumentMetadata.deactivated) {
				return response.status(StatusCodes.BAD_REQUEST).send({
					error: `${holderDid} is deactivated`,
				});
			}
		}

		if (makeFeePayment) {
			const feePaymentResult = await cheqdPresentation.makeFeePayment(
				identityServiceStrategySetup.agent,
				response.locals.customer
			);
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
				error: `Internal error: ${(error as Error)?.message || error}`,
			});
		}
	}
}
