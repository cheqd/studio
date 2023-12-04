import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

import { check, query, validationResult } from 'express-validator';
import { IdentityServiceStrategySetup } from '../services/identity/index.js';
import { jwtDecode } from 'jwt-decode';

export class PresentationController {
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
        // validate request
        const result = validationResult(request);

        // handle error
        if (!result.isEmpty()) {
            return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array().pop()?.msg });
        }

		const { presentation, verifierDid, policies } = request.body;
		const verifyStatus = request.query.verifyStatus === 'true';
		const allowDeactivatedDid = request.query.allowDeactivatedDid === 'true';

		let issuerDid = '';
		if (typeof presentation === 'object' && presentation?.issuer?.id) {
			issuerDid = presentation.issuer.id;
		} else {
			const decoded: any = jwtDecode(presentation);
			issuerDid = decoded.iss;
		}

		if (!allowDeactivatedDid) {
			const result = await new IdentityServiceStrategySetup().agent.resolve(issuerDid);
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
			const result = await new IdentityServiceStrategySetup().agent.verifyPresentation(
				presentation,
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