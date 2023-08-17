import type { Request, Response } from 'express';
import { check, param, validationResult } from 'express-validator';
import { fromString } from 'uint8arrays';
import type { DIDDocument, Service, VerificationMethod } from 'did-resolver';
import { v4 } from 'uuid';
import { MethodSpecificIdAlgo, VerificationMethods, CheqdNetwork } from '@cheqd/sdk';
import type { MsgCreateResourcePayload } from '@cheqd/ts-proto/cheqd/resource/v2/index.js';
import { StatusCodes } from 'http-status-codes';

import { Identity } from '../services/identity/index.js';
import { generateDidDoc, getQueryParams, validateSpecCompliantPayload } from '../helpers/helpers.js';

export class IssuerController {
	public static createValidator = [
		check('didDocument')
			.optional()
			.isObject()
			.custom((value) => {
				const { valid } = validateSpecCompliantPayload(value);
				return valid;
			})
			.withMessage('Invalid didDocument'),
		check('verificationMethodType')
			.optional()
			.isString()
			.isIn([VerificationMethods.Ed255192020, VerificationMethods.Ed255192018, VerificationMethods.JWK])
			.withMessage('Invalid verificationMethod'),
		check('methodSpecificIdAlgo')
			.optional()
			.isString()
			.isIn([MethodSpecificIdAlgo.Base58, MethodSpecificIdAlgo.Uuid])
			.withMessage('Invalid methodSpecificIdAlgo'),
		check('network')
			.optional()
			.isString()
			.isIn([CheqdNetwork.Mainnet, CheqdNetwork.Testnet])
			.withMessage('Invalid network'),
	];

	public static updateValidator = [
		check('didDocument')
			.custom((value, { req }) => {
				if (value) {
					const { valid } = validateSpecCompliantPayload(value);
					return valid;
				} else {
					const { did, service, verificationMethod, authentication } = req.body;
					return did && (service || verificationMethod || authentication);
				}
			})
			.withMessage('Provide a valid DIDDocument or a DID and atleast one field to update'),
	];

	public static deactivateValidator = [
		param('did').exists().isString().contains('did:cheqd').withMessage('Invalid DID'),
	];

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
	 * /key/create:
	 *   post:
	 *     tags: [ Key ]
	 *     summary: Create an identity key pair.
	 *     description: This endpoint creates an identity key pair associated with the user's account for custodian-mode clients.
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/KeyResult'
	 *       400:
	 *         description: A problem with the input fields has occurred. Additional state information plus metadata may be available in the response body.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/InvalidRequest'
	 *             example:
	 *               error: InvalidRequest
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         description: An internal error has occurred. Additional state information plus metadata may be available in the response body.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/InvalidRequest'
	 *             example:
	 *               error: Internal Error
	 */
	public async createKey(request: Request, response: Response) {
		try {
			const key = await new Identity(response.locals.customerId).agent.createKey(
				'Ed25519',
				response.locals.customerId
			);
			return response.status(StatusCodes.OK).json(key);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `${error}`,
			});
		}
	}

	/**
	 * @openapi
	 *
	 * /key/read/{kid}:
	 *   get:
	 *     tags: [ Key ]
	 *     summary: Fetch an identity key pair.
	 *     description: This endpoint fetches an identity key pair's details for a given key ID. Only the user account associated with the custodian-mode client can fetch the key pair.
	 *     parameters:
	 *       - name: kid
	 *         description: Key ID of the identity key pair to fetch.
	 *         in: path
	 *         schema:
	 *           type: string
	 *         required: true
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/KeyResult'
	 *       400:
	 *         description: A problem with the input fields has occurred. Additional state information plus metadata may be available in the response body.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/InvalidRequest'
	 *             example:
	 *               error: InvalidRequest
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         description: An internal error has occurred. Additional state information plus metadata may be available in the response body.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/InvalidRequest'
	 *             example:
	 *               error: Internal Error
	 */
	public async getKey(request: Request, response: Response) {
		try {
			const key = await new Identity(response.locals.customerId).agent.getKey(
				request.params.kid,
				response.locals.customerId
			);
			return response.status(StatusCodes.OK).json(key);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `${error}`,
			});
		}
	}

	/**
	 * @openapi
	 *
	 * /did/create:
	 *   post:
	 *     tags: [ DID ]
	 *     summary: Create a DID Document.
	 *     description: This endpoint creates a DID and associated DID Document. As input, it can take the DID Document parameters via a form, or the fully-assembled DID Document itself.
	 *     requestBody:
	 *       content:
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             $ref: '#/components/schemas/DidCreateRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/DidCreateRequest'
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/DidResult'
	 *       400:
	 *         description: A problem with the input fields has occurred. Additional state information plus metadata may be available in the response body.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/InvalidRequest'
	 *             example:
	 *               error: InvalidRequest
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         description: An internal error has occurred. Additional state information plus metadata may be available in the response body.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/InvalidRequest'
	 *             example:
	 *               error: Internal Error
	 */
	public async createDid(request: Request, response: Response) {
		const result = validationResult(request);
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({
				error: result.array()[0].msg,
			});
		}

		const {
			methodSpecificIdAlgo,
			network,
			verificationMethodType,
			assertionMethod = true,
			serviceEndpoint,
		} = request.body;
		let didDocument: DIDDocument;
		try {
			if (request.body.didDocument) {
				didDocument = request.body.didDocument;
			} else if (verificationMethodType) {
				const key = await new Identity(response.locals.customerId).agent.createKey(
					'Ed25519',
					response.locals.customerId
				);
				didDocument = generateDidDoc({
					verificationMethod: verificationMethodType || VerificationMethods.Ed255192018,
					verificationMethodId: 'key-1',
					methodSpecificIdAlgo: (methodSpecificIdAlgo as MethodSpecificIdAlgo) || MethodSpecificIdAlgo.Uuid,
					network,
					publicKey: key.publicKeyHex,
				});

				if (assertionMethod) {
					didDocument.assertionMethod = didDocument.authentication;
				}

				if (serviceEndpoint) {
					didDocument.service = [
						{
							id: `${didDocument.id}#service-1`,
							type: 'service-1',
							serviceEndpoint: [serviceEndpoint],
						},
					];
				}
			} else {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: 'Provide a DID Document or the network type to create a DID',
				});
			}

			const did = await new Identity(response.locals.customerId).agent.createDid(
				network || didDocument.id.split(':')[2],
				didDocument,
				response.locals.customerId
			);
			return response.status(StatusCodes.OK).json(did);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `${error}`,
			});
		}
	}

	/**
	 * @openapi
	 *
	 * /did/update:
	 *   post:
	 *     tags: [ DID ]
	 *     summary: Update a DID Document.
	 *     description: This endpoint updates a DID Document. As an input, it can take JUST the sections/parameters that need to be updated in the DID Document (in this scenario, it fetches the current DID Document and applies the updated section). Alternatively, it take the fully-assembled DID Document with updated sections as well as unchanged sections.
	 *     requestBody:
	 *       content:
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             $ref: '#/components/schemas/DidUpdateRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/DidUpdateRequest'
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/DidResult'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public async updateDid(request: Request, response: Response) {
		const result = validationResult(request);
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({
				error: result.array()[0].msg,
			});
		}

		try {
			const { did, service, verificationMethod, authentication } = request.body as {
				did: string;
				service: Service[];
				verificationMethod: VerificationMethod[];
				authentication: string[];
			};
			let updatedDocument: DIDDocument;
			if (request.body.didDocument) {
				updatedDocument = request.body.didDocument;
			} else if (did && (service || verificationMethod || authentication)) {
				const resolvedResult = await new Identity(response.locals.customerId).agent.resolveDid(did);
				if (!resolvedResult?.didDocument || resolvedResult.didDocumentMetadata.deactivated) {
					return response.status(StatusCodes.BAD_REQUEST).send({
						error: `${did} is either Deactivated or Not found`,
					});
				}
				const resolvedDocument = resolvedResult.didDocument;
				if (service) {
					resolvedDocument.service = Array.isArray(service) ? service : [service];
				}
				if (verificationMethod) {
					resolvedDocument.verificationMethod = Array.isArray(verificationMethod)
						? verificationMethod
						: [verificationMethod];
				}
				if (authentication) {
					resolvedDocument.authentication = Array.isArray(authentication) ? authentication : [authentication];
				}

				updatedDocument = resolvedDocument;
			} else {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: 'Provide a DID Document or atleast one field to update',
				});
			}

			const result = await new Identity(response.locals.customerId).agent.updateDid(
				updatedDocument,
				response.locals.customerId
			);
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
	 * /did/deactivate/{did}:
	 *   post:
	 *     tags: [ DID ]
	 *     summary: Deactivate a DID Document.
	 *     description: This endpoint deactivates a DID Document by taking the DID identifier as input. Must be called and signed by the DID owner.
	 *     parameters:
	 *       - in: path
	 *         name: did
	 *         description: DID identifier to deactivate.
	 *         schema:
	 *           type: string
	 *         required: true
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/DidResult'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public async deactivateDid(request: Request, response: Response) {
		const result = validationResult(request);
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({
				error: result.array()[0].msg,
			});
		}

		try {
			const did = await new Identity(response.locals.customerId).agent.deactivateDid(
				request.params.did,
				response.locals.customerId
			);
			return response.status(StatusCodes.OK).json(did);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `${error}`,
			});
		}
	}

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
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public async createResource(request: Request, response: Response) {
		const result = validationResult(request);
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({
				error: result.array()[0].msg,
			});
		}

		const { did } = request.params;
		const { data, encoding, name, type, alsoKnownAs, version, network } = request.body;

		let resourcePayload: Partial<MsgCreateResourcePayload> = {};
		try {
			// check if did is registered on the ledger
			const { didDocument, didDocumentMetadata } = await new Identity(
				response.locals.customerId
			).agent.resolveDid(did);
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
			const result = await new Identity(response.locals.customerId).agent.createResource(
				network || did.split(':')[2],
				resourcePayload,
				response.locals.customerId
			);
			if (result) {
				return response.status(StatusCodes.CREATED).json({
					resource: resourcePayload,
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
	 * /resource/search/{did}/{resourceId}:
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
	 *         example: Cheqd Issuer Logo
	 *       - in: query
	 *         name: resourceType
	 *         description: Filter a DID-Linked Resource query by Resource Type. See <a href="https://docs.cheqd.io/identity/credential-service/did-linked-resources/understanding-dlrs/technical-composition">DID-Linked Resources</a> for more details.
	 *         schema:
	 *           type: string
	 *         example: IssuerLogo
	 *       - in: query
	 *         name: resourceVersion
	 *         description: Filter a DID-Linked Resource query by Resource Version, which is an optional free-text field used by issuers (e.g., "v1", "Final Version", "1st January 1970" etc). See <a href="https://docs.cheqd.io/identity/credential-service/did-linked-resources/understanding-dlrs/technical-composition">DID-Linked Resources</a> for more details.
	 *         schema:
	 *           type: string
	 *       - in: query
	 *         name: resourceVersionTime
	 *         description: Filter a DID-Linked Resource query which returns the closest version of the Resource *at* or *before* specified time. See <a href="https://docs.cheqd.io/identity/credential-service/did-linked-resources/understanding-dlrs/technical-composition">DID-Linked Resources</a> for more details.
	 *         schema:
	 *           type: string
	 *           format: date-time
	 *         example: 1970-01-01T00:00:00Z
	 *       - in: query
	 *         name: resourceMetadata
	 *         description: Return only metadata of DID-Linked Resource instead of actual DID-Linked Resource. Mutually exclusive with some of the other parameters.
	 *         schema:
	 *           type: boolean
	 *       - in: query
	 *         name: checksum
	 *         description: Request integrity check against a given DID-Linked Resource by providing a SHA-256 checksum hash. See <a href="https://docs.cheqd.io/identity/credential-service/did-linked-resources/understanding-dlrs/technical-composition">DID-Linked Resources</a> for more details.
	 *         schema:
	 *           type: string
	 *         example: dc64474d062ed750a66bad58cb609928de55ed0d81defd231a4a4bf97358e9ed
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           any:
	 *             schema:
	 *               type: object
	 *               example: <svg width="200" height="36" xmlns="http://www.w3.org/2000/svg"><path d="M186.292 17.513a6.657 6.657 0 0 1 6.878 2.584l-11.905 2.693c.411-2.52 2.333-4.668 5.027-5.277zm6.945 9.91a6.57 6.57 0 0 1-3.98 2.679c-2.711.614-5.417-.51-6.907-2.626l11.941-2.702 1.945-.44 3.72-.841a11.77 11.77 0 0 0-.31-2.372c-1.514-6.426-8.056-10.432-14.612-8.949-6.556 1.484-10.644 7.896-9.13 14.321 1.513 6.426 8.055 10.433 14.611 8.95 3.863-.875 6.868-3.46 8.376-6.751l-5.654-1.269zm-28.102 7.695V18.082h-3.677v-5.804h3.677V4.289h6.244v7.989h4.69v5.804h-4.69v17.036h-6.244zm-11.928 0h6.03v-22.84h-6.03v22.84zm-.784-30.853c0-2.114 1.667-3.7 3.824-3.7s3.775 1.586 3.775 3.7c0 2.115-1.618 3.748-3.775 3.748s-3.824-1.633-3.824-3.748zm-1.315 8.077c-3.083.16-4.901.633-6.75 1.973v-2.037h-6.027v22.84h6.026v-11.2c0-3.524.86-5.529 6.751-5.726v-5.85zm-33.601 11.715c.15 3.333 3.051 6.128 6.602 6.128 3.602 0 6.553-2.942 6.553-6.422 0-3.432-2.951-6.373-6.553-6.373-3.55 0-6.452 2.843-6.602 6.128v.539zm-5.88 11.061V1.38l6.03-1.364v13.962c1.863-1.49 4.07-2.115 6.472-2.115 6.864 0 12.355 5.286 12.355 11.918 0 6.583-5.49 11.965-12.355 11.965-2.402 0-4.609-.624-6.472-2.114v1.487h-6.03v-.001zm-12.835 0V17.965h-3.677v-5.687h3.677V4.283l6.244-1.413v9.408h4.69v5.687h-4.69v17.153h-6.244zm-11.05 0V22.915c0-4.421-2.403-5.382-4.806-5.382-2.402 0-4.804.913-4.804 5.286v12.299h-6.03v-22.84h6.03v1.699c1.323-.961 2.941-2.115 6.129-2.115 5.098 0 9.511 2.932 9.511 10.092v13.164h-6.03zM56.831 17.513c2.694-.61 5.382.495 6.878 2.584L51.805 22.79c.41-2.52 2.333-4.668 5.026-5.277zm6.945 9.91a6.57 6.57 0 0 1-3.98 2.679 6.656 6.656 0 0 1-6.907-2.626l11.942-2.702 1.945-.44 3.719-.841a11.77 11.77 0 0 0-.31-2.372c-1.514-6.426-8.056-10.432-14.612-8.949-6.556 1.484-10.644 7.896-9.13 14.321 1.514 6.426 8.055 10.433 14.612 8.95 3.863-.875 6.868-3.46 8.375-6.751l-5.654-1.269zm-31.538 7.695l-9.365-22.84h6.57l5.933 15.49 5.981-15.49h6.57l-9.364 22.84h-6.325zM11.05 17.507a6.658 6.658 0 0 1 6.879 2.584L6.024 22.785c.41-2.52 2.333-4.668 5.026-5.278zm6.945 9.91a6.57 6.57 0 0 1-3.98 2.68c-2.71.613-5.416-.51-6.907-2.626l11.942-2.702 1.945-.44 3.719-.842a11.782 11.782 0 0 0-.31-2.371c-1.514-6.426-8.055-10.433-14.612-8.95C3.236 13.65-.85 20.063.662 26.489c1.514 6.426 8.056 10.432 14.612 8.949 3.863-.874 6.868-3.46 8.376-6.75l-5.655-1.27v-.001z" fill="#F05537"/></svg> 
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public async getResource(request: Request, response: Response) {
		try {
			if (request.params.did) {
				const res = await new Identity(response.locals.customerId).agent.resolve(
					request.params.did+getQueryParams(request.query)
				);

				const contentType = res.headers.get("Content-Type");
				const body = new TextDecoder().decode(await res.arrayBuffer());

				return response.setHeader("Content-Type", contentType!).status(200).send(body);
			} else {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: "The DID or resourceId parameter is empty."
				})
			}
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `${error}`
			})
		}
	}

	/**
	 * @openapi
	 *
	 * /did/list:
	 *   get:
	 *     tags: [ DID ]
	 *     summary: Fetch DIDs associated with an account.
	 *     description: This endpoint returns the list of DIDs controlled by the account.
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
	public async getDids(request: Request, response: Response) {
		try {
			const did = request.params.did
				? await new Identity(response.locals.customerId).agent.resolveDid(request.params.did)
				: await new Identity(response.locals.customerId).agent.listDids(response.locals.customerId);

			return response.status(StatusCodes.OK).json(did);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `${error}`,
			});
		}
	}

	/**
	 * @openapi
	 *
	 * /did/search/{did}:
	 *   get:
	 *     tags: [ DID ]
	 *     summary: Resolve a DID Document.
	 *     description: Resolve a DID Document by DID identifier. Also supports DID Resolution Queries as defined in the <a href="https://w3c-ccg.github.io/did-resolution/">W3C DID Resolution specification</a>.
	 *     parameters:
	 *       - in: path
	 *         name: did
	 *         description: DID identifier to resolve.
	 *         schema:
	 *           type: string
	 *         required: true
	 *         example: did:cheqd:mainnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0
	 *       - in: query
	 *         name: metadata
	 *         description: Return only metadata of DID Document instead of actual DID Document.
	 *         schema:
	 *           type: boolean
	 *       - in: query
	 *         name: resourceName
	 *         description: Filter a DID-Linked Resource query by Resource Name. See <a href="https://docs.cheqd.io/identity/credential-service/did-linked-resources/understanding-dlrs/technical-composition">DID-Linked Resources</a> for more details.
	 *         schema:
	 *           type: string
	 *         example: Cheqd Issuer Logo
	 *       - in: query
	 *         name: resourceType
	 *         description: Filter a DID-Linked Resource query by Resource Type. See <a href="https://docs.cheqd.io/identity/credential-service/did-linked-resources/understanding-dlrs/technical-composition">DID-Linked Resources</a> for more details.
	 *         schema:
	 *           type: string
	 *         example: IssuerLogo
	 *       - in: query
	 *         name: resourceVersion
	 *         description: Filter a DID-Linked Resource query by Resource Version, which is an optional free-text field used by issuers (e.g., "v1", "Final Version", "1st January 1970" etc). See <a href="https://docs.cheqd.io/identity/credential-service/did-linked-resources/understanding-dlrs/technical-composition">DID-Linked Resources</a> for more details.
	 *         schema:
	 *           type: string
	 *       - in: query
	 *         name: resourceVersionTime
	 *         description: Filter a DID-Linked Resource query which returns the closest version of the Resource *at* or *before* specified time. See <a href="https://docs.cheqd.io/identity/credential-service/did-linked-resources/understanding-dlrs/technical-composition">DID-Linked Resources</a> for more details.
	 *         schema:
	 *           type: string
	 *           format: date-time
	 *         example: 1970-01-01T00:00:00Z
	 *       - in: query
	 *         name: resourceMetadata
	 *         description: Return only metadata of DID-Linked Resource instead of actual DID-Linked Resource. Mutually exclusive with some of the other parameters.
	 *         schema:
	 *           type: boolean
	 *       - in: query
	 *         name: checksum
	 *         description: Request integrity check against a given DID-Linked Resource by providing a SHA-256 checksum hash. See <a href="https://docs.cheqd.io/identity/credential-service/did-linked-resources/understanding-dlrs/technical-composition">DID-Linked Resources</a> for more details.
	 *         schema:
	 *           type: string
	 *         example: dc64474d062ed750a66bad58cb609928de55ed0d81defd231a4a4bf97358e9ed
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/DidResolution'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public async resolveDidUrl(request: Request, response: Response) {
		try {
			if (request.params.did) {
				const res = await new Identity(response.locals.customerId).agent.resolve(
					request.params.did+getQueryParams(request.query)
				);

				const contentType = res.headers.get("Content-Type");
				const body = new TextDecoder().decode(await res.arrayBuffer());

				return response.setHeader("Content-Type", contentType!).status(200).send(body);
			} else {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: "The DIDUrl parameter is empty."
				});
			}
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `${error}`,
			});
		}
	}
}
