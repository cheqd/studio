import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

import { check, query } from '../validator/index.js';
import { IdentityServiceStrategySetup } from '../../services/identity/index.js';
import { OwnershipError } from '../../services/identity/ownership-error.js';
import { CheqdW3CVerifiablePresentation } from '../../services/w3c-presentation.js';
import type {
	CreatePresentationRequestBody,
	CreatePresentationResponseBody,
	UnsuccessfulCreatePresentationResponseBody,
	UnsuccessfulVerifyCredentialResponseBody,
	VerifyPresentationRequestBody,
	VerifyPresentationResponseBody,
	VerifyPresentationResponseQuery,
} from '../../types/presentation.js';
import { isIssuerDidDeactivated } from '../../services/helpers.js';
import { OperationCategoryNameEnum, OperationNameEnum } from '../../types/constants.js';
import { eventTracker } from '../../services/track/tracker.js';
import type { IFeePaymentOptions, IPresentationTrack, ITrackOperation } from '../../types/track.js';
import { validate } from '../validator/decorator.js';
import { PresentationBindingRequiredError } from '../../services/identity/engine/credo/errors.js';
import { engineErrorResponse } from '../../helpers/engine-errors.js';

export class PresentationController {
	public static presentationCreateValidator = [
		check('credentials')
			.exists()
			.withMessage('W3c verifiable credentials were not provided')
			.isW3CCheqdCredentials()
			.withMessage('Provide an array of valid w3c verifiable credentials')
			.bail(),
		check('holderDid').optional().isDID().bail(),
		check('verifierDid').optional().isDID().bail(),
		check('challenge')
			.optional()
			.isString()
			.withMessage('challenge: should be a string')
			.bail()
			.isLength({ min: 1, max: 1024 })
			.withMessage('challenge: should be between 1 and 1024 characters')
			.bail(),
		check('policies').optional().isObject().withMessage('Verification policies should be an object').bail(),
	];

	public static presentationVerifyValidator = [
		check('presentation')
			.exists()
			.withMessage('W3c verifiable presentation was not provided')
			.isW3CCheqdPresentation()
			.withMessage('Provide a valid w3c verifiable presentation')
			.bail(),
		check('verifierDid').optional().isDID().bail(),
		check('challenge')
			.optional()
			.isString()
			.withMessage('challenge: should be a string')
			.bail()
			.isLength({ min: 1, max: 1024 })
			.withMessage('challenge: should be between 1 and 1024 characters')
			.bail(),
		check('policies').optional().isObject().withMessage('Verification policies should be an object').bail(),
		check('makeFeePayment')
			.optional()
			.isBoolean()
			.withMessage('makeFeePayment: should be a boolean')
			.toBoolean()
			.bail(),
		query('verifyStatus')
			.optional()
			.isBoolean()
			.withMessage('verifyStatus should be a boolean value')
			.toBoolean()
			.bail(),
		query('allowDeactivatedDid')
			.optional()
			.isBoolean()
			.withMessage('allowDeactivatedDid should be a boolean value')
			.toBoolean()
			.bail(),
		query('fetchRemoteContexts')
			.optional()
			.isBoolean()
			.withMessage('fetchRemoteContexts should be a boolean value')
			.toBoolean()
			.bail(),
	];

	/**
	 * @openapi
	 *
	 * /presentation/create:
	 *   post:
	 *     tags: [ Verifiable Presentations ]
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
	@validate
	public async createPresentation(request: Request, response: Response) {
		const { credentials, holderDid, verifierDid, challenge } = request.body as CreatePresentationRequestBody;

		try {
			const result = await (
				await new IdentityServiceStrategySetup(response.locals.customer.customerId).routed('presentation')
			).createPresentation(
				{
					verifiableCredential: credentials,
					holder: holderDid,
				},
				{
					domain: verifierDid,
					challenge,
				},
				response.locals.customer
			);
			if (result.error) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: result.error,
				} satisfies UnsuccessfulCreatePresentationResponseBody);
			}
			return response.status(StatusCodes.OK).json(result satisfies CreatePresentationResponseBody);
		} catch (error) {
			const tenantMissing = engineErrorResponse(response, error);
			if (tenantMissing) return tenantMissing;
			if (error instanceof OwnershipError) {
				return response.status(StatusCodes.FORBIDDEN).json({
					error: error.message,
				} satisfies UnsuccessfulCreatePresentationResponseBody);
			}
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies UnsuccessfulCreatePresentationResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /presentation/verify:
	 *   post:
	 *     tags: [ Verifiable Presentations ]
	 *     summary: Verify a Verifiable Presentation generated from credential(s).
	 *     description: This endpoint verifies the Verifiable Presentation generated from credential(s). As input, it can take the Verifiable Presentation JWT as a string or the entire Verifiable Presentation itself. For customers served by the Credo engine, `challenge` (the value the verifier issued to the holder) and `verifierDid` (the domain the presentation was made for) are required, and a request without them is rejected with 400 `invalid_request`; `verifierDid` may be omitted only when `policies.audience` is `false`. The presentation's own nonce is never accepted in place of the challenge.
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
	 *               $ref: '#/components/schemas/VerifyPresentationResult'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async verifyPresentation(request: Request, response: Response) {
		// Set fee payment options
		let feePaymentOptions: IFeePaymentOptions[] = [];

		// Extract request parameters from body
		const { presentation, verifierDid, policies, makeFeePayment, challenge } =
			request.body as VerifyPresentationRequestBody;
		// Extract request parameters from query
		const { verifyStatus, allowDeactivatedDid } = request.query as VerifyPresentationResponseQuery;

		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);
		// create cheqd presentation from w3c presentation
		const cheqdPresentation = new CheqdW3CVerifiablePresentation(presentation);

		try {
			const engine = await identityServiceStrategySetup.routed('presentation');
			if (makeFeePayment) {
				const setResult = await cheqdPresentation.trySetStatusList2021(engine);
				if (setResult.error) {
					return response.status(setResult.status).send({
						error: setResult.error,
					} satisfies UnsuccessfulVerifyCredentialResponseBody);
				}
				if (cheqdPresentation.isPaymentNeeded()) {
					const feePaymentResult = await cheqdPresentation.makeFeePayment(engine, response.locals.customer);
					// Track fee payments
					feePaymentOptions = feePaymentResult.data;
					// handle error
					if (feePaymentResult.error) {
						// Track operation
						eventTracker.emit('track', {
							name: OperationNameEnum.PRESENTATION_VERIFY,
							category: OperationCategoryNameEnum.PRESENTATION,
							customer: response.locals.customer,
							user: response.locals.user,
							feePaymentOptions,
							data: {
								holder: cheqdPresentation.holder,
							},
							successful: false,
						} satisfies ITrackOperation<IPresentationTrack>);

						// Return error
						return response.status(StatusCodes.BAD_REQUEST).json({
							error: `verify: payment: error: ${feePaymentResult.error}`,
						} satisfies UnsuccessfulVerifyCredentialResponseBody);
					}
				}
			}
			if (!allowDeactivatedDid && (await isIssuerDidDeactivated(cheqdPresentation))) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: `Credential issuer DID is deactivated`,
				} satisfies UnsuccessfulVerifyCredentialResponseBody);
			}
			// verify presentation
			const result = await engine.verifyPresentation(
				cheqdPresentation,
				{
					verifyStatus,
					policies,
					domain: verifierDid,
					challenge,
				},
				response.locals.customer
			);
			// handle errors
			if (result.error) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					verified: result.verified,
					error: `verify: ${result.error.message}`,
				} satisfies UnsuccessfulVerifyCredentialResponseBody);
			}
			eventTracker.emit('track', {
				name: OperationNameEnum.PRESENTATION_VERIFY,
				category: OperationCategoryNameEnum.PRESENTATION,
				customer: response.locals.customer,
				user: response.locals.user,
				feePaymentOptions,
				data: {
					holder: cheqdPresentation.holder,
				},
				successful: true,
			} satisfies ITrackOperation<IPresentationTrack>);

			return response.status(StatusCodes.OK).json(result satisfies VerifyPresentationResponseBody);
		} catch (error) {
			if (error instanceof PresentationBindingRequiredError) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					verified: false,
					error: error.message,
					code: error.code,
				});
			}
			const tenantMissing = engineErrorResponse(response, error);
			if (tenantMissing) return tenantMissing;
			// define error
			const errorRef = error as Record<string, unknown>;
			// handle doesn't meet condition
			if (errorRef?.errorCode === 'NodeAccessControlConditionsReturnedNotAuthorized')
				return response.status(StatusCodes.UNAUTHORIZED).json({
					error: `check: error: ${
						errorRef?.message
							? 'unauthorized: decryption conditions are not met'
							: (error as Record<string, unknown>).toString()
					}`,
				} satisfies UnsuccessfulVerifyCredentialResponseBody);
			// handle incorrect access control conditions
			if (errorRef?.errorCode === 'incorrect_access_control_conditions')
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: `check: error: ${
						errorRef?.message
							? 'incorrect access control conditions'
							: (error as Record<string, unknown>).toString()
					}`,
				} satisfies UnsuccessfulVerifyCredentialResponseBody);
			// catch all other unhandled errors
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies UnsuccessfulVerifyCredentialResponseBody);
		}
	}
}
