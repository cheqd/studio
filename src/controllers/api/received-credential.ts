import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { check, param, query } from '../validator/index.js';
import { validate } from '../validator/decorator.js';
import { ReceivedCredentials } from '../../services/api/received-credentials.js';

export class ReceivedCredentialController {
	public static listOffersValidator = [
		query('holderDid').optional().isDID().withMessage('Invalid holderDid format').bail(),
		query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer').toInt().bail(),
		query('limit')
			.optional()
			.isInt({ min: 1, max: 100 })
			.withMessage('limit must be between 1 and 100')
			.toInt()
			.bail(),
	];

	public static getOfferValidator = [
		param('credentialId')
			.exists()
			.withMessage('credentialId is required')
			.bail()
			.isUUID()
			.withMessage('Invalid credentialId format')
			.bail(),
		query('holderDid')
			.exists()
			.withMessage('holderDid is required')
			.bail()
			.isDID()
			.withMessage('Invalid holderDid format')
			.bail(),
	];

	public static acceptOfferValidator = [
		param('credentialId')
			.exists()
			.withMessage('credentialId is required')
			.bail()
			.isUUID()
			.withMessage('Invalid credentialId format')
			.bail(),
		check('holderDid')
			.exists()
			.withMessage('holderDid is required')
			.bail()
			.isDID()
			.withMessage('Invalid holderDid format')
			.bail(),
		check('createPresentation')
			.optional()
			.isBoolean()
			.withMessage('createPresentation must be a boolean')
			.toBoolean()
			.bail(),
		check('presentationDomain').optional().isString().withMessage('presentationDomain must be a string').bail(),
	];

	public static rejectOfferValidator = [
		param('credentialId')
			.exists()
			.withMessage('credentialId is required')
			.bail()
			.isUUID()
			.withMessage('Invalid credentialId format')
			.bail(),
		check('holderDid')
			.exists()
			.withMessage('holderDid is required')
			.bail()
			.isDID()
			.withMessage('Invalid holderDid format')
			.bail(),
	];
	public static importValidator = [
		check('credential')
			.exists()
			.withMessage('credential is required')
			.bail()
			.custom((value) => {
				// Check if it's a valid object or string
				if (typeof value === 'string') {
					return true; // JWT string
				}
				if (typeof value === 'object' && value !== null) {
					return true; // JSON object
				}
				return false;
			})
			.withMessage('credential must be a valid JSON object or JWT string')
			.bail(),
		check('holderDid')
			.exists()
			.withMessage('holderDid is required')
			.bail()
			.isDID()
			.withMessage('Invalid holderDid format')
			.bail(),
	];
	public static listReceivedValidator = [
		query('holderDid').optional().isDID().withMessage('Invalid holderDid format').bail(),
	];
	public static getReceivedValidator = [
		check('credentialHash')
			.exists()
			.withMessage('credentialHash is required')
			.bail()
			.isString()
			.withMessage('credentialHash must be a string')
			.bail(),
	];

	/**
	 * @openapi
	 *
	 * /credentials/offers:
	 *   get:
	 *     tags: [ Credential Offers ]
	 *     summary: List pending credential offers
	 *     description: Retrieves a list of pending credential offers. If holderDid is not provided, returns all offers for all DIDs owned by the customer.
	 *     parameters:
	 *       - in: query
	 *         name: holderDid
	 *         required: false
	 *         schema:
	 *           type: string
	 *         description: Optional DID of the credential holder. If not provided, returns offers for all customer DIDs.
	 *       - in: query
	 *         name: page
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           default: 1
	 *         description: Page number for pagination
	 *       - in: query
	 *         name: limit
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           maximum: 100
	 *           default: 10
	 *         description: Number of results per page
	 *     responses:
	 *       200:
	 *         description: List of pending credential offers
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 total:
	 *                   type: integer
	 *                 offers:
	 *                   type: array
	 *                   items:
	 *                     $ref: '#/components/schemas/IssuedCredentialResponse'
	 *                 page:
	 *                   type: integer
	 *                 limit:
	 *                   type: integer
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async listOffers(request: Request, response: Response) {
		try {
			const { holderDid, page, limit } = request.query;
			const customer = response.locals.customer;

			const result = await ReceivedCredentials.instance.listPendingOffers(
				{
					holderDid: holderDid as string | undefined,
					page: page ? Number(page) : undefined,
					limit: limit ? Number(limit) : undefined,
				},
				customer
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
	 * /credentials/offers/{credentialId}:
	 *   get:
	 *     tags: [ Credential Offers ]
	 *     summary: Get credential offer details
	 *     description: Retrieves detailed information about a specific credential offer
	 *     parameters:
	 *       - in: path
	 *         name: credentialId
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *         description: ID of the credential offer
	 *       - in: query
	 *         name: holderDid
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: DID of the credential holder
	 *     responses:
	 *       200:
	 *         description: Credential offer details
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/IssuedCredentialResponse'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       404:
	 *         description: Credential offer not found
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async getOfferDetails(request: Request, response: Response) {
		try {
			const { credentialId } = request.params;
			const { holderDid } = request.query;
			const customer = response.locals.customer;

			const offer = await ReceivedCredentials.instance.getOfferDetails(
				credentialId,
				holderDid as string,
				customer
			);

			return response.status(StatusCodes.OK).json(offer);
		} catch (error) {
			const errorMessage = `${error}`;
			if (errorMessage.includes('not found') || errorMessage.includes('expired')) {
				return response.status(StatusCodes.NOT_FOUND).json({
					error: errorMessage,
				});
			}
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: errorMessage,
			});
		}
	}

	/**
	 * @openapi
	 *
	 * /credentials/offers/{credentialId}/accept:
	 *   post:
	 *     tags: [ Credential Offers ]
	 *     summary: Accept a credential offer
	 *     description: Accepts a pending credential offer. The credential is verified and status is updated to issued.
	 *     parameters:
	 *       - in: path
	 *         name: credentialId
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *         description: ID of the credential offer to accept
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - holderDid
	 *             properties:
	 *               holderDid:
	 *                 type: string
	 *                 description: DID of the credential holder
	 *               createPresentation:
	 *                 type: boolean
	 *                 default: false
	 *                 description: Whether to create a verifiable presentation
	 *               presentationDomain:
	 *                 type: string
	 *                 description: Optional domain for the presentation
	 *     responses:
	 *       200:
	 *         description: Credential offer accepted successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 success:
	 *                   type: boolean
	 *                 credential:
	 *                   type: object
	 *                 presentation:
	 *                   type: string
	 *                   description: JWT presentation (if createPresentation was true)
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       404:
	 *         description: Credential offer not found
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async acceptOffer(request: Request, response: Response) {
		try {
			const { credentialId } = request.params;
			const { holderDid, createPresentation, presentationDomain } = request.body;
			const customer = response.locals.customer;

			const result = await ReceivedCredentials.instance.acceptOffer(credentialId, holderDid, customer, {
				createPresentation,
				presentationDomain,
			});

			return response.status(StatusCodes.OK).json(result);
		} catch (error) {
			const errorMessage = `${error}`;
			if (errorMessage.includes('not found') || errorMessage.includes('expired')) {
				return response.status(StatusCodes.NOT_FOUND).json({
					error: errorMessage,
				});
			}
			if (errorMessage.includes('Invalid credential') || errorMessage.includes('does not match')) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: errorMessage,
				});
			}
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: errorMessage,
			});
		}
	}

	/**
	 * @openapi
	 *
	 * /credentials/offers/{credentialId}/reject:
	 *   post:
	 *     tags: [ Credential Offers ]
	 *     summary: Reject a credential offer
	 *     description: Rejects a pending credential offer. The credential is deleted and status is updated to rejected.
	 *     parameters:
	 *       - in: path
	 *         name: credentialId
	 *         required: true
	 *         schema:
	 *           type: string
	 *           format: uuid
	 *         description: ID of the credential offer to reject
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - holderDid
	 *             properties:
	 *               holderDid:
	 *                 type: string
	 *                 description: DID of the credential holder
	 *     responses:
	 *       200:
	 *         description: Credential offer rejected successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 success:
	 *                   type: boolean
	 *                 message:
	 *                   type: string
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       404:
	 *         description: Credential offer not found
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async rejectOffer(request: Request, response: Response) {
		try {
			const { credentialId } = request.params;
			const { holderDid } = request.body;
			const customer = response.locals.customer;

			const result = await ReceivedCredentials.instance.rejectOffer(credentialId, holderDid, customer);

			return response.status(StatusCodes.OK).json(result);
		} catch (error) {
			const errorMessage = `${error}`;
			if (errorMessage.includes('not found') || errorMessage.includes('expired')) {
				return response.status(StatusCodes.NOT_FOUND).json({
					error: errorMessage,
				});
			}
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: errorMessage,
			});
		}
	}

	/**
	 * @openapi
	 *
	 * /credentials/import:
	 *   post:
	 *     tags: [ Verifiable Credentials ]
	 *     summary: Import an externally issued credential
	 *     description: Imports a credential issued by a third party (not in Studio) and stores it in the holder's dataStore
	 *     requestBody:
	 *       required: true
	 *       content:
	 *         application/json:
	 *           schema:
	 *             type: object
	 *             required:
	 *               - credential
	 *               - holderDid
	 *             properties:
	 *               credential:
	 *                 oneOf:
	 *                   - type: object
	 *                     description: Verifiable credential as JSON object
	 *                   - type: string
	 *                     description: Verifiable credential as JWT string
	 *               holderDid:
	 *                 type: string
	 *                 description: DID of the credential holder
	 *     responses:
	 *       200:
	 *         description: Credential imported successfully
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 success:
	 *                   type: boolean
	 *                 credentialHash:
	 *                   type: string
	 *                   description: Hash of the stored credential
	 *                 credential:
	 *                   type: object
	 *                   description: The imported credential
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async importCredential(request: Request, response: Response) {
		try {
			const { credential, holderDid } = request.body;
			const customer = response.locals.customer;

			const result = await ReceivedCredentials.instance.importCredential(credential, customer, holderDid);

			return response.status(StatusCodes.OK).json(result);
		} catch (error) {
			const errorMessage = `${error}`;
			if (
				errorMessage.includes('Invalid credential') ||
				errorMessage.includes('does not match') ||
				errorMessage.includes('does not exist') ||
				errorMessage.includes('does not have a valid')
			) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: errorMessage,
				});
			}
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: errorMessage,
			});
		}
	}

	/**
	 * @openapi
	 *
	 * /credentials/received:
	 *   get:
	 *     tags: [ Verifiable Credentials ]
	 *     summary: List received credentials
	 *     description: Retrieves all credentials stored in the holder's dataStore (accepted offers + imported credentials)
	 *     parameters:
	 *       - in: query
	 *         name: holderDid
	 *         schema:
	 *           type: string
	 *         description: Optional DID to filter credentials by subject
	 *     responses:
	 *       200:
	 *         description: List of received credentials
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: array
	 *               items:
	 *                 type: object
	 *                 description: Verifiable Credential
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async listReceivedCredentials(request: Request, response: Response) {
		try {
			const { holderDid } = request.query;
			const customer = response.locals.customer;

			const credentials = await ReceivedCredentials.instance.listReceivedCredentials(
				customer,
				holderDid as string | undefined
			);

			return response.status(StatusCodes.OK).json(credentials);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `${error}`,
			});
		}
	}

	/**
	 * @openapi
	 *
	 * /credentials/received/{credentialHash}:
	 *   get:
	 *     tags: [ Verifiable Credentials ]
	 *     summary: Get a specific received credential
	 *     description: Retrieves a specific credential from the holder's dataStore by its hash
	 *     parameters:
	 *       - in: path
	 *         name: credentialHash
	 *         required: true
	 *         schema:
	 *           type: string
	 *         description: Hash of the credential
	 *     responses:
	 *       200:
	 *         description: Received credential
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               description: Verifiable Credential
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       404:
	 *         description: Credential not found
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	public async getReceivedCredential(request: Request, response: Response) {
		try {
			const { credentialHash } = request.params;
			const customer = response.locals.customer;

			const credential = await ReceivedCredentials.instance.getReceivedCredential(credentialHash, customer);

			return response.status(StatusCodes.OK).json(credential);
		} catch (error) {
			const errorMessage = `${error}`;
			if (errorMessage.includes('not found')) {
				return response.status(StatusCodes.NOT_FOUND).json({
					error: errorMessage,
				});
			}
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: errorMessage,
			});
		}
	}
}
