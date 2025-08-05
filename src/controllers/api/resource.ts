import type { Request, Response } from 'express';
import { fromString } from 'uint8arrays';
import { v4 } from 'uuid';
import type { MsgCreateResourcePayload } from '@cheqd/ts-proto/cheqd/resource/v2/index.js';
import { StatusCodes } from 'http-status-codes';
import { IdentityServiceStrategySetup } from '../../services/identity/index.js';
import { getQueryParams } from '../../helpers/helpers.js';
import { DIDMetadataDereferencingResult, DefaultResolverUrl } from '@cheqd/did-provider-cheqd';
import type { IResourceTrack, ITrackOperation } from '../../types/track.js';
import { OperationCategoryNameEnum, OperationNameEnum } from '../../types/constants.js';
import { check, param, query } from '../validator/index.js';
import type {
	CreateResourceRequestBody,
	CreateResourceResponseBody,
	QueryResourceResponseBody,
	SearchResourceRequestParams,
	UnsuccessfulCreateResourceResponseBody,
	UnsuccessfulQueryResourceResponseBody,
} from '../../types/resource.js';
import { eventTracker } from '../../services/track/tracker.js';
import { arePublicKeyHexsInWallet } from '../../services/helpers.js';
import { validate } from '../validator/decorator.js';
import { UnsuccessfulGetDidResponseBody } from '../../types/did.js';

export class ResourceController {
	public static createResourceValidator = [
		param('did').exists().withMessage('did is required').bail().isDID().bail(),
		check('name')
			.exists()
			.withMessage('name is required')
			.isString()
			.withMessage('Name should has string type')
			.bail(),
		check('type').exists().withMessage('type is required').bail().isString().withMessage('Invalid type').bail(),
		check('data')
			.exists()
			.withMessage('data is required')
			.bail()
			.isString()
			.withMessage('Data is supposed to have type of String')
			.bail(),
		check('encoding')
			.exists()
			.withMessage('encoding is required')
			.bail()
			.isString()
			.withMessage('encoding is supposed to have type of String')
			.isIn(['hex', 'base64', 'base64url'])
			.withMessage('Invalid encoding value, should be one of hex, base64, base64url')
			.bail(),
		check('alsoKnownAs')
			.optional()
			.isArray()
			.withMessage('alsoKnownAs is supposed to be an array')
			.bail()
			.isCheqdDidLinkedAlsoKnownAs()
			.bail(),
		check('version').optional().isString().withMessage('version is supposed to have type of String').bail(),
	];

	public static searchResourceValidator = [
		param('did').exists().withMessage('did is required').bail().isDID().bail(),
		query('resourceId')
			.optional()
			.isString()
			.withMessage('resourceId is supposed to have type of String')
			.bail()
			.isUUID()
			.withMessage('Invalid resourceId value, should be UUID')
			.bail(),
		query('resourceName')
			.optional()
			.isString()
			.withMessage('resourceName is supposed to have type of String')
			.bail(),
		query('resourceType')
			.optional()
			.isString()
			.withMessage('resourceType is supposed to have type of String')
			.bail(),
		query('resourceVersion')
			.optional()
			.isString()
			.withMessage('resourceVersion is supposed to have type of String')
			.bail(),
		query('resourceVersionTime')
			.optional()
			.isString()
			.withMessage('resourceVersionTime is supposed to have type of String')
			.bail()
			.isISO8601()
			.withMessage('Invalid resourceVersionTime value, should be ISO8601')
			.bail(),
		query('checksum')
			.optional()
			.isString()
			.withMessage('checksum is supposed to have type of String')
			.bail()
			.isHexadecimal()
			.withMessage('Invalid checksum value, should be Hexadecimal')
			.bail(),
		query('resourceMetadata')
			.optional()
			.isBoolean()
			.withMessage('resourceMetadata is supposed to have type of Boolean')
			.bail(),
	];

	/**
	 * @openapi
	 *
	 * /resource/create/{did}:
	 *   post:
	 *     tags: [ Resource ]
	 *     summary: Create a DID-Linked Resource.
	 *     description: This endpoint creates a DID-Linked Resource. As input, it can take the DID identifier and the resource parameters via a form, or the fully-assembled resource itself.
	 *     parameters:
	 *       - in: path
	 *         name: did
	 *         description: DID identifier to link the resource to.
	 *         schema:
	 *           type: string
	 *         required: true
	 *     requestBody:
	 *       content:
	 *         application/x-www-form-urlencoded:
	 *             schema:
	 *               $ref: '#/components/schemas/CreateResourceRequest'
	 *         application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/CreateResourceRequest'
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/ResourceMetadata'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async createResource(request: Request, response: Response) {
		// Extract the did from the request
		const { did } = request.params;
		// Extract the resource parameters from the request
		const { data, encoding, name, type, alsoKnownAs, version, network, publicKeyHexs } =
			request.body as CreateResourceRequestBody;

		try {
			// If list of publicKeyHexs is placed - check that publicKeyHexs are owned by the customer
			if (publicKeyHexs) {
				const areOwned = await arePublicKeyHexsInWallet(publicKeyHexs, response.locals.customer);
				if (!areOwned.status) {
					return response.status(StatusCodes.BAD_REQUEST).json({
						error: areOwned.error as string,
					} satisfies UnsuccessfulCreateResourceResponseBody);
				}
			}
			// Get strategy e.g. postgres or local
			const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);

			let resourcePayload: Partial<MsgCreateResourcePayload> = {};

			// check if did is registered on the ledger
			const { didDocument, didDocumentMetadata } = await identityServiceStrategySetup.agent.resolveDid(did);
			if (!didDocument || !didDocumentMetadata || didDocumentMetadata.deactivated) {
				return response.status(StatusCodes.BAD_REQUEST).send({
					error: `${did} is a either Deactivated or Not found`,
				} satisfies UnsuccessfulCreateResourceResponseBody);
			}

			resourcePayload = {
				collectionId: did.split(':').pop(),
				id: v4(),
				name,
				resourceType: type,
				data: fromString(data, encoding),
				version,
				alsoKnownAs,
			};
			const result = await identityServiceStrategySetup.agent.createResource(
				network || did.split(':')[2],
				resourcePayload,
				response.locals.customer,
				publicKeyHexs
			);

			if (result) {
				const url = new URL(
					`${process.env.RESOLVER_URL || DefaultResolverUrl}${did}?` +
						`resourceId=${resourcePayload.id}&resourceMetadata=true`
				);
				const didDereferencing = (await (await fetch(url)).json()) as DIDMetadataDereferencingResult;
				const resource = didDereferencing.contentMetadata.linkedResourceMetadata[0];

				// track resource creation
				const trackResourceInfo = {
					category: OperationCategoryNameEnum.RESOURCE,
					name: OperationNameEnum.RESOURCE_CREATE,
					customer: response.locals.customer,
					data: {
						did,
						resource: resource,
					} satisfies IResourceTrack,
				} as ITrackOperation;

				// track resource creation
				eventTracker.emit('track', trackResourceInfo);

				return response.status(StatusCodes.CREATED).json({
					resource,
				} satisfies CreateResourceResponseBody);
			} else {
				return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
					error: 'Error creating resource',
				} satisfies UnsuccessfulCreateResourceResponseBody);
			}
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `${error}`,
			} satisfies UnsuccessfulCreateResourceResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /resource/search/{did}:
	 *   get:
	 *     tags: [ Resource ]
	 *     summary: Get a DID-Linked Resource.
	 *     description: This endpoint returns the DID-Linked Resource for a given DID identifier and resource identifier.
	 *     parameters:
	 *       - in: path
	 *         name: did
	 *         description: DID identifier
	 *         schema:
	 *           type: string
	 *         required: true
	 *         example: did:cheqd:mainnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0
	 *       - in: query
	 *         name: resourceId
	 *         description: Fetch a DID-Linked Resource by Resource ID unique identifier. Since this is a unique identifier, other Resource query parameters are not required. See <a href="https://docs.cheqd.io/identity/credential-service/did-linked-resources/understanding-dlrs/technical-composition">DID-Linked Resources</a> for more details.
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *         example: 3ccde6ba-6ba5-56f2-9f4f-8825561a9860
	 *       - in: query
	 *         name: resourceName
	 *         description: Filter a DID-Linked Resource query by Resource Name. See <a href="https://docs.cheqd.io/identity/credential-service/did-linked-resources/understanding-dlrs/technical-composition">DID-Linked Resources</a> for more details.
	 *         schema:
	 *           type: string
	 *         example: cheqd-issuer-logo
	 *       - in: query
	 *         name: resourceType
	 *         description: Filter a DID-Linked Resource query by Resource Type. See <a href="https://docs.cheqd.io/identity/credential-service/did-linked-resources/understanding-dlrs/technical-composition">DID-Linked Resources</a> for more details.
	 *         schema:
	 *           type: string
	 *         example: CredentialArtwork
	 *       - in: query
	 *         name: resourceVersion
	 *         description: Filter a DID-Linked Resource query by Resource Version, which is an optional free-text field used by issuers (e.g., "v1", "Final Version", "1st January 1970" etc). See <a href="https://docs.cheqd.io/identity/credential-service/did-linked-resources/understanding-dlrs/technical-composition">DID-Linked Resources</a> for more details.
	 *         schema:
	 *           type: string
	 *         example: v1
	 *       - in: query
	 *         name: resourceVersionTime
	 *         description: Filter a DID-Linked Resource query which returns the closest version of the Resource *at* or *before* specified time. See <a href="https://docs.cheqd.io/identity/credential-service/did-linked-resources/understanding-dlrs/technical-composition">DID-Linked Resources</a> for more details.
	 *         schema:
	 *           type: string
	 *           format: date-time
	 *         example: 1970-01-01T00:00:00Z
	 *       - in: query
	 *         name: checksum
	 *         description: Request integrity check against a given DID-Linked Resource by providing a SHA-256 checksum hash. See <a href="https://docs.cheqd.io/identity/credential-service/did-linked-resources/understanding-dlrs/technical-composition">DID-Linked Resources</a> for more details.
	 *         schema:
	 *           type: string
	 *         example: dc64474d062ed750a66bad58cb609928de55ed0d81defd231a4a4bf97358e9ed
	 *       - in: query
	 *         name: resourceMetadata
	 *         description: Return only metadata of DID-Linked Resource instead of actual DID-Linked Resource. Mutually exclusive with some of the other parameters.
	 *         schema:
	 *           type: boolean
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           any:
	 *             schema:
	 *               type: object
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async searchResource(request: Request, response: Response) {
		const { did } = request.params as SearchResourceRequestParams;
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup();
		try {
			let res: globalThis.Response;
			if (did) {
				res = await identityServiceStrategySetup.agent.resolve(did + getQueryParams(request.query));

				const contentType = res.headers.get('Content-Type') || 'application/octet-stream';
				const body = new TextDecoder().decode(await res.arrayBuffer());

				return response
					.setHeader('Content-Type', contentType)
					.status(res.status)
					.send(body satisfies QueryResourceResponseBody);
			} else {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: 'The DID parameter is empty.',
				} satisfies UnsuccessfulQueryResourceResponseBody);
			}
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `${error}`,
			} satisfies UnsuccessfulQueryResourceResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /resource/list:
	 *   get:
	 *     tags: [ Resource ]
	 *     summary: Fetch Resources created by the user.
	 *     description: This endpoint returns the list of DID Linked Resources controlled by the account.
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: array
	 *               items:
	 *                 type: string
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public async listResources(request: Request, response: Response) {
		// Extract params, filters and pagination
		const { did, page, limit } = request.params;
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);

		try {
			const result = await identityServiceStrategySetup.agent.listResources(
				{ did },
				Number(page),
				Number(limit),
				response.locals.customer
			);

			return response.status(StatusCodes.OK).json({
				total: result.length,
				resources: result,
			});
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies UnsuccessfulGetDidResponseBody);
		}
	}
}
