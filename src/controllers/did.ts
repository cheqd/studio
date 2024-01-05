import type { Request, Response } from 'express';
import { fromString, toString } from 'uint8arrays';
import {
	CheqdNetwork,
	DIDDocument,
	MethodSpecificIdAlgo,
	Service,
	VerificationMethod,
	VerificationMethods,
	createDidVerificationMethod,
} from '@cheqd/sdk';
import { StatusCodes } from 'http-status-codes';
import { IdentityServiceStrategySetup } from '../services/identity/index.js';
import { decryptPrivateKey, generateDidDoc, getQueryParams } from '../helpers/helpers.js';
import { bases } from 'multiformats/basics';
import { base64ToBytes } from 'did-jwt';
import type {
	CreateDidRequestBody,
	KeyImportRequest,
	CreateDidResponseBody,
	DeactivateDidResponseBody,
	ListDidsResponseBody,
	QueryDidResponseBody,
	ResolveDidResponseBody,
	UnsuccessfulCreateDidResponseBody,
	UnsuccessfulDeactivateDidResponseBody,
	UnsuccessfulGetDidResponseBody,
	UnsuccessfulResolveDidResponseBody,
	UnsuccessfulUpdateDidResponseBody,
	UpdateDidResponseBody,
} from '../types/did.js';
import { check, validationResult, param } from './validator/index.js';
import type { IKey, RequireOnly } from '@veramo/core';
import { extractPublicKeyHex } from '@veramo/utils';

export class DIDController {
	public static createDIDValidator = [
		check('didDocument').optional().isObject().withMessage('Should be JSON object').bail().isDIDDocument(),
		check('verificationMethodType')
			.optional()
			.isString()
			.isIn([VerificationMethods.Ed255192020, VerificationMethods.Ed255192018, VerificationMethods.JWK])
			.withMessage('Invalid verificationMethod')
			.bail(),
		check('identifierFormatType')
			.optional()
			.isString()
			.isIn([MethodSpecificIdAlgo.Base58, MethodSpecificIdAlgo.Uuid])
			.withMessage('Invalid identifierFormatType')
			.bail(),
		check('network')
			.optional()
			.isString()
			.isIn([CheqdNetwork.Mainnet, CheqdNetwork.Testnet])
			.withMessage('Invalid network')
			.bail(),
		check('assertionMethod').optional().isBoolean().withMessage('Invalid assertionMethod').bail(),
		check('service')
			.optional()
			.isArray()
			.withMessage('Service should be an array of objects for creating DID-Service')
			.bail()
			.isCreateDIDDocumentService()
			.bail(),
	];

	public static updateDIDValidator = [
		check('didDocument').optional().isDIDDocument().bail(),
		check('did').optional().isDID().bail(),
		check('service')
			.optional()
			.isArray()
			.withMessage('Service should be an array of objects for updating DID-Service')
			.bail()
			.isService()
			.bail(),
		check('verificationMethod')
			.optional()
			.isArray()
			.withMessage('VerificationMethod should be an array of objects for updating DID-VerificationMethod')
			.bail()
			.isVerificationMethod()
			.bail(),
		check('authentication')
			.optional()
			.isArray()
			.withMessage('Authentication should be an array of strings for updating DID-Authentication')
			.bail()
			.isDIDArray()
			.bail(),
	];

	public static deactivateDIDValidator = [param('did').exists().isString().isDID().bail()];

	public static importDIDValidator = [
		check('did').isDID().bail(),
		check('controllerKeyId').optional().isString().withMessage('controllerKeyId should be a string').bail(),
		check('keys')
			.isArray()
			.withMessage('Keys should be an array of KeyImportRequest objects used in the DID-VerificationMethod')
			.custom((value) => {
				return value.every(
					(item: KeyImportRequest) =>
						item.privateKeyHex &&
						typeof item.encrypted === 'boolean' &&
						(item.encrypted === true ? item.ivHex && item.salt : true)
				);
			})
			.withMessage(
				'KeyImportRequest object is invalid, privateKeyHex is required, Property ivHex, salt is required when encrypted is set to true'
			)
			.bail(),
	];

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
	 *             $ref: '#/components/schemas/DidCreateRequestFormBased'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/DidCreateRequestJson'
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
		// validate request
		const result = validationResult(request);

		// handle error
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({
				error: result.array().pop()?.msg,
			} satisfies UnsuccessfulCreateDidResponseBody);
		}

		// handle request params
		const { identifierFormatType, network, verificationMethodType, service, key, options } =
			request.body satisfies CreateDidRequestBody;
		let didDocument: DIDDocument;
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);
		try {
			if (request.body.didDocument) {
				didDocument = request.body.didDocument;
				if (options) {
					const publicKeyHex =
						options.key ||
						(await identityServiceStrategySetup.agent.createKey('Ed25519', response.locals.customer))
							.publicKeyHex;
					const pkBase64 =
						publicKeyHex.length == 43 ? publicKeyHex : toString(fromString(publicKeyHex, 'hex'), 'base64');

					didDocument.verificationMethod = createDidVerificationMethod(
						[options.verificationMethodType],
						[
							{
								methodSpecificId: bases['base58btc'].encode(base64ToBytes(pkBase64)),
								didUrl: didDocument.id,
								keyId: `${didDocument.id}#key-1`,
								publicKey: pkBase64,
							},
						]
					);
				} else {
					return response.status(StatusCodes.BAD_REQUEST).json({
						error: 'Provide options section to create a DID',
					} satisfies UnsuccessfulCreateDidResponseBody);
				}
			} else if (verificationMethodType) {
				const publicKeyHex =
					key ||
					(await identityServiceStrategySetup.agent.createKey('Ed25519', response.locals.customer))
						.publicKeyHex;
				didDocument = generateDidDoc({
					verificationMethod: verificationMethodType,
					verificationMethodId: 'key-1',
					methodSpecificIdAlgo: identifierFormatType || MethodSpecificIdAlgo.Uuid,
					network,
					publicKey: publicKeyHex,
				});

				if (Array.isArray(request.body['@context'])) {
					didDocument['@context'] = request.body['@context'];
				}
				if (typeof request.body['@context'] === 'string') {
					didDocument['@context'] = [request.body['@context']];
				}

				if (service) {
					if (Array.isArray(service)) {
						try {
							const services = service as Service[];
							didDocument.service = [];
							for (const service of services) {
								didDocument.service.push({
									id: `${didDocument.id}#${service.idFragment}`,
									type: service.type,
									serviceEndpoint: service.serviceEndpoint,
								});
							}
						} catch (e) {
							return response.status(StatusCodes.BAD_REQUEST).json({
								error: 'Provide the correct service section to create a DID',
							} satisfies UnsuccessfulCreateDidResponseBody);
						}
					} else {
						didDocument.service = [
							{
								id: `${didDocument.id}#${service.idFragment}`,
								type: service.type,
								serviceEndpoint: service.serviceEndpoint,
							},
						];
					}
				}
			} else {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: 'Provide a DID Document or the VerificationMethodType to create a DID',
				} satisfies UnsuccessfulCreateDidResponseBody);
			}

			const did = await new IdentityServiceStrategySetup(response.locals.customer.customerId).agent.createDid(
				network || didDocument.id.split(':')[2],
				didDocument,
				response.locals.customer
			);
			return response.status(StatusCodes.OK).json(did satisfies CreateDidResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies UnsuccessfulCreateDidResponseBody);
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
		// validate request
		const result = validationResult(request);

		// handle error
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({
				error: result.array().pop()?.msg,
			} satisfies UnsuccessfulUpdateDidResponseBody);
		}

		// handle request params
		const { did, service, verificationMethod, authentication } = request.body as {
			did: string;
			service: Service[];
			verificationMethod: VerificationMethod[];
			authentication: string[];
		};
		let updatedDocument: DIDDocument;
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);

		try {
			if (request.body.didDocument) {
				// Just pass the didDocument from the user as is
				updatedDocument = request.body.didDocument;
			} else if (did && (service || verificationMethod || authentication)) {
				// Resolve DID
				const resolvedResult = await identityServiceStrategySetup.agent.resolveDid(did);
				// Check output that DID is not deactivated or exist
				if (!resolvedResult?.didDocument || resolvedResult.didDocumentMetadata.deactivated) {
					return response.status(StatusCodes.BAD_REQUEST).send({
						error: `${did} is either Deactivated or Not found`,
					} satisfies UnsuccessfulUpdateDidResponseBody);
				}
				// Fill up the DID Document with updated sections
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
				} satisfies UnsuccessfulUpdateDidResponseBody);
			}

			const result = await identityServiceStrategySetup.agent.updateDid(
				updatedDocument,
				response.locals.customer
			);
			return response.status(StatusCodes.OK).json(result satisfies UpdateDidResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies UnsuccessfulUpdateDidResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /did/import:
	 *   post:
	 *     tags: [ DID ]
	 *     summary: Import a DID Document.
	 *     description: This endpoint imports a decentralized identifier associated with the user's account for custodian-mode clients.
	 *     requestBody:
	 *       content:
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             $ref: '#/components/schemas/DidImportRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/DidImportRequest'
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
	public async importDid(request: Request, response: Response) {
		// validate request
		const result = validationResult(request);

		// handle error
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array().pop()?.msg });
		}

		try {
			const { did, controllerKeyId, keys } = request.body;
			const { didDocument } = await new IdentityServiceStrategySetup().agent.resolveDid(did);
			if (!didDocument || !didDocument.verificationMethod || didDocument.verificationMethod.length === 0) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: `Invalid request: Invalid did document for ${did}`,
				});
			}
			const publicKeyHexs: string[] = [
				...new Set(
					didDocument.verificationMethod.map((vm) => extractPublicKeyHex(vm)).filter((pk) => pk) || []
				),
			];

			const keysToImport: RequireOnly<IKey, 'privateKeyHex' | 'type'>[] = [];
			if (keys && keys.length === publicKeyHexs.length) {
				// import keys
				keysToImport.push(
					...(await Promise.all(
						keys.map(async (key: any) => {
							const { type, encrypted, ivHex, salt } = key;
							let { privateKeyHex } = key;
							if (encrypted) {
								if (ivHex && salt) {
									privateKeyHex = toString(
										await decryptPrivateKey(privateKeyHex, ivHex, salt),
										'hex'
									);
								} else {
									throw new Error(
										`Invalid request: Property ivHex, salt is required when encrypted is set to true`
									);
								}
							}

							return {
								type: type || 'Ed25519',
								privateKeyHex,
							};
						})
					))
				);
			} else if (keys) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: `Invalid request: Provide all the required keys`,
				});
			}

			const identifier = await new IdentityServiceStrategySetup(
				response.locals.customer.customerId
			).agent.importDid(did, keys, controllerKeyId, response.locals.customer);
			return response.status(StatusCodes.OK).json(identifier);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
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
	 *               $ref: '#/components/schemas/DeactivatedDidResolution'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public async deactivateDid(request: Request, response: Response) {
		// Assume that did was not deactivated
		let deactivated = false;
		// validate request
		const result = validationResult(request);

		// handle error
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({
				deactivated,
				error: result.array().pop()?.msg,
			} satisfies UnsuccessfulDeactivateDidResponseBody);
		}

		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);

		try {
			// Deactivate DID
			deactivated = await identityServiceStrategySetup.agent.deactivateDid(
				request.params.did,
				response.locals.customer
			);
			// Send the deactivated DID as result
			const result = await identityServiceStrategySetup.agent.resolveDid(request.params.did);

			return response.status(StatusCodes.OK).json(result satisfies DeactivateDidResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				deactivated,
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies UnsuccessfulDeactivateDidResponseBody);
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
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);
		try {
			const did = request.params.did
				? await identityServiceStrategySetup.agent.resolveDid(request.params.did)
				: await identityServiceStrategySetup.agent.listDids(response.locals.customer);

			return response.status(StatusCodes.OK).json(did satisfies ListDidsResponseBody | QueryDidResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies UnsuccessfulGetDidResponseBody);
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
	 *         example: /path/to/file
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

				return response
					.setHeader('Content-Type', contentType)
					.status(res.status)
					.send(body satisfies ResolveDidResponseBody);
			} else {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: 'The DIDUrl parameter is empty.',
				} satisfies UnsuccessfulResolveDidResponseBody);
			}
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies UnsuccessfulResolveDidResponseBody);
		}
	}
}
