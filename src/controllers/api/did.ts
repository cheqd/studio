import type { Request, Response } from 'express';
import { fromString, toString } from 'uint8arrays';
import {
	CheqdNetwork,
	DIDDocument,
	MethodSpecificIdAlgo,
	Service,
	VerificationMethods,
	createDidVerificationMethod,
} from '@cheqd/sdk';
import { StatusCodes } from 'http-status-codes';
import { IdentityServiceStrategySetup } from '../../services/identity/index.js';
import { decryptPrivateKey, generateDidDoc, getQueryParams } from '../../helpers/helpers.js';
import { bases } from 'multiformats/basics';
import { base64ToBytes } from 'did-jwt';
import type {
	CreateDidRequestBody,
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
	UpdateDidRequestBody,
	ImportDidRequestBody,
	DeactivateDIDRequestParams,
	GetDIDRequestParams,
	ResolveDIDRequestParams,
	DeactivateDIDRequestBody,
} from '../../types/did.js';
import { check, param } from '../validator/index.js';
import type { IIdentifier, IKey, RequireOnly } from '@veramo/core';
import { SupportedKeyTypes, extractPublicKeyHex } from '@veramo/utils';
import type { KeyImport } from '../../types/key.js';
import { eventTracker } from '../../services/track/tracker.js';
import { OperationCategoryNameEnum, OperationNameEnum } from '../../types/constants.js';
import type { IDIDTrack, ITrackOperation } from '../../types/track.js';
import { arePublicKeyHexsInWallet } from '../../services/helpers.js';
import { CheqdProviderErrorCodes } from '@cheqd/did-provider-cheqd';
import type { CheqdProviderError } from '@cheqd/did-provider-cheqd';
import { validate } from '../validator/decorator.js';
import { query } from 'express-validator';
import { DockIdentityService } from '../../services/identity/providers/index.js';
import { ProviderService } from '../../services/api/provider.service.js';

export class DIDController {
	public static createDIDValidator = [
		check('didDocument').optional().isObject().withMessage('Should be JSON object').bail().isDIDDocument(),
		check('verificationMethodType')
			.optional()
			.isString()
			.isIn([VerificationMethods.Ed255192020, VerificationMethods.Ed255192018, VerificationMethods.JWK])
			.withMessage('Unsupported verificationMethod type')
			.bail(),
		check('key')
			.optional()
			.isString()
			.withMessage('key should be a string')
			.bail()
			.custom((key, { req }) => {
				if (key && !req.body.verificationMethodType) {
					throw new Error('If key is provided, verificationMethodType is required');
				}
				return true;
			})
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
		check('service').optional().isCreateDIDDocumentService().bail(),
		check('options').optional().isObject().withMessage('options should be an object').bail(),
		check('options.verificationMethodType')
			.optional()
			.isString()
			.isIn([VerificationMethods.Ed255192020, VerificationMethods.Ed255192018, VerificationMethods.JWK])
			.withMessage('Unsupported verificationMethod type')
			.bail(),
		check('options.key')
			.optional()
			.isString()
			.withMessage('key should be a string')
			.bail()
			.custom((key, { req }) => {
				if (key && !req.body.options?.verificationMethodType) {
					throw new Error('If key is provided, options.verificationMethodType is required');
				}
				return true;
			})
			.bail(),
		check('providerId').optional().isString().bail(),
	];

	public static updateDIDValidator = [
		check('didDocument').optional().isDIDDocument().bail(),
		check('did').optional().isDID().bail(),
		check('service').optional().isService().bail(),
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
		check('publicKeyHexs').optional().isArray().withMessage('publicKeyHexs should be an array of strings').bail(),
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
					(item: KeyImport) =>
						item.privateKeyHex &&
						typeof item.encrypted === 'boolean' &&
						(item.encrypted === true ? item.ivHex && item.salt : true) &&
						typeof item.type === 'string' &&
						(item.type === 'Ed25519' || item.type === 'Secp256k1')
				);
			})
			.withMessage(
				'KeyImportRequest object is invalid, privateKeyHex is required, Property ivHex, salt is required when encrypted is set to true, property type should be Ed25519 or Secp256k1'
			)
			.bail(),
	];

	public static listDIDValidator = [
		query('network')
			.optional()
			.isString()
			.isIn([CheqdNetwork.Mainnet, CheqdNetwork.Testnet])
			.withMessage('Invalid network')
			.bail(),
	];

	/**
	 * @openapi
	 *
	 * /did/create:
	 *   post:
	 *     tags: [ Decentralized Identifiers (DIDs) ]
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
	@validate
	public async createDid(request: Request, response: Response) {
		// handle request params
		const { identifierFormatType, network, service, options, providerId } =
			request.body satisfies CreateDidRequestBody;
		let didDocument: DIDDocument;

		const key = options?.key || request.body.key;
		const verificationMethodType = options?.verificationMethodType || request.body.verificationMethodType;
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);
		try {
			if (request.body.didDocument) {
				didDocument = request.body.didDocument;
				if (verificationMethodType) {
					const publicKeyHex =
						key ||
						(
							await identityServiceStrategySetup.agent.createKey(
								SupportedKeyTypes.Ed25519,
								response.locals.customer
							)
						).publicKeyHex;

					const pkBase64 = toString(fromString(publicKeyHex, 'hex'), 'base64');
					didDocument.verificationMethod = createDidVerificationMethod(
						[verificationMethodType],
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
					(
						await identityServiceStrategySetup.agent.createKey(
							SupportedKeyTypes.Ed25519,
							response.locals.customer
						)
					).publicKeyHex;
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
									recipientKeys: service.recipientKeys,
									routingKeys: service.routingKeys,
									priority: service.priority,
									accept: service.accept,
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
								recipientKeys: service.recipientKeys,
								routingKeys: service.routingKeys,
								priority: service.priority,
								accept: service.accept,
							},
						];
					}
				}
			} else {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: 'Provide a DID Document or the VerificationMethodType to create a DID',
				} satisfies UnsuccessfulCreateDidResponseBody);
			}

			let did: IIdentifier;
			switch (providerId) {
				case 'dock':
					did = await new DockIdentityService().createDid(
						network || didDocument.id.split(':')[2],
						didDocument,
						response.locals.customer
					);
					break;
				case 'studio':
				case undefined:
					did = await new IdentityServiceStrategySetup(response.locals.customer.customerId).agent.createDid(
						network || didDocument.id.split(':')[2],
						didDocument,
						response.locals.customer
					);
					break;
				default:
					return response.status(StatusCodes.BAD_REQUEST).json({
						error: `Unsupported provider: ${providerId}`,
					} satisfies UnsuccessfulCreateDidResponseBody);
			}

			eventTracker.emit('track', {
				category: OperationCategoryNameEnum.DID,
				name: OperationNameEnum.DID_CREATE,
				data: {
					did: did.did,
				} satisfies IDIDTrack,
				customer: response.locals.customer,
				user: response.locals.user,
			} satisfies ITrackOperation);

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
	 *     tags: [ Decentralized Identifiers (DIDs) ]
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
	 *               $ref: '#/components/schemas/DidUpdateResponse'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async updateDid(request: Request, response: Response) {
		// handle request params
		const { did, service, verificationMethod, authentication, publicKeyHexs } =
			request.body as UpdateDidRequestBody;
		// Get the didDocument from the request if it's placed there
		let updatedDocument: DIDDocument;
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);

		// If list of publicKeyHexs is placed - check that publicKeyHexs are owned by the customer
		if (publicKeyHexs) {
			const areOwned = await arePublicKeyHexsInWallet(publicKeyHexs, response.locals.customer);
			if (!areOwned.status) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: areOwned.error as string,
				} satisfies UnsuccessfulUpdateDidResponseBody);
			}
		}

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
				response.locals.customer,
				publicKeyHexs
			);

			// Track the operation
			eventTracker.emit('track', {
				category: OperationCategoryNameEnum.DID,
				name: OperationNameEnum.DID_UPDATE,
				data: {
					did: result.did,
				} satisfies IDIDTrack,
				customer: response.locals.customer,
				user: response.locals.user,
			} satisfies ITrackOperation);

			return response.status(StatusCodes.OK).json(result satisfies UpdateDidResponseBody);
		} catch (error) {
			const errorCode = (error as CheqdProviderError).errorCode;
			// Handle specific cases when DID is deactivated or verificationMethod is empty
			if (
				errorCode &&
				(errorCode === CheqdProviderErrorCodes.DeactivatedController ||
					errorCode === CheqdProviderErrorCodes.EmptyVerificationMethod)
			) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: `updateDID: error: ${(error as CheqdProviderError).message}`,
				} satisfies UnsuccessfulUpdateDidResponseBody);
			}

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
	 *     tags: [ Decentralized Identifiers (DIDs) ]
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
	@validate
	public async importDid(request: Request, response: Response) {
		try {
			// Get the params from body
			const { did, controllerKeyId, keys } = request.body as ImportDidRequestBody;
			// Resolve the didDocument from the ledger
			const { didDocument } = await new IdentityServiceStrategySetup().agent.resolveDid(did);
			// Check if the didDocument is valid
			if (!didDocument || !didDocument.verificationMethod || didDocument.verificationMethod.length === 0) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: `Invalid request: Invalid did document for ${did}`,
				});
			}
			const publicKeyHexs: string[] = [
				...new Set(
					didDocument.verificationMethod
						.map((vm) => extractPublicKeyHex(vm).publicKeyHex)
						.filter((pk) => pk) || []
				),
			];

			const keysToImport: RequireOnly<IKey, 'privateKeyHex' | 'type'>[] = [];
			if (keys && keys.length === publicKeyHexs.length) {
				// import keys
				keysToImport.push(
					...(await Promise.all(
						keys.map(async (key: KeyImport) => {
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

			// Track the operation
			eventTracker.emit('track', {
				category: OperationCategoryNameEnum.DID,
				name: OperationNameEnum.DID_IMPORT,
				data: {
					did: identifier.did,
				} satisfies IDIDTrack,
				customer: response.locals.customer,
				user: response.locals.user,
			} satisfies ITrackOperation);

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
	 *     tags: [ Decentralized Identifiers (DIDs) ]
	 *     summary: Deactivate a DID Document.
	 *     description: This endpoint deactivates a DID Document by taking the DID identifier as input. Must be called and signed by the DID owner.
	 *     parameters:
	 *       - in: path
	 *         name: did
	 *         description: DID identifier to deactivate.
	 *         schema:
	 *           type: string
	 *         required: true
	 *     requestBody:
	 *       content:
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             $ref: '#/components/schemas/DidDeactivateRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/DidDeactivateRequest'
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
	@validate
	public async deactivateDid(request: Request, response: Response) {
		// Extract did from request params
		const { did } = request.params as DeactivateDIDRequestParams;
		const { publicKeyHexs } = request.body as DeactivateDIDRequestBody;

		// If list of publicKeyHexs is placed - check that publicKeyHexs are owned by the customer
		if (publicKeyHexs) {
			const areOwned = await arePublicKeyHexsInWallet(publicKeyHexs, response.locals.customer);
			if (!areOwned.status) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: areOwned.error as string,
				} satisfies UnsuccessfulDeactivateDidResponseBody);
			}
		}

		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);

		try {
			// Deactivate DID
			await identityServiceStrategySetup.agent.deactivateDid(did, response.locals.customer, publicKeyHexs);
			// Send the deactivated DID as result
			const result = await identityServiceStrategySetup.agent.resolveDid(request.params.did);

			// Track the operation
			eventTracker.emit('track', {
				category: OperationCategoryNameEnum.DID,
				name: OperationNameEnum.DID_DEACTIVATE,
				data: {
					did,
				} satisfies IDIDTrack,
				customer: response.locals.customer,
				user: response.locals.user,
			} satisfies ITrackOperation);

			return response.status(StatusCodes.OK).json(result satisfies DeactivateDidResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies UnsuccessfulDeactivateDidResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /did/list:
	 *   get:
	 *     tags: [ Decentralized Identifiers (DIDs) ]
	 *     summary: Fetch DIDs associated with an account.
	 *     description: This endpoint returns the list of DIDs controlled by the account.
	 *     parameters:
	 *       - in: query
	 *         name: network
	 *         description: Filter DID by the network published.
	 *         schema:
	 *           type: string
	 *           enum:
	 *             - mainnet
	 *             - testnet
	 *         required: false
	 *       - in: query
	 *         name: providerId
	 *         description: Filter DID by the provider.
	 *         schema:
	 *           type: string
	 *         required: false
	 *       - in: query
	 *         name: createdAt
	 *         description: Filter resource by created date
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
	 *               $ref: '#/components/schemas/ListDidResult'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	public async getDids(request: Request, response: Response) {
		// Extract did from params
		const { did, network, page, limit, providerId } = request.query as GetDIDRequestParams;
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = response.locals.customer
			? new IdentityServiceStrategySetup(response.locals.customer.customerId)
			: new IdentityServiceStrategySetup();

		try {
			if (providerId) {
				const provider = await ProviderService.instance.getProvider(providerId, { deprecated: false });
				if (!provider) {
					throw new Error(`Provider ${providerId} not found or deprecated`);
				}
			}

			let didDocument: ListDidsResponseBody | QueryDidResponseBody;
			switch (providerId) {
				case 'dock':
					didDocument = await new DockIdentityService().listDids(
						{ network, page, limit },
						response.locals.customer
					);
					break;
				case 'studio':
				default:
					didDocument = did
						? await identityServiceStrategySetup.agent.resolveDid(did)
						: await identityServiceStrategySetup.agent.listDids(
								{ network, page, limit },
								response.locals.customer
							);
			}
			return response
				.status(StatusCodes.OK)
				.json(didDocument satisfies ListDidsResponseBody | QueryDidResponseBody);
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
	 *     tags: [ Decentralized Identifiers (DIDs) ]
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
		// Extract did from params
		const { did } = request.params as ResolveDIDRequestParams;
		try {
			let res: globalThis.Response;
			if (did) {
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
