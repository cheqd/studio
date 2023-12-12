import type { Request, Response } from 'express';
import { check, param, validationResult } from 'express-validator';
import { fromString } from 'uint8arrays';
import { v4 } from 'uuid';
import type { MsgCreateResourcePayload } from '@cheqd/ts-proto/cheqd/resource/v2/index.js';
import { StatusCodes } from 'http-status-codes';
import { IdentityServiceStrategySetup } from '../services/identity/index.js';
import { getQueryParams } from '../helpers/helpers.js';
import { DIDMetadataDereferencingResult, DefaultResolverUrl } from '@cheqd/did-provider-cheqd';
import type { ITrackOperation } from '../types/shared.js';
import { OPERATION_CATEGORY_NAME_RESOURCE } from '../types/constants.js';

export class ResourceController {
	public static resourceValidator = [
		param('did').exists().isString().contains('did:cheqd').withMessage('Invalid DID'),
		check('name').exists().withMessage('name is required').isString().withMessage('Invalid name'),
		check('type').exists().withMessage('type is required').isString().withMessage('Invalid type'),
		check('data').exists().withMessage('data is required').isString().withMessage('Invalid data'),
		check('encoding')
			.exists()
			.withMessage('encoding is required')
			.isString()
			.isIn(['hex', 'base64', 'base64url'])
			.withMessage('Invalid encoding'),
		check('alsoKnownAs').optional().isArray().withMessage('Invalid alsoKnownAs'),
		check('alsoKnownAs.*.uri').isString().withMessage('Invalid uri'),
		check('alsoKnownAs.*.description').isString().withMessage('Invalid description'),
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
	public async createResource(request: Request, response: Response) {
		// validate request
		const result = validationResult(request);

		// handle error
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array().pop()?.msg });
		}

		const { did } = request.params;
		const { data, encoding, name, type, alsoKnownAs, version, network } = request.body;
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);

		let resourcePayload: Partial<MsgCreateResourcePayload> = {};
		try {
			// check if did is registered on the ledger
			const { didDocument, didDocumentMetadata } = await identityServiceStrategySetup.agent.resolveDid(did);
			if (!didDocument || !didDocumentMetadata || didDocumentMetadata.deactivated) {
				return response.status(StatusCodes.BAD_REQUEST).send({
					error: `${did} is a either Deactivated or Not found`,
				});
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
				response.locals.customer
			);

			if (result) {
				const url = new URL(
					`${process.env.RESOLVER_URL || DefaultResolverUrl}${did}?` +
						`resourceId=${resourcePayload.id}&resourceMetadata=true`
				);
				const didDereferencing = (await (await fetch(url)).json()) as DIDMetadataDereferencingResult;
				const resource = didDereferencing.contentStream.linkedResourceMetadata[0];

				// track resource creation
				const trackResourceInfo = {
					category: OPERATION_CATEGORY_NAME_RESOURCE,
					operation: 'createResource',
					customer: response.locals.customer,
					did,
					data: {
						resource: resource,
						encrypted: false,
						symmetricKey: '',
					},
				} as ITrackOperation;

				const trackResult = await identityServiceStrategySetup.agent.trackOperation(trackResourceInfo);
				if (trackResult.error) {
					return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
						error: `${trackResult.error}`,
					});
				}

				return response.status(StatusCodes.CREATED).json({
					resource,
				});
			} else {
				return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
					error: 'Error creating resource',
				});
			}
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `${error}`,
			});
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
	public async getResource(request: Request, response: Response) {
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup();
		try {
			let res: globalThis.Response;
			if (request.params.did) {
				res = await identityServiceStrategySetup.agent.resolve(
					request.params.did + getQueryParams(request.query)
				);

				const contentType = res.headers.get('Content-Type') || 'application/octet-stream';
				const body = new TextDecoder().decode(await res.arrayBuffer());

				return response.setHeader('Content-Type', contentType).status(res.status).send(body);
			} else {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: 'The DID parameter is empty.',
				});
			}
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `${error}`,
			});
		}
	}
}
