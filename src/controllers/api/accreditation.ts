import type { Request, Response } from 'express';
import type { VerifiableCredential } from '@veramo/core';
import type {
	DIDAccreditationRequestBody,
	DIDAccreditationRequestParams,
	RevokeAccreditationRequestBody,
	RevokeAccreditationRequestQuery,
	RevokeAccreditationResponseBody,
	SuspendAccreditationRequestBody,
	SuspendAccreditationRequestQuery,
	SuspendAccreditationResponseBody,
	UnsuspendAccreditationRequestBody,
	UnsuspendAccreditationRequestQuery,
	UnsuspendAccreditationResponseBody,
	VerifyAccreditationRequestBody,
} from '../../types/accreditation.js';
import type { ICredentialStatusTrack, ICredentialTrack, ITrackOperation } from '../../types/track.js';
import type { CredentialRequest, UnsuccesfulRevokeCredentialResponseBody } from '../../types/credential.js';
import { StatusCodes } from 'http-status-codes';
import { v4 } from 'uuid';
import { AccreditationRequestType, DIDAccreditationTypes } from '../../types/accreditation.js';
import { CredentialConnectors, VerifyCredentialRequestQuery } from '../../types/credential.js';
import { OperationCategoryNameEnum, OperationNameEnum } from '../../types/constants.js';
import { IdentityServiceStrategySetup } from '../../services/identity/index.js';
import { AccreditationService } from '../../services/api/accreditation.js';
import { Credentials } from '../../services/api/credentials.js';
import { eventTracker } from '../../services/track/tracker.js';
import { body, query } from '../validator/index.js';
import { validate } from '../validator/decorator.js';
import { constructDidUrl, parseDidFromDidUrl } from '../../helpers/helpers.js';
import { CheqdW3CVerifiableCredential } from '../../services/w3c-credential.js';

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
		body('accreditationName').exists().isString().withMessage('accreditationName is required').bail(),
		body('issuerDid').exists().isDID().bail(),
		body('subjectDid').exists().isDID().bail(),
		body('schemas').exists().isArray().withMessage('schemas must be a array').bail(),
		body('schemas.*.url').isString().withMessage('schema urls must be a string').bail(),
		body('schemas.*.type')
			.custom((value) => typeof value === 'string' || (Array.isArray(value) && typeof value[0] === 'string'))
			.withMessage('schema type must be a string'),
		body('parentAccreditation').optional().isString().withMessage('parentAccreditation must be a string').bail(),
		body('rootAuthorization').optional().isString().withMessage('rootAuthorization must be a string').bail(),
		body('trustFramework').optional().isString().withMessage('trustFramework must be a string').bail(),
		body('trustFrameworkId').optional().isString().withMessage('trustFrameworkId must be a string').bail(),
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

				const hasTrustFramework = trustFramework && trustFrameworkId;

				if (!hasTrustFramework && value === AccreditationRequestType.authorize) {
					throw new Error('trustFramework and trustFrameworkId are required for an authorize operation');
				}

				return true;
			})
			.bail(),
		body('accreditationName').exists().isString(),
	];

	public static verifyValidator = [
		body('did').optional().isDID().bail(),
		body('didUrl')
			.optional()
			.isString()
			.custom((value) => value.includes('/resources/') || value.includes('?resourceName'))
			.withMessage('didUrls should point to a unique DID Linked Resource')
			.bail(),
		body('resourceId').optional().isUUID().withMessage('resourceId should be a string').bail(),
		body('resourceName').optional().isString().withMessage('resourceName should be a string').bail(),
		body('resourceType').optional().isString().withMessage('resourceType should be a string').bail(),
		body('schemas').optional().isArray().withMessage('schemas must be a array').bail(),
		body('schemas.*.url').isString().withMessage('schema urls must be a string').bail(),
		body('schemas.*.type')
			.custom((value) => typeof value === 'string' || (Array.isArray(value) && typeof value[0] === 'string'))
			.withMessage('schema type must be a string'),
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

	public static publishValidator = [
		query('publish').optional().isBoolean().withMessage('publish should be a boolean value').toBoolean().bail(),
	];

	/**
	 * @openapi
	 *
	 * /trust-registry/accreditation/issue:
	 *   post:
	 *     tags: [ Trust Registry ]
	 *     summary: Publish a verifiable accreditation for a DID.
	 *     description: Generate and publish a Verifiable Accreditation for a subject DID as a DID Linked resource.
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
			credentialStatus,
		} = request.body as DIDAccreditationRequestBody;

		try {
			// Validate issuer DID
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
			const accreditedFor = schemas.map(({ url, type }: any) => ({
				schemaId: url,
				type,
			}));

			// construct credential request
			const credentialRequest: CredentialRequest = {
				subjectDid,
				attributes: {
					...attributes,
					accreditedFor,
					id: subjectDid,
				},
				issuerDid,
				format: format || 'jwt',
				connector: CredentialConnectors.Resource, // resource connector
				credentialId: resourceId,
				credentialName: accreditationName,
				credentialStatus,
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
					accreditedFor,
					true,
					false,
					response.locals.customer,
					rootAuthorization
				);

				if (result.success === false) {
					return response.status(result.status).send({
						error: `Invalid Request: Root Authorization or parent Accreditation is not valid: ${result.error}`,
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
	 *     description: Generate and publish a Verifiable Accreditation for a subject DID as a DID Linked resource.
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
		const { policies, subjectDid, schemas } = request.body as VerifyAccreditationRequestBody;

		// construct didUrl
		const didUrl = constructDidUrl(request.body);
		if (!didUrl) {
			return response.status(400).json({
				error: `Invalid Request: Either didUrl or did with resource attributes are required`,
			});
		}

		try {
			const accreditedFor = schemas?.map(({ url, type }: any) => ({
				schemaId: url,
				type,
			}));

			const result = await AccreditationService.instance.verify_accreditation(
				subjectDid,
				didUrl,
				accreditedFor,
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
					did: parseDidFromDidUrl(didUrl),
				} satisfies ICredentialTrack,
			} as ITrackOperation;

			eventTracker.emit('track', trackInfo);
			if (result.success) {
				return response.status(StatusCodes.OK).json(result.data);
			} else {
				return response.status(result.status).json({ ...result.data, verified: false, error: result.error });
			}
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			});
		}
	}

	/**
	 * @openapi
	 *
	 * /trust-registry/accreditation/revoke:
	 *   post:
	 *     tags: [ Trust Registry ]
	 *     summary: Revoke a Verifiable Accreditation.
	 *     description: This endpoint revokes a given Verifiable Accreditation. As input, it can take the didUrl as a string. The StatusList2021 resource should already be setup in the VC and `credentialStatus` property present in the VC.
	 *     operationId: accredit-revoke
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
	 *             $ref: '#/components/schemas/AccreditationRevokeRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/AccreditationRevokeRequest'
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
	@validate
	public async revoke(request: Request, response: Response) {
		// Get publish flag
		const { publish } = request.query as RevokeAccreditationRequestQuery;
		// Get symmetric key
		const { symmetricKey, ...didUrlParams } = request.body as RevokeAccreditationRequestBody;
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);

		const didUrl = constructDidUrl(didUrlParams);
		if (!didUrl) {
			return response.status(400).json({
				error: `Invalid Request: Either didUrl or did with resource attributes are required`,
			});
		}

		try {
			const res = await identityServiceStrategySetup.agent.resolve(didUrl);

			const resource = await res.json();

			if (resource.dereferencingMetadata) {
				return {
					success: false,
					status: 404,
					error: `DID URL ${didUrl} is not found`,
				};
			}

			const accreditation: CheqdW3CVerifiableCredential = resource;

			const result = await identityServiceStrategySetup.agent.revokeCredentials(
				accreditation,
				publish as boolean,
				response.locals.customer,
				symmetricKey as string
			);

			// Track operation if revocation was successful and publish is true
			// Otherwise the StatusList2021 publisher should manually publish the resource
			// and it will be tracked there
			if (!result.error && result.resourceMetadata && publish) {
				// get issuer did
				const issuerDid =
					typeof accreditation.issuer === 'string'
						? accreditation.issuer
						: (accreditation.issuer as { id: string }).id;
				const trackInfo = {
					category: OperationCategoryNameEnum.CREDENTIAL,
					name: OperationNameEnum.CREDENTIAL_REVOKE,
					customer: response.locals.customer,
					user: response.locals.user,
					data: {
						did: issuerDid,
						encrypted: result.statusList?.metadata?.encrypted,
						resource: result.resourceMetadata,
						symmetricKey: '',
					} satisfies ICredentialStatusTrack,
				} as ITrackOperation;

				// Track operation
				eventTracker.emit('track', trackInfo);
			}
			// Return Ok response
			return response.status(StatusCodes.OK).json(result satisfies RevokeAccreditationResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			});
		}
	}

	/**
	 * @openapi
	 *
	 * /trust-registry/accreditation/suspend:
	 *   post:
	 *     tags: [ Trust Registry ]
	 *     summary: Suspend a Verifiable Accreditation.
	 *     description: This endpoint suspends a given Verifiable Accreditation. As input, it can take the didUrl as a string. The StatusList2021 resource should already be setup in the VC and `credentialStatus` property present in the VC.
	 *     operationId: accredit-suspend
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
	 *             $ref: '#/components/schemas/AccreditationRevokeRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/AccreditationRevokeRequest'
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
	@validate
	public async suspend(request: Request, response: Response) {
		// Get publish flag
		const { publish } = request.query as SuspendAccreditationRequestQuery;
		// Get symmetric key
		const { symmetricKey, ...didUrlParams } = request.body as SuspendAccreditationRequestBody;
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);

		const didUrl = constructDidUrl(didUrlParams);
		if (!didUrl) {
			return response.status(400).json({
				error: `Invalid Request: Either didUrl or did with resource attributes are required`,
			});
		}

		try {
			const res = await identityServiceStrategySetup.agent.resolve(didUrl);

			const resource = await res.json();

			if (resource.dereferencingMetadata) {
				return {
					success: false,
					status: 404,
					error: `DID URL ${didUrl} is not found`,
				};
			}

			const accreditation: CheqdW3CVerifiableCredential = resource;

			const result = await identityServiceStrategySetup.agent.suspendCredentials(
				accreditation,
				publish as boolean,
				response.locals.customer,
				symmetricKey as string
			);

			// Track operation if revocation was successful and publish is true
			// Otherwise the StatusList2021 publisher should manually publish the resource
			// and it will be tracked there
			if (!result.error && result.resourceMetadata && publish) {
				// get issuer did
				const issuerDid =
					typeof accreditation.issuer === 'string'
						? accreditation.issuer
						: (accreditation.issuer as { id: string }).id;
				const trackInfo = {
					category: OperationCategoryNameEnum.CREDENTIAL,
					name: OperationNameEnum.CREDENTIAL_SUSPEND,
					customer: response.locals.customer,
					user: response.locals.user,
					data: {
						did: issuerDid,
						encrypted: result.statusList?.metadata?.encrypted,
						resource: result.resourceMetadata,
						symmetricKey: '',
					},
				} as ITrackOperation;

				// Track operation
				eventTracker.emit('track', trackInfo);
			}
			// Return Ok response
			return response.status(StatusCodes.OK).json(result satisfies SuspendAccreditationResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			});
		}
	}

	/**
	 * @openapi
	 *
	 * /trust-registry/accreditation/reinstate:
	 *   post:
	 *     tags: [ Trust Registry ]
	 *     summary: Reinstate a Verifiable Accreditation.
	 *     description: This endpoint reinstates a given Verifiable Accreditation. As input, it can take the didUrl as a string. The StatusList2021 resource should already be setup in the VC and `credentialStatus` property present in the VC.
	 *     operationId: accredit-reinstate
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
	 *             $ref: '#/components/schemas/AccreditationRevokeRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/AccreditationRevokeRequest'
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
	@validate
	public async reinstate(request: Request, response: Response) {
		// Get publish flag
		const { publish } = request.query as UnsuspendAccreditationRequestQuery;
		// Get symmetric key
		const { symmetricKey, ...didUrlParams } = request.body as UnsuspendAccreditationRequestBody;
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);

		const didUrl = constructDidUrl(didUrlParams);
		if (!didUrl) {
			return response.status(400).json({
				error: `Invalid Request: Either didUrl or did with resource attributes are required`,
			});
		}

		try {
			const res = await identityServiceStrategySetup.agent.resolve(didUrl);

			const resource = await res.json();

			if (resource.dereferencingMetadata) {
				return {
					success: false,
					status: 404,
					error: `DID URL ${didUrl} is not found`,
				};
			}

			const accreditation: CheqdW3CVerifiableCredential = resource;

			const result = await identityServiceStrategySetup.agent.reinstateCredentials(
				accreditation,
				publish as boolean,
				response.locals.customer,
				symmetricKey as string
			);

			// Track operation if revocation was successful and publish is true
			// Otherwise the StatusList2021 publisher should manually publish the resource
			// and it will be tracked there
			if (!result.error && result.resourceMetadata && publish) {
				// get issuer did
				const issuerDid =
					typeof accreditation.issuer === 'string'
						? accreditation.issuer
						: (accreditation.issuer as { id: string }).id;
				const trackInfo = {
					category: OperationCategoryNameEnum.CREDENTIAL,
					name: OperationNameEnum.CREDENTIAL_UNSUSPEND,
					customer: response.locals.customer,
					user: response.locals.user,
					data: {
						did: issuerDid,
						encrypted: result.statusList?.metadata?.encrypted || false,
						resource: result.resourceMetadata,
						symmetricKey: '',
					} satisfies ICredentialStatusTrack,
				} as ITrackOperation;

				// Track operation
				eventTracker.emit('track', trackInfo);
			}
			// Return Ok response
			return response.status(StatusCodes.OK).json(result satisfies UnsuspendAccreditationResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies UnsuccesfulRevokeCredentialResponseBody);
		}
	}
}
