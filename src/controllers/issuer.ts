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
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public async getResource(request: Request, response: Response) {
		try {
			let res: globalThis.Response;
			if (request.params.did) {
				res = await new Identity(response.locals.customerId).agent.resolve(
					request.params.did + getQueryParams(request.query)
				);

				const contentType = res.headers.get('Content-Type');
				const body = new TextDecoder().decode(await res.arrayBuffer());

				return response.setHeader('Content-Type', contentType!).status(res.status).send(body);
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
	 *         name: versionId
	 *         description: Unique UUID version identifier of DID Document. Allows for fetching a specific version of the DID Document. See <a href="https://docs.cheqd.io/identity/architecture/adr-list/adr-001-cheqd-did-method#did-document-metadata">cheqd DID Method Specification</a> for more details.
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *         example: 3ccde6ba-6ba5-56f2-9f4f-8825561a9860
	 *       - in: query
	 *         name: versionTime
	 *         description: Returns the closest version of the DID Document *at* or *before* specified time. See <a href="https://docs.cheqd.io/identity/architecture/adr-list/adr-005-did-resolution-and-did-url-dereferencing">DID Resolution handling for `did:cheqd`</a> for more details.
	 *         schema:
	 *           type: string
	 *           format: date-time
	 *         example: 1970-01-01T00:00:00Z
	 *       - in: query
	 *         name: transformKeys
	 *         description: This directive transforms the Verification Method key format from the version in the DID Document to the specified format chosen below.
	 *         schema:
	 *           type: string
	 *           enum:
	 *             - Ed25519VerificationKey2018
	 *             - Ed25519VerificationKey2020
	 *             - JsonWebKey2020
	 *       - in: query
	 *         name: service
	 *         description: Query DID Document for a specific Service Endpoint by Service ID (e.g., `service-1` in `did:cheqd:mainnet:7bf81a20-633c-4cc7-bc4a-5a45801005e0#service-1`). This will typically redirect to the Service Endpoint based on <a href="https://w3c-ccg.github.io/did-resolution/#dereferencing">DID Resolution specification</a> algorithm.
	 *         schema:
	 *           type: string
	 *         example: service-1
	 *       - in: query
	 *         name: relativeRef
	 *         description: Relative reference is a query fragment appended to the Service Endpoint URL. **Must** be used along with the `service` query property above. See <a href="https://w3c-ccg.github.io/did-resolution/#dereferencing">DID Resolution specification</a> algorithm for more details.
	 *         schema:
	 *           type: string
	 *         example: /path/to/resource
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
			let res: globalThis.Response;
			if (request.params.did) {
				res = await new Identity(response.locals.customerId).agent.resolve(
					request.params.did + getQueryParams(request.query)
				);

				const contentType = res.headers.get('Content-Type');
				const body = new TextDecoder().decode(await res.arrayBuffer());

				return response.setHeader('Content-Type', contentType!).status(res.status).send(body);
			} else {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: 'The DIDUrl parameter is empty.',
				});
			}
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `${error}`,
			});
		}
	}
}
