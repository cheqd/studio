import type { Request, Response } from 'express';
import type {
	DIDAccreditationRequestBody,
	DIDAccreditationRequestParams,
	UpdateAccreditationRequestBody,
	UpdateAccreditationRequestQuery,
	SchemaUrlType,
	VerifyAccreditationRequestBody,
} from '../../types/accreditation.js';
import type { ICredentialTrack, ITrackOperation } from '../../types/track.js';
import { StatusCodes } from 'http-status-codes';
import { AccreditationRequestType } from '../../types/accreditation.js';
import { UnsuccesfulRevokeCredentialResponseBody, VerifyCredentialRequestQuery } from '../../types/credential.js';
import { OperationCategoryNameEnum, OperationNameEnum } from '../../types/constants.js';
import { AccreditationService } from '../../services/api/accreditation.js';
import { eventTracker } from '../../services/track/tracker.js';
import { body, query } from '../validator/index.js';
import { validate } from '../validator/decorator.js';
import { constructDidUrl, parseDidFromDidUrl } from '../../helpers/helpers.js';
import { CheqdNetwork } from '@cheqd/sdk';

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
		body('schemas.*.types')
			.custom((value) => typeof value === 'string' || (Array.isArray(value) && typeof value[0] === 'string'))
			.withMessage('schema.types must be a string or a string array'),
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
		body('schemas.*.types')
			.custom((value) => typeof value === 'string' || (Array.isArray(value) && typeof value[0] === 'string'))
			.withMessage('schema.types must be a string or a string array'),
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

	public static listValidator = [
		query('accreditationType')
			.exists()
			.isIn([
				AccreditationRequestType.authorize,
				AccreditationRequestType.accredit,
				AccreditationRequestType.attest,
			])
			.bail(),
		query('network')
			.optional()
			.isString()
			.isIn([CheqdNetwork.Mainnet, CheqdNetwork.Testnet])
			.withMessage('Invalid network')
			.bail(),
		query('did').optional().isDID().bail(),
	];

	/**
	 * @openapi
	 *
	 * /trust-registry/accreditation/issue:
	 *   post:
	 *     tags: [ Trust Registries ]
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
		const { accreditationType } = request.query as DIDAccreditationRequestParams;
		const { schemas, issuerDid, subjectDid } = request.body as DIDAccreditationRequestBody;

		// Handles string input instead of an array
		if (typeof request.body.type === 'string') {
			request.body.type = [request.body.type];
		}
		if (typeof request.body['@context'] === 'string') {
			request.body['@context'] = [request.body['@context']];
		}

		try {
			const result = await AccreditationService.instance.issue_accreditation(
				accreditationType,
				issuerDid,
				subjectDid,
				schemas,
				request.body,
				response.locals.customer
			);

			if (result.success) {
				// Track operation
				const trackInfo: ITrackOperation<ICredentialTrack> = {
					category: OperationCategoryNameEnum.CREDENTIAL,
					name: OperationNameEnum.CREDENTIAL_ISSUE,
					customer: response.locals.customer,
					user: response.locals.user,
					data: {
						did: issuerDid,
					},
				};

				eventTracker.emit('track', trackInfo);

				return response.status(StatusCodes.OK).json(result.data);
			} else {
				return response.status(result.status).json({
					error: result.error,
				});
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
	 * /trust-registry/accreditation/verify:
	 *   post:
	 *     tags: [ Trust Registries ]
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
	 *               $ref: '#/components/schemas/AccreditationVerifyResponse'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async verify(request: Request, response: Response) {
		let { verifyStatus = false, allowDeactivatedDid = false } = request.query as VerifyCredentialRequestQuery;
		const { policies, subjectDid, schemas } = request.body as VerifyAccreditationRequestBody;

		// construct didUrl
		const didUrl = constructDidUrl(request.body);
		if (!didUrl) {
			return response.status(StatusCodes.BAD_REQUEST).json({
				error: `Invalid Request: Either didUrl or did with resource attributes are required`,
			});
		}

		try {
			const accreditedFor = schemas?.map(({ url, types }: SchemaUrlType) => ({
				schemaId: url,
				types: Array.isArray(types) ? types : [types],
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
			const trackInfo: ITrackOperation<ICredentialTrack> = {
				category: OperationCategoryNameEnum.CREDENTIAL,
				name: OperationNameEnum.CREDENTIAL_VERIFY,
				customer: response.locals.customer,
				user: response.locals.user,
				data: {
					did: parseDidFromDidUrl(didUrl),
				},
			};

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
	 *     tags: [ Trust Registries ]
	 *     summary: Revoke a Verifiable Accreditation.
	 *     description: This endpoint revokes a given Verifiable Accreditation. As input, it can take the didUrl as a string. The StatusList2021 or BitstringStatusList resource should already be setup in the VC and `credentialStatus` property present in the VC.
	 *     operationId: accredit-revoke
	 *     parameters:
	 *       - in: query
	 *         name: publish
	 *         description: Set whether the StatusList2021 or BitstringStatusList resource should be published to the ledger or not. If set to `false`, the StatusList2021 or BitstringStatusList publisher should manually publish the resource.
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
		const { publish } = request.query as UpdateAccreditationRequestQuery;
		const { symmetricKey, ...didUrlParams } = request.body as UpdateAccreditationRequestBody;

		const didUrl = constructDidUrl(didUrlParams);
		if (!didUrl) {
			return response.status(StatusCodes.BAD_REQUEST).json({
				error: `Invalid Request: Either didUrl or did with resource attributes are required`,
			});
		}

		try {
			const result = await AccreditationService.instance.revoke_accreditation(
				didUrl,
				publish as boolean,
				symmetricKey as string,
				response.locals.customer
			);

			if (result.success) {
				// Track operation if revocation was successful and publish is true
				// Otherwise the StatusList2021 or BitstringStatusList publisher should manually publish the resource
				// and it will be tracked there
				if (result.data.resourceMetadata && publish) {
					// get issuer did
					const issuerDid = parseDidFromDidUrl(didUrl);
					const trackInfo: ITrackOperation<ICredentialTrack> = {
						category: OperationCategoryNameEnum.CREDENTIAL,
						name: OperationNameEnum.CREDENTIAL_REVOKE,
						customer: response.locals.customer,
						user: response.locals.user,
						data: {
							did: issuerDid,
							encrypted: result.data.statusList?.metadata?.encrypted,
							resource: result.data.resourceMetadata,
							symmetricKey: '',
						},
					};

					// Track operation
					eventTracker.emit('track', trackInfo);
				}
				return response.status(StatusCodes.OK).json(result.data);
			} else {
				return response.status(result.status).json({
					error: result.error,
				});
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
	 * /trust-registry/accreditation/suspend:
	 *   post:
	 *     tags: [ Trust Registries ]
	 *     summary: Suspend a Verifiable Accreditation.
	 *     description: This endpoint suspends a given Verifiable Accreditation. As input, it can take the didUrl as a string. The StatusList2021 or BitstringStatusList resource should already be setup in the VC and `credentialStatus` property present in the VC.
	 *     operationId: accredit-suspend
	 *     parameters:
	 *       - in: query
	 *         name: publish
	 *         description: Set whether the StatusList2021 or BitstringStatusList resource should be published to the ledger or not. If set to `false`, the StatusList2021 or BitstringStatusList publisher should manually publish the resource.
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
		const { publish } = request.query as UpdateAccreditationRequestQuery;
		const { symmetricKey, ...didUrlParams } = request.body as UpdateAccreditationRequestBody;

		const didUrl = constructDidUrl(didUrlParams);
		if (!didUrl) {
			return response.status(StatusCodes.BAD_REQUEST).json({
				error: `Invalid Request: Either didUrl or did with resource attributes are required`,
			});
		}

		try {
			const result = await AccreditationService.instance.suspend_accreditation(
				didUrl,
				publish as boolean,
				symmetricKey as string,
				response.locals.customer
			);

			if (result.success) {
				// Track operation if suspension was successful and publish is true
				// Otherwise the StatusList2021 or BitstringStatusList publisher should manually publish the resource
				// and it will be tracked there
				if (result.data.resourceMetadata && publish) {
					// get issuer did
					const issuerDid = parseDidFromDidUrl(didUrl);

					const trackInfo: ITrackOperation<ICredentialTrack> = {
						category: OperationCategoryNameEnum.CREDENTIAL,
						name: OperationNameEnum.CREDENTIAL_SUSPEND,
						customer: response.locals.customer,
						user: response.locals.user,
						data: {
							did: issuerDid,
							encrypted: result.data.statusList?.metadata?.encrypted,
							resource: result.data.resourceMetadata,
							symmetricKey: '',
						},
					};

					// Track operation
					eventTracker.emit('track', trackInfo);
				}
				return response.status(StatusCodes.OK).json(result.data);
			} else {
				return response.status(result.status).json({
					error: result.error,
				});
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
	 * /trust-registry/accreditation/reinstate:
	 *   post:
	 *     tags: [ Trust Registries ]
	 *     summary: Reinstate a Verifiable Accreditation.
	 *     description: This endpoint reinstates a given Verifiable Accreditation. As input, it can take the didUrl as a string. The StatusList2021 or BitstringStatusList resource should already be setup in the VC and `credentialStatus` property present in the VC.
	 *     operationId: accredit-reinstate
	 *     parameters:
	 *       - in: query
	 *         name: publish
	 *         description: Set whether the StatusList2021 or BitstringStatusList resource should be published to the ledger or not. If set to `false`, the StatusList2021 or BitstringStatusList publisher should manually publish the resource.
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
		const { publish } = request.query as UpdateAccreditationRequestQuery;
		const { symmetricKey, ...didUrlParams } = request.body as UpdateAccreditationRequestBody;

		const didUrl = constructDidUrl(didUrlParams);
		if (!didUrl) {
			return response.status(StatusCodes.BAD_REQUEST).json({
				error: `Invalid Request: Either didUrl or did with resource attributes are required`,
			});
		}

		try {
			const result = await AccreditationService.instance.reinstate_accreditation(
				didUrl,
				publish as boolean,
				symmetricKey as string,
				response.locals.customer
			);

			if (result.success) {
				// Track operation if reinstatement was successful and publish is true
				// Otherwise the StatusList2021 or BitstringStatusList publisher should manually publish the resource
				// and it will be tracked there
				if (result.data.resourceMetadata && publish) {
					// get issuer did
					const issuerDid = parseDidFromDidUrl(didUrl);

					const trackInfo: ITrackOperation<ICredentialTrack> = {
						category: OperationCategoryNameEnum.CREDENTIAL,
						name: OperationNameEnum.CREDENTIAL_UNSUSPEND,
						customer: response.locals.customer,
						user: response.locals.user,
						data: {
							did: issuerDid,
							encrypted: result.data.statusList?.metadata?.encrypted || false,
							resource: result.data.resourceMetadata,
							symmetricKey: '',
						},
					};

					// Track operation
					eventTracker.emit('track', trackInfo);
				}
				return response.status(StatusCodes.OK).json(result.data);
			} else {
				return response.status(result.status).json({
					error: result.error,
				});
			}
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies UnsuccesfulRevokeCredentialResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /trust-registry/accreditation/list:
	 *   get:
	 *     tags: [ Trust Registries ]
	 *     summary: Fetch Verifiable Accreditations for DIDs associated with an account.
	 *     description: This endpoint returns the list of Verifiable Accreditations created by the account.
	 *     parameters:
	 *       - in: query
	 *         name: network
	 *         description: Filter Accreditations by the network published.
	 *         schema:
	 *           type: string
	 *           enum:
	 *             - mainnet
	 *             - testnet
	 *         required: false
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
	 *       - in: query
	 *         name: did
	 *         description: Filter accreditations published by a DID
	 *         schema:
	 *           type: string
	 *       - in: query
	 *         name: page
	 *         description: Page number for pagination.
	 *         schema:
	 *           type: number
	 *           default: 1
	 *         required: false
	 *       - in: query
	 *         name: limit
	 *         description: Number of items per page.
	 *         schema:
	 *           type: number
	 *           default: 10
	 *         required: false
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/ListAccreditationResult'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public async listAccreditations(request: Request, response: Response) {
		const { network, accreditationType, did, page, limit } = request.query as any;

		try {
			const result = await AccreditationService.instance.list_accreditations(
				accreditationType,
				network,
				did,
				page,
				limit,
				response.locals.customer
			);

			if (result.success) {
				return response.status(StatusCodes.OK).json(result.data);
			} else {
				return response.status(result.status).json({
					error: result.error,
				});
			}
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			});
		}
	}
}
