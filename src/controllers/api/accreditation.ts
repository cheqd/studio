import type { Request, Response } from 'express';
import type { VerifiableCredential } from '@veramo/core';
import type {
	DIDAccreditationRequestBody,
	DIDAccreditationRequestParams,
	VerifyAccreditationRequestBody,
} from '../../types/accreditation.js';
import type { ICredentialTrack, ITrackOperation } from '../../types/track.js';
import type { CredentialRequest } from '../../types/credential.js';
import { StatusCodes } from 'http-status-codes';
import { v4 } from 'uuid';
import {
	AccreditationRequestType,
	DIDAccreditationTypes,
	isDidAndResourceId,
	isDidAndResourceName,
	isDidUrl,
} from '../../types/accreditation.js';
import { CredentialConnectors, VerifyCredentialRequestQuery } from '../../types/credential.js';
import { OperationCategoryNameEnum, OperationNameEnum } from '../../types/constants.js';
import { IdentityServiceStrategySetup } from '../../services/identity/index.js';
import { AccreditationService } from '../../services/api/accreditation.js';
import { Credentials } from '../../services/api/credentials.js';
import { eventTracker } from '../../services/track/tracker.js';
import { body, query } from '../validator/index.js';
import { validate } from '../validator/decorator.js';
import { parseDidFromDidUrl } from '../../helpers/helpers.js';

export class AccreditationController {
	public static issueValidator = [
		query('accreditationType')
			.exists()
			.isIn([
				AccreditationRequestType.authorize,
				AccreditationRequestType.accredit,
				AccreditationRequestType.attest,
			])
			.bail(),
		body('issuerDid').exists().isString().isDID().bail(),
		body('subjectDid').exists().isString().isDID().bail(),
		body('schemas').exists().isArray().bail(),
		body('schemas.*.url').isURL().bail(),
		body('schemas.*.type').custom(
			(value) => typeof value === 'string' || (Array.isArray(value) && typeof value[0] === 'string')
		),
		body('parentAccreditation').optional().bail(),
		body('rootAuthorization').optional().bail(),
		query('accreditationType')
			.custom((value, { req }) => {
				const { parentAccreditation, rootAuthorization, trustFramework, trustFrameworkId } = req.body;

				const hasParentOrRoot = parentAccreditation || rootAuthorization;

				if (
					!hasParentOrRoot &&
					(value === AccreditationRequestType.accredit || value === AccreditationRequestType.attest)
				) {
					throw new Error('parentAccreditation or rootAuthorization is required');
				}

				if (hasParentOrRoot && value === AccreditationRequestType.authorize) {
					throw new Error(
						'parentAccreditation or rootAuthorization is not required for an authorize operation'
					);
				}

				const hasTrustFramewok = trustFramework && trustFrameworkId;

				if (!hasTrustFramewok && value === AccreditationRequestType.authorize) {
					throw new Error('trustFramework and trustFrameworkId are required for an authorize operation');
				}

				return true;
			})
			.bail(),
		body('accreditationName').exists().isString(),
	];

	public static verifyValidator = [
		body('did')
			.custom((value, { req }) => {
				const { didUrl, resourceId, resourceName, resourceType } = req.body;
				if (!value && !didUrl) {
					throw new Error('Either "did" or "didUrl" is required');
				}

				// If did is provided, ensure either resourceId or both resourceName and resourceType are provided
				if (value && !(resourceId || (resourceName && resourceType))) {
					throw new Error('Either "resourceId" or both "resourceName" and "resourceType" are required');
				}
				return true;
			})
			.bail(),
		body('subjectDid').exists().isDID().bail(),
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
		query('policies').optional().isObject().withMessage('Verification policies should be an object').bail(),
	];

	/**
	 * @openapi
	 *
	 * /trust-registry/accreditation/issue:
	 *   post:
	 *     tags: [ Trust Registry ]
	 *     summary: Publish a verifiable accreditation for a DID.
	 *     description: Generate and publish a verifiable accreditation for a subject DID accrediting schema's as a DID Linked resource.
	 *     operationId: accredit-issue
	 *     parameters:
	 *       - in: query
	 *         name: accreditationType
	 *         description: Select the type of accreditation to be issued.
	 *         schema:
	 *           type: string
	 *           enum:
	 *              - authorize
	 *              - accredit
	 *              - attest
	 *         required: true
	 *     requestBody:
	 *       content:
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             $ref: '#/components/schemas/AccreditationIssueRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/AccreditationIssueRequest'
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
	@validate
	public async issue(request: Request, response: Response) {
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup();
		// Extract did from params
		const { accreditationType } = request.query as DIDAccreditationRequestParams;

		// Handles string input instead of an array
		if (typeof request.body.type === 'string') {
			request.body.type = [request.body.type];
		}
		if (typeof request.body['@context'] === 'string') {
			request.body['@context'] = [request.body['@context']];
		}

		const {
			issuerDid,
			subjectDid,
			schemas,
			type,
			parentAccreditation,
			rootAuthorization,
			trustFramework,
			trustFrameworkId,
			attributes,
			accreditationName,
			format,
		} = request.body as DIDAccreditationRequestBody;

		try {
			// Validte issuer DID
			const resolvedResult = await identityServiceStrategySetup.agent.resolve(issuerDid);
			// check if DID-Document is resolved
			const body = await resolvedResult.json();
			if (!body?.didDocument) {
				return response.status(StatusCodes.BAD_REQUEST).send({
					error: `DID ${issuerDid} is not resolved because of error from resolver: ${body.didResolutionMetadata.error}.`,
				});
			}
			if (body.didDocumentMetadata.deactivated) {
				return response.status(StatusCodes.BAD_REQUEST).send({
					error: `${issuerDid} is deactivated`,
				});
			}

			// Validate subject DID
			const res = await identityServiceStrategySetup.agent.resolve(subjectDid);
			const subjectDidRes = await res.json();
			if (!subjectDidRes?.didDocument) {
				return response.status(StatusCodes.BAD_REQUEST).send({
					error: `DID ${subjectDid} is not resolved because of error from resolver: ${body.didResolutionMetadata.error}.`,
				});
			}
			if (subjectDidRes.didDocumentMetadata.deactivated) {
				return response.status(StatusCodes.BAD_REQUEST).send({
					error: `${subjectDid} is deactivated`,
				});
			}

			const resourceId = v4();
			// construct credential request
			const credentialRequest: CredentialRequest = {
				subjectDid,
				attributes: {
					...attributes,
					accreditedFor: schemas.map(({ url, type }: any) => ({
						schemaId: url,
						type,
					})),
					id: subjectDid,
				},
				issuerDid,
				format: format || 'jwt',
				connector: CredentialConnectors.Resource, // resource connector
				credentialId: resourceId,
				credentialName: accreditationName,
			};

			let resourceType: string;
			switch (accreditationType) {
				case AccreditationRequestType.authorize:
					resourceType = DIDAccreditationTypes.VerifiableAuthorisationForTrustChain;
					credentialRequest.type = [...(type || []), resourceType];
					credentialRequest.termsOfUse = {
						type: resourceType,
						trustFramework,
						trustFrameworkId,
					};
					break;
				case AccreditationRequestType.accredit:
					resourceType = DIDAccreditationTypes.VerifiableAccreditationToAccredit;
					credentialRequest.type = [...(type || []), resourceType];
					credentialRequest.termsOfUse = {
						type: resourceType,
						parentAccreditation,
						rootAuthorization,
					};
					break;
				case AccreditationRequestType.attest:
					resourceType = DIDAccreditationTypes.VerifiableAccreditationToAttest;
					credentialRequest.type = [...(type || []), resourceType];
					credentialRequest.termsOfUse = {
						type: resourceType,
						parentAccreditation,
						rootAuthorization,
					};
					break;
			}

			// validate parent and root accreditations
			if (
				accreditationType === AccreditationRequestType.accredit ||
				accreditationType === AccreditationRequestType.attest
			) {
				const result = await AccreditationService.instance.verify_accreditation(
					issuerDid,
					parentAccreditation!,
					true,
					false,
					response.locals.customer,
					rootAuthorization
				);

				if (result.success === false) {
					return response.status(StatusCodes.BAD_REQUEST).send({
						error: `root Authorization or parent Accreditation is not valid`,
					});
				}
			}

			// issue accreditation
			const accreditation: VerifiableCredential = await Credentials.instance.issue_credential(
				credentialRequest,
				response.locals.customer
			);

			// Track operation
			const trackInfo = {
				category: OperationCategoryNameEnum.CREDENTIAL,
				name: OperationNameEnum.CREDENTIAL_ISSUE,
				customer: response.locals.customer,
				user: response.locals.user,
				data: {
					did: issuerDid,
				} satisfies ICredentialTrack,
			} as ITrackOperation;

			eventTracker.emit('track', trackInfo);

			return response.status(StatusCodes.OK).json({
				didUrls: [
					`${issuerDid}/resources/${resourceId}`,
					`${issuerDid}?resourceName=${accreditationName}&resourceType=${credentialRequest.type}`,
				],
				accreditation,
			});
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			});
		}
	}

	/**
	 * @openapi
	 *
	 * /trust-registry/accreditation/verify:
	 *   post:
	 *     tags: [ Trust Registry ]
	 *     summary: Verify a verifiable accreditation for a DID.
	 *     description: Generate and publish a verifiable accreditation for a subject DID accrediting schema's as a DID Linked resource.
	 *     operationId: accredit-verify
	 *     parameters:
	 *       - in: query
	 *         name: verifyStatus
	 *         description: If set to `true` the verification will also check the status of the accreditation. Requires the VC to have a `credentialStatus` property.
	 *         schema:
	 *           type: boolean
	 *           default: false
	 *       - in: query
	 *         name: allowDeactivatedDid
	 *         description: If set to `true` allow to verify accreditation which based on deactivated DID.
	 *         schema:
	 *           type: boolean
	 *           default: false
	 *     requestBody:
	 *       content:
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             $ref: '#/components/schemas/AccreditationVerifyRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/AccreditationVerifyRequest'
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
	@validate
	public async verify(request: Request, response: Response) {
		// Extract did from params
		let { verifyStatus = false, allowDeactivatedDid = false } = request.query as VerifyCredentialRequestQuery;
		const { policies, subjectDid } = request.body as VerifyAccreditationRequestBody;

		// construct didUrl
		let didUrl: string;
		let did: string;
		if (isDidUrl(request.body)) {
			didUrl = request.body.didUrl;
			did = parseDidFromDidUrl(didUrl);
		} else if (isDidAndResourceId(request.body)) {
			did = request.body.did;
			didUrl = `${did}/resources/${request.body.resourceId}`;
		} else if (isDidAndResourceName(request.body)) {
			did = request.body.did;
			didUrl = `${did}?resourceName=${request.body.resourceName}&resourceType=${request.body.resourceType}`;
		} else {
			return response.status(400).json({
				error: `Invalid Request: Either didUrl or did with resource attributes are required`,
			});
		}

		try {
			const result = await AccreditationService.instance.verify_accreditation(
				subjectDid,
				didUrl,
				verifyStatus,
				allowDeactivatedDid,
				response.locals.customer,
				undefined,
				policies
			);
			// Track operation
			const trackInfo = {
				category: OperationCategoryNameEnum.CREDENTIAL,
				name: OperationNameEnum.CREDENTIAL_VERIFY,
				customer: response.locals.customer,
				user: response.locals.user,
				data: {
					did,
				} satisfies ICredentialTrack,
			} as ITrackOperation;

			eventTracker.emit('track', trackInfo);
			if (result.success) {
				return response.status(StatusCodes.OK).json(result.data);
			} else {
				return response.status(result.status).json({ verified: false, error: result.error });
			}
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			});
		}
	}
}
