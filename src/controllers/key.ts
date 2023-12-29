import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { IdentityServiceStrategySetup } from '../services/identity/index.js';
import { decryptPrivateKey } from '../helpers/helpers.js';
import { toString } from 'uint8arrays';
import type { CreateKeyResponseBody, ImportKeyResponseBody, QueryKeyResponseBody, UnsuccessfulCreateKeyResponseBody, UnsuccessfulImportKeyResponseBody, UnsuccessfulQueryKeyResponseBody } from '../types/key.js';
import { check } from './validator/index.js';

// ToDo: Make the format of /key/create and /key/read the same
// ToDo: Add valdiation for /key/import
export class KeyController {
	public static keyImportValidator = [
		check('privateKeyHex')
			.exists()
			.withMessage('Private key was not provided')
			.isHexadecimal()
			.withMessage('Private key should be a hexadecimal string')
			.bail(),
		check('encrypted').optional().isBoolean().withMessage('encrypted should be a boolean').bail(),
		check('ivHex').optional().isHexadecimal().withMessage('ivHex should be a hexadecimal string').bail(),
		check('salt').optional().isHexadecimal().withMessage('salt should be a hexadecimal string').bail(),
		check('type').optional().isString().withMessage('type should be a string').bail(),
		check('alias').optional().isString().withMessage('alias should be a string').bail(),
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
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);
		try {
			const key = await identityServiceStrategySetup.agent.createKey('Ed25519', response.locals.customer);
			return response.status(StatusCodes.OK).json(
				key satisfies CreateKeyResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `${error}`,
			} satisfies UnsuccessfulCreateKeyResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /key/import:
	 *   post:
	 *     tags: [ Key ]
	 *     summary: Import an identity key pair.
	 *     description: This endpoint imports an identity key pair associated with the user's account for custodian-mode clients.
	 *     requestBody:
	 *       content:
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             $ref: '#/components/schemas/KeyImportRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/KeyImportRequest'
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
	public async importKey(request: Request, response: Response) {
		
		// Get parameters requeired for key importing
		const { type, encrypted, ivHex, salt, alias } = request.body;
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);
		let { privateKeyHex } = request.body;

		try {
			if (encrypted) {
				if (ivHex && salt) {
					privateKeyHex = toString(await decryptPrivateKey(privateKeyHex, ivHex, salt), 'hex');
				} else {
					return response.status(StatusCodes.BAD_REQUEST).json({
						error: `Invalid request: Property ivHex, salt is required when encrypted is set to true`,
					} satisfies UnsuccessfulImportKeyResponseBody);
				}
			}
			const key = await identityServiceStrategySetup.agent.importKey(
				type || 'Ed25519',
				privateKeyHex,
				response.locals.customer,
				alias
			);
			return response.status(StatusCodes.OK).json(
				key satisfies ImportKeyResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies UnsuccessfulImportKeyResponseBody);
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
		// Get strategy e.g. postgres or local
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);
		try {
			const key = await identityServiceStrategySetup.agent.getKey(request.params.kid, response.locals.customer);
			if (key) {
				return response.status(StatusCodes.OK).json(key satisfies QueryKeyResponseBody);
			}
			return response.status(StatusCodes.NOT_FOUND).json({
				error: `Key with kid: ${request.params.kid} not found`,
			} satisfies UnsuccessfulQueryKeyResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `${error}`,
			} satisfies UnsuccessfulQueryKeyResponseBody);
		}
	}
}
