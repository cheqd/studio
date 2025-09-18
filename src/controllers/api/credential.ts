import type { Request, Response } from 'express';
import type { VerifiableCredential } from '@veramo/core';
import { StatusCodes } from 'http-status-codes';

import { check, query } from '../validator/index.js';

import { Credentials } from '../../services/api/credentials.js';
import { IdentityServiceStrategySetup } from '../../services/identity/index.js';
import { CheqdW3CVerifiableCredential } from '../../services/w3c-credential.js';
import { isCredentialIssuerDidDeactivated } from '../../services/helpers.js';
import type {
	IssueCredentialRequestBody,
	IssueCredentialResponseBody,
	UpdateCredentialRequestBody,
	UpdateCredentialRequestQuery,
	RevokeCredentialResponseBody,
	SuspendCredentialResponseBody,
	UnsuccesfulIssueCredentialResponseBody,
	UnsuccesfulRevokeCredentialResponseBody,
	UnsuccesfulSuspendCredentialResponseBody,
	UnsuccesfulUnsuspendCredentialResponseBody,
	UnsuccesfulVerifyCredentialResponseBody,
	UnsuspendCredentialResponseBody,
	VerifyCredentialRequestBody,
	VerifyCredentialRequestQuery,
	VerifyCredentialResponseBody,
	ListCredentialResponse,
	ListCredentialQueryParams,
} from '../../types/credential.js';
import { VeridaDIDValidator } from '../validator/did.js';
import { Cheqd } from '@cheqd/did-provider-cheqd';
import { OperationCategoryNameEnum, OperationNameEnum } from '../../types/constants.js';
import { eventTracker } from '../../services/track/tracker.js';
import type { ICredentialStatusTrack, ICredentialTrack, ITrackOperation } from '../../types/track.js';
import { validate } from '../validator/decorator.js';
import { StatusListType } from '../../types/credential-status.js';
import { DockIdentityService } from '../../services/identity/providers/index.js';
import { ProviderService } from '../../services/api/provider.service.js';

export class CredentialController {
	public static issueValidator = [
		check(['subjectDid', 'issuerDid']).exists().withMessage('DID is required').bail().isDID().bail(),
		check('subjectDid')
			.custom((value, { req }) =>
				new VeridaDIDValidator().validate(value).valid ? !!req.body.credentialSchema : true
			)
			.withMessage('credentialSchema is required for a verida DID subject'),
		check('attributes')
			.exists()
			.withMessage('attributes are required')
			.bail()
			.isObject()
			.withMessage('attributes should be an object')
			.bail(),
		check('expirationDate').optional().isISO8601().withMessage('Expect to see ISO8601 date format').bail(),
		check('format').optional().isString().withMessage('Invalid credential format').bail(),
	];
	public static verifyValidator = [
		check('credential')
			.exists()
			.withMessage('W3c verifiable credential was not provided')
			.isW3CCheqdCredential()
			.bail(),
		query('verifyStatus')
			.optional()
			.isBoolean()
			.withMessage('verifyStatus should be a boolean value')
			.toBoolean()
			.bail(),
		query('fetchRemoteContexts')
			.optional()
			.isBoolean()
			.withMessage('fetchRemoteContexts should be a boolean value')
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
	public static updateValidator = [
		check('credential')
			.exists()
			.withMessage('W3c verifiable credential was not provided')
			.bail()
			.isW3CCheqdCredential()
			.bail(),
		query('publish').optional().isBoolean().withMessage('publish should be a boolean value').toBoolean().bail(),
		query('listType')
			.exists()
			.withMessage('listType: required')
			.bail()
			.isString()
			.withMessage('listType: should be a string')
			.bail()
			.isIn([StatusListType.Bitstring, StatusListType.StatusList2021])
			.withMessage(
				`listType: invalid listType, should be one of [${Object.values(StatusListType)
					.map((v) => `'${v}'`)
					.join(', ')}]`
			),
	];

	/**
	 * @openapi
	 *
	 * /credential/issue:
	 *   post:
	 *     tags: [ Verifiable Credentials ]
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
	@validate
	public async issue(request: Request, response: Response) {
		// Get request body
		const requestBody = request.body as IssueCredentialRequestBody;

		// Handles string input instead of an array
		if (typeof requestBody.type === 'string') {
			requestBody.type = [requestBody.type];
		}
		if (typeof requestBody['@context'] === 'string') {
			requestBody['@context'] = [requestBody['@context']];
		}

		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);

		try {
			// resolve issuer DID-Document
			const resolvedResult = await identityServiceStrategySetup.agent.resolve(requestBody.issuerDid);
			// check if DID-Document is resolved
			const body = await resolvedResult.json();
			if (!body?.didDocument) {
				return response.status(StatusCodes.BAD_REQUEST).send({
					error: `DID ${requestBody.issuerDid} is not resolved because of error from resolver: ${body.didResolutionMetadata.error}.`,
				} satisfies UnsuccesfulIssueCredentialResponseBody);
			}
			if (body.didDocumentMetadata.deactivated) {
				return response.status(StatusCodes.BAD_REQUEST).send({
					error: `${requestBody.issuerDid} is deactivated`,
				} satisfies UnsuccesfulIssueCredentialResponseBody);
			}
			// issue credential
			const credential: VerifiableCredential = await Credentials.instance.issue_credential(
				requestBody,
				response.locals.customer
			);

			// Track operation
			const trackInfo = {
				category: OperationCategoryNameEnum.CREDENTIAL,
				name: OperationNameEnum.CREDENTIAL_ISSUE,
				customer: response.locals.customer,
				user: response.locals.user,
				data: {
					did: requestBody.issuerDid,
				} satisfies ICredentialTrack,
			} as ITrackOperation;

			eventTracker.emit('track', trackInfo);

			return response.status(StatusCodes.OK).json(credential satisfies IssueCredentialResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies UnsuccesfulIssueCredentialResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /credential/verify:
	 *   post:
	 *     tags: [ Verifiable Credentials ]
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
	@validate
	public async verify(request: Request, response: Response) {
		// Get params from request
		const { credential, policies } = request.body as VerifyCredentialRequestBody;
		const { verifyStatus, allowDeactivatedDid, fetchRemoteContexts } =
			request.query as VerifyCredentialRequestQuery;

		// Create credential object
		const cheqdCredential = new CheqdW3CVerifiableCredential(credential);
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup();

		try {
			if (!allowDeactivatedDid && (await isCredentialIssuerDidDeactivated(cheqdCredential))) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: `Credential issuer DID is deactivated`,
				} satisfies UnsuccesfulVerifyCredentialResponseBody);
			}

			const verifyResult = await identityServiceStrategySetup.agent.verifyCredential(
				credential,
				{
					verifyStatus,
					policies,
					fetchRemoteContexts,
				},
				response.locals.customer
			);

			if (verifyResult.error) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					verified: verifyResult.verified,
					error: `verify: ${JSON.stringify(verifyResult.error)}`,
				} satisfies UnsuccesfulVerifyCredentialResponseBody);
			}

			const did = typeof cheqdCredential.issuer === 'string' ? cheqdCredential.issuer : cheqdCredential.issuer.id;
			// Track operation
			const trackInfo = {
				category: OperationCategoryNameEnum.CREDENTIAL,
				name: OperationNameEnum.CREDENTIAL_VERIFY,
				customer: response.locals.customer,
				user: response.locals.user,
				data: {
					did,
					resource: verifyResult.resourceMetadata,
				} satisfies ICredentialTrack,
			} as ITrackOperation;

			eventTracker.emit('track', trackInfo);

			return response.status(StatusCodes.OK).json(verifyResult satisfies VerifyCredentialResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies UnsuccesfulVerifyCredentialResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /credential/revoke:
	 *   post:
	 *     tags: [ Verifiable Credentials ]
	 *     summary: Revoke a Verifiable Credential.
	 *     description: This endpoint revokes a given Verifiable Credential. As input, it can take the VC-JWT as a string or the entire credential itself. The StatusList2021 or BitstringStatusList resource should already be setup in the VC and `credentialStatus` property present in the VC.
	 *     operationId: revoke
	 *     parameters:
	 *       - in: query
	 *         name: listType
	 *         description: The type of Status List.
	 *         required: true
	 *         schema:
	 *           type: string
	 *           enum:
	 *             - StatusList2021
	 *             - BitstringStatusList
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
	@validate
	public async revoke(request: Request, response: Response) {
		// Get publish flag
		const { publish, listType } = request.query as UpdateCredentialRequestQuery;
		// Get symmetric key
		const { credential, symmetricKey } = request.body as UpdateCredentialRequestBody;
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);

		try {
			const result = await identityServiceStrategySetup.agent.revokeCredentials(
				credential,
				listType || StatusListType.Bitstring,
				publish as boolean,
				response.locals.customer,
				symmetricKey as string
			);

			// Track operation if revocation was successful and publish is true
			// Otherwise the StatusList2021 or BitstringStatusList publisher should manually publish the resource
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
			return response.status(StatusCodes.OK).json(result satisfies RevokeCredentialResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies UnsuccesfulRevokeCredentialResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /credential/suspend:
	 *   post:
	 *     tags: [ Verifiable Credentials ]
	 *     summary: Suspend a Verifiable Credential.
	 *     description: This endpoint suspends a given Verifiable Credential.  As input, it can take the VC-JWT as a string or the entire credential itself.
	 *     operationId: suspend
	 *     parameters:
	 *       - in: query
	 *         name: listType
	 *         description: The type of Status List.
	 *         required: true
	 *         schema:
	 *           type: string
	 *           enum:
	 *             - StatusList2021
	 *             - BitstringStatusList
	 *       - in: query
	 *         name: publish
	 *         description: Set whether the StatusList2021 or BitstringStatusList resource should be published to the ledger or not. If set to `false`, the StatusList2021 or BitstringStatusList publisher should manually publish the resource.
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
	@validate
	public async suspend(request: Request, response: Response) {
		// Get publish flag
		const { publish, listType } = request.query as UpdateCredentialRequestQuery;
		// Get symmetric key
		const { credential, symmetricKey } = request.body as UpdateCredentialRequestBody;

		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);

		try {
			const result = await identityServiceStrategySetup.agent.suspendCredentials(
				credential,
				listType || StatusListType.Bitstring,
				publish as boolean,
				response.locals.customer,
				symmetricKey as string
			);

			// Track operation if suspension was successful and publish is true
			// Otherwise the StatusList2021 or BitstringStatusList publisher should manually publish the resource
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

			return response.status(StatusCodes.OK).json(result satisfies SuspendCredentialResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies UnsuccesfulSuspendCredentialResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /credential/reinstate:
	 *   post:
	 *     tags: [ Verifiable Credentials ]
	 *     summary: Reinstate a suspended Verifiable Credential.
	 *     description: Set whether the StatusList2021 or BitstringStatusList resource should be published to the ledger or not. If set to `false`, the StatusList2021 or BitstringStatusList publisher should manually publish the resource.
	 *     operationId: reinstate
	 *     parameters:
	 *       - in: query
	 *         name: listType
	 *         description: The type of Status List.
	 *         required: true
	 *         schema:
	 *           type: string
	 *           enum:
	 *             - StatusList2021
	 *             - BitstringStatusList
	 *       - in: query
	 *         name: publish
	 *         description: Set whether the StatusList2021 or BitstringStatusList resource should be published to the ledger or not. If set to `false`, the StatusList2021 or BitstringStatusList publisher should manually publish the resource.
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
	@validate
	public async reinstate(request: Request, response: Response) {
		// Get publish flag
		const { publish, listType } = request.query as UpdateCredentialRequestQuery;
		// Get symmetric key
		const { credential, symmetricKey } = request.body as UpdateCredentialRequestBody;
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);

		try {
			const result = await identityServiceStrategySetup.agent.reinstateCredentials(
				credential,
				listType || StatusListType.Bitstring,
				publish as boolean,
				response.locals.customer,
				symmetricKey as string
			);

			// Track operation if the process of reinstantiating was successful and publish is true
			// Otherwise the StatusList2021 or BitstringStatusList publisher should manually publish the resource
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
			return response.status(StatusCodes.OK).json(result satisfies UnsuspendCredentialResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies UnsuccesfulUnsuspendCredentialResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /credential/list:
	 *   get:
	 *     tags: [ Verifiable Credentials ]
	 *     summary: Fetch credentials associated with an account.
	 *     description: This endpoint returns the list of credentials controlled by the account.
	 *     parameters:
	 *       - in: query
	 *         name: providerId
	 *         description: Filter credentials by the provider.
	 *         schema:
	 *           type: string
	 *         required: false
	 *       - in: query
	 *         name: issuerDid
	 *         description: Filter credentials by Issuer.
	 *         schema:
	 *           type: string
	 *         required: false
	 *       - in: query
	 *         name: createdAt
	 *         description: Filter resource by created date.
	 *         schema:
	 *           type: string
	 *           format: date
	 *         required: false
	 *       - in: query
	 *         name: page
	 *         description: Page number.
	 *         schema:
	 *           type: number
	 *         required: false
	 *       - in: query
	 *         name: limit
	 *         description: Number of items to be listed in a single page.
	 *         schema:
	 *           type: number
	 *         required: false
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/ListCredentialResult'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public async listCredentials(request: Request, response: Response) {
		const { page, limit, providerId, ...filter } = request.query as ListCredentialQueryParams;

		try {
			if (providerId) {
				const provider = await ProviderService.instance.getProvider(providerId, { deprecated: false });
				if (!provider) {
					throw new Error(`Provider ${providerId} not found or deprecated`);
				}
			}

			let result: ListCredentialResponse;
			switch (providerId) {
				case 'dock':
					result = await new DockIdentityService().listCredentials(
						{
							offset: page && limit ? (page - 1) * limit : 0,
							limit: limit,
							filter: {
								issuerDid: filter.issuerDid,
								id: filter.id,
								type: filter.type,
							},
						},
						response.locals.customer
					);
					break;
				default:
					const identityServiceStrategySetup = new IdentityServiceStrategySetup(
						response.locals.customer.customerId
					);
					result = await identityServiceStrategySetup.agent.listCredentials(
						{ filter, page, limit },
						response.locals.customer
					);
			}
			return response.status(StatusCodes.OK).json(result);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json(
				{
					error: `Internal error: ${(error as Error)?.message || error}`,
				} /* satisfies UnsuccessfulListCredentialResponseBody */
			);
		}
	}
}
