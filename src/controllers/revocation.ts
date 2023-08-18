import type { Request, Response } from 'express';
import { check, validationResult } from 'express-validator';
import { fromString } from 'uint8arrays';
import { StatusCodes } from 'http-status-codes';
import { IdentityStrategySetup } from '../services/identity/index.js';
import { DefaultDidUrlPattern, DefaultStatusAction, DefaultStatusActions, MinimalPaymentCondition } from '../types/shared.js';
import { BulkRevocationResult, BulkSuspensionResult, BulkUnsuspensionResult, DefaultStatusList2021Encodings, DefaultStatusList2021StatusPurposeTypes } from '@cheqd/did-provider-cheqd';
import type { AlternativeUri } from '@cheqd/ts-proto/cheqd/resource/v2/resource.js';

export class RevocationController {
	static createUnencryptedValidator = [
		check('did')
			.exists()
			.withMessage('did: required')
			.bail()
			.isString()
			.withMessage('did: should be a string')
			.bail()
			.matches(DefaultDidUrlPattern)
			.withMessage('did: invalid format, should be did:cheqd:<namespace>:<method_specific_identifier>')
			.bail(),
		check('statusPurpose')
			.exists()
			.withMessage('statusPurpose: required')
			.bail()
			.isString()
			.withMessage('statusPurpose: should be a string')
			.bail()
			.isIn(Object.keys(DefaultStatusList2021StatusPurposeTypes))
			.withMessage(`statusPurpose: invalid statusPurpose, should be one of ${Object.keys(DefaultStatusList2021StatusPurposeTypes).join(', ')}`)
			.bail(),
		check('statusListName')
			.exists()
			.withMessage('statusListName: required')
			.bail()
			.isString()
			.withMessage('statusListName: should be a string')
			.bail(),
		check('statusListVersion')
			.optional()
			.isString()
			.withMessage('statusListVersion: should be a string')
			.bail(),
		check('alsoKnownAs')
			.optional()
			.isArray()
			.withMessage('alsoKnownAs: should be an array')
			.bail()
			.notEmpty()
			.withMessage('alsoKnownAs: should be a non-empty array')
			.bail()
			.custom((value) => {
				return value.every((item: AlternativeUri) => item.description && typeof item.description === 'string' && item.uri && typeof item.uri === 'string');
			})
			.withMessage('alsoKnownAs: should be an array of objects with `description` and `uri` properties of type string, non-empty')
			.bail(),
		check('length')
			.optional()
			.isNumeric()
			.withMessage('length: should be a number')
			.bail()
			.custom((value) => !isNaN(parseInt(value.toString())) && isFinite(parseInt(value.toString())) && Number.isInteger(value))
			.withMessage('length: should be an integer')
			.bail()
			.custom((value) => value > 0)
			.withMessage('length: should be a positive integer')
			.bail(),
		check('encoding')
			.optional()
			.isIn(Object.keys(DefaultStatusList2021Encodings))
			.withMessage(`encoding: invalid encoding, should be one of ${Object.keys(DefaultStatusList2021Encodings).join(', ')}`)
			.bail(),
		check('encodedList')
			.optional()
			.isString()
			.withMessage('encodedList: should be a string')
			.bail(),
	];

	static createEncryptedValidator = [
		...RevocationController.createUnencryptedValidator,
		// define validation chain - case: content-type is application/json
		check('paymentConditions')
			.if((_value, { req }) => req?.headers?.['content-type'] === 'application/json')
			.exists()
			.withMessage('paymentConditions: required')
			.bail()
			.isArray()
			.withMessage('paymentConditions: should be an array')
			.bail()
			.custom((value) => {
				return value.length && value.length > 0;
			})
			.withMessage('paymentConditions: should be a non-empty array')
			.bail()
			.custom((value) => {
				return value.every((item: MinimalPaymentCondition) =>
					item.feePaymentAddress &&
					typeof item.feePaymentAddress === 'string'
				);
			})
			.withMessage('paymentConditions: should be an array of objects with feePaymentAddress property of type string, non-empty')
			.bail()
			.custom((value) => {
				return value.every((item: MinimalPaymentCondition) =>
					item.feePaymentAmount &&
					typeof item.feePaymentAmount === 'number' &&
					isFinite(parseFloat(item.feePaymentAmount.toString())) &&
					/^[0-9]+(?:\.[0-9]{1,2})?$/.test(item.feePaymentAmount.toString()) // check if number is float with 2 decimal places max
				);
			})
			.withMessage('paymentConditions: should be an array of objects with feePaymentAmount property of type number, non-empty, integer or float with 2 decimal places max')
			.bail()
			.custom((value) => {
				return value.every((item: MinimalPaymentCondition) =>
					item.feePaymentWindow &&
					typeof item.feePaymentWindow === 'number' &&
					!isNaN(parseInt(item.feePaymentWindow.toString())) &&
					isFinite(parseInt(item.feePaymentWindow.toString())) &&
					parseInt(item.feePaymentWindow.toString()) > 0
				);
			})
			.withMessage('paymentConditions: should be an array of objects with feePaymentWindow property of type number, non-empty, integer, strictly positive')
			.bail(),
		// define validation chain - case: content-type is application/x-www-form-urlencoded
		check('feePaymentAddress')
			.if((_value, { req }) => req?.headers?.['content-type'] === 'application/x-www-form-urlencoded')
			.exists()
			.withMessage('feePaymentAddress: required')
			.bail()
			.isString()
			.withMessage('feePaymentAddress: should be a string')
			.bail()
			.notEmpty()
			.withMessage('feePaymentAddress: should be a non-empty string')
			.bail()
			.matches(/^cheqd1/)
			.withMessage('feePaymentAddress: should be a valid cheqd address')
			.bail(),
		check('feePaymentAmount')
			.if((_value, { req }) => req?.headers?.['content-type'] === 'application/x-www-form-urlencoded')
			.exists()
			.withMessage('feePaymentAmount: required')
			.bail()
			.isNumeric()
			.withMessage('feePaymentAmount: should be a number')
			.bail()
			.custom((value) => value > 0)
			.withMessage('feePaymentAmount: should be a positive number')
			.bail()
			.matches(/^[0-9]+(?:\.[0-9]{1,2})?$/)
			.withMessage('feePaymentAmount: should be a number, non-empty, integer or float with 2 decimal places max')
			.bail(),
		check('feePaymentWindow')
			.if((_value, { req }) => req?.headers?.['content-type'] === 'application/x-www-form-urlencoded')
			.exists()
			.withMessage('feePaymentWindow: required')
			.bail()
			.isNumeric()
			.withMessage('feePaymentWindow: should be a number')
			.bail()
			.custom((value) => value > 0)
			.withMessage('feePaymentWindow: should be a positive number')
			.bail()
			.custom((value) => Number.isInteger(value))
			.withMessage('feePaymentWindow: should be an integer')
			.bail(),
	];

	static updateUnencryptedValidator = [
		check('did')
			.exists()
			.withMessage('did: required')
			.bail()
			.isString()
			.withMessage('did: should be a string')
			.bail()
			.matches(DefaultDidUrlPattern)
			.withMessage('did: invalid format, should be did:cheqd:<namespace>:<method_specific_identifier>')
			.bail(),
		check('statusAction')
			.exists()
			.withMessage('statusAction: required')
			.bail()
			.isIn(Object.keys(DefaultStatusActions))
			.withMessage(`statusAction: invalid statusAction, should be one of ${Object.keys(DefaultStatusActions).join(', ')}`)
			.bail(),
		check('indices')
			.exists()
			.withMessage('indices: required')
			.bail()
			.custom((value) => {
				return value &&
				(
					(
						Array.isArray(value) &&
						value.every((item) => typeof item === 'number' && item >= 0)
					) || (
						typeof value === 'number' &&
						value >= 0
					)
				);
			})
			.withMessage('indices: should be a positive integer or an array of positive integers')
			.bail(),
		check('statusListName')
			.exists()
			.withMessage('statusListName: required')
			.bail()
			.isString()
			.withMessage('statusListName: should be a string')
			.bail(),
		check('statusListVerion')
			.optional()
			.isString()
			.withMessage('statusListVersion: should be a string')
			.bail(),
	];

	static updateEncryptedValidator = [
		...RevocationController.updateUnencryptedValidator,
		check('symmetricKey')
			.exists()
			.withMessage('symmetricKey: required')
			.bail()
			.isString()
			.withMessage('symmetricKey: should be a string')
			.bail()
			.notEmpty()
			.withMessage('symmetricKey: should be a non-empty string')
			.bail(),
		// define validation chain - case: content-type is application/json, paymentConditions is optionally defined
		check('paymentConditions')
			.if((_value, { req }) => req?.headers?.['content-type'] === 'application/json')
			.optional()
			.isArray()
			.withMessage('paymentConditions: should be an array')
			.bail()
			.custom((value) => {
				return value.length && value.length > 0;
			})
			.withMessage('paymentConditions: should be a non-empty array')
			.bail()
			.custom((value) => {
				return value.every((item: MinimalPaymentCondition) =>
					item.feePaymentAddress &&
					typeof item.feePaymentAddress === 'string'
				);
			})
			.withMessage('paymentConditions: should be an array of objects with feePaymentAddress property of type string, non-empty')
			.bail()
			.custom((value) => {
				return value.every((item: MinimalPaymentCondition) =>
					item.feePaymentAmount &&
					typeof item.feePaymentAmount === 'number' &&
					isFinite(parseFloat(item.feePaymentAmount.toString())) &&
					/^[0-9]+(?:\.[0-9]{1,2})?$/.test(item.feePaymentAmount.toString()) // check if number is float with 2 decimal places max
				);
			})
			.withMessage('paymentConditions: should be an array of objects with feePaymentAmount property of type number, non-empty, integer or float with 2 decimal places max')
			.bail()
			.custom((value) => {
				return value.every((item: MinimalPaymentCondition) =>
					item.feePaymentWindow &&
					typeof item.feePaymentWindow === 'number' &&
					!isNaN(parseInt(item.feePaymentWindow.toString())) &&
					isFinite(parseInt(item.feePaymentWindow.toString())) &&
					parseInt(item.feePaymentWindow.toString()) > 0
				);
			})
			.withMessage('paymentConditions: should be an array of objects with feePaymentWindow property of type number, non-empty, integer, strictly positive')
			.bail(),
		// define validation chain - case: content-type is application/x-www-form-urlencoded
		check('feePaymentAddress')
			// skip, if content-type is not application/x-www-form-urlencoded
			.if((_value, { req }) => req?.headers?.['content-type'] === 'application/x-www-form-urlencoded')
			// validate, if any of is defined
			.if((value, { req }) => value || req?.body?.feePaymentAmount || req?.body?.feePaymentWindow)
			.exists()
			.withMessage('feePaymentAddress: required')
			.bail()
			.isString()
			.withMessage('feePaymentAddress: should be a string')
			.bail()
			.notEmpty()
			.withMessage('feePaymentAddress: should be a non-empty string')
			.bail()
			.matches(/^cheqd1/)
			.withMessage('feePaymentAddress: should be a valid cheqd address')
			.bail(),
		check('feePaymentAmount')
			// skip, if content-type is not application/x-www-form-urlencoded
			.if((_value, { req }) => req?.headers?.['content-type'] === 'application/x-www-form-urlencoded')
			// validate, if any of is defined
			.if((value, { req }) => value || req?.body?.feePaymentAddress || req?.body?.feePaymentWindow)
			.exists()
			.withMessage('feePaymentAmount: required')
			.bail()
			.isNumeric()
			.withMessage('feePaymentAmount: should be a number')
			.bail()
			.custom((value) => value > 0)
			.withMessage('feePaymentAmount: should be a positive number')
			.bail()
			.matches(/^[0-9]+(?:\.[0-9]{1,2})?$/)
			.withMessage('feePaymentAmount: should be a number, non-empty, integer or float with 2 decimal places max')
			.bail(),
		check('feePaymentWindow')
			// skip, if content-type is not application/x-www-form-urlencoded
			.if((_value, { req }) => req?.headers?.['content-type'] === 'application/x-www-form-urlencoded')
			// validate, if any of is defined
			.if((value, { req }) => value || req?.body?.feePaymentAddress || req?.body?.feePaymentAmount)
			.exists()
			.withMessage('feePaymentWindow: required')
			.bail()
			.isNumeric()
			.if((value) => typeof value !== 'undefined' && value !== null)
			.withMessage('feePaymentWindow: should be a number')
			.bail()
			.custom((value) => value > 0)
			.withMessage('feePaymentWindow: should be a positive number')
			.bail()
			.custom((value) => Number.isInteger(value))
			.withMessage('feePaymentWindow: should be an integer')
	];

	static checkValidator = [
		check('index').exists().withMessage('Index is required').isNumeric().withMessage('Index should be a number'),
		check('statusListName')
			.exists()
			.withMessage('StatusListName is required')
			.isString()
			.withMessage('Invalid statusListName'),
	];

	/**
	 * @openapi
	 *
	 * /credential-status/create/unencrypted:
	 *   post:
	 *     tags: [ Credential Status ]
	 *     summary: Create an unencrypted StatusList2021 credential status list.
	 *     description: This endpoint creates an unencrypted StatusList2021 credential status list. The StatusList is published as a DID-Linked Resource on ledger. As input, it can can take input parameters needed to create the status list via a form, or a pre-assembled status list in JSON format. Status lists can be created as either encrypted or unencrypted; and with purpose as either revocation or suspension.
	 *     parameters:
	 *       - in: query
	 *         name: statusPurpose
	 *         description: The purpose of the status list. Can be either revocation or suspension. Once this is set, it cannot be changed. A new status list must be created to change the purpose.
	 *         required: true
	 *         schema:
	 *           type: string
	 *           enum:
	 *             - revocation
	 *             - suspension
	 *     requestBody:
	 *       content:
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             $ref: '#/components/schemas/CredentialStatusCreateRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/CredentialStatusCreateRequest'
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/CredentialStatusResult'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	async createUnencryptedStatusList(request: Request, response: Response) {
		const result = validationResult(request);
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array().pop()?.msg });
		}

		const { did, encodedList, statusListName, alsoKnownAs, statusListVersion, length, encoding } =
			request.body;
		const { statusPurpose } = request.query as { statusPurpose: keyof typeof DefaultStatusList2021StatusPurposeTypes };

		const data = encodedList ? fromString(encodedList, encoding) : undefined;

		try {
			if (data) {
				const result = await new IdentityStrategySetup(response.locals.customerId).agent.broadcastStatusList2021(
					did,
					{ data, name: statusListName, alsoKnownAs, version: statusListVersion },
					{ encoding, statusPurpose },
					response.locals.customerId
				);
				return response.status(StatusCodes.OK).json(result);
			}
			const result = await new IdentityStrategySetup(response.locals.customerId).agent.createUnencryptedStatusList2021(
				did,
				{ name: statusListName, alsoKnownAs, version: statusListVersion },
				{ length, encoding, statusPurpose },
				response.locals.customerId
			);

			if (result.error) {
				return response.status(StatusCodes.BAD_REQUEST).json(result);
			}

			return response.status(StatusCodes.OK).json(result);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${error}`,
			});
		}
	}

	/**
	 * @openapi
	 *
	 * /credential-status/create/encrypted:
	 *   post:
	 *     tags: [ Credential Status ]
	 *     summary: Create an encrypted StatusList2021 credential status list.
	 *     description: This endpoint creates an encrypted StatusList2021 credential status list. The StatusList is published as a DID-Linked Resource on ledger. As input, it can can take input parameters needed to create the status list via a form, or a pre-assembled status list in JSON format. Status lists can be created as either encrypted or unencrypted; and with purpose as either revocation or suspension.
	 *     parameters:
	 *       - in: query
	 *         name: statusPurpose
	 *         description: The purpose of the status list. Can be either revocation or suspension. Once this is set, it cannot be changed. A new status list must be created to change the purpose.
	 *         required: true
	 *         schema:
	 *           type: string
	 *           enum:
	 *             - revocation
	 *             - suspension
	 *     requestBody:
	 *       content:
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             $ref: '#/components/schemas/CredentialStatusCreateRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/CredentialStatusCreateRequest'
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/CredentialStatusResult'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	async createEncryptedStatusList(request: Request, response: Response) {
		const result = validationResult(request);
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array().pop()?.msg });
		}

		const { did, statusListName, alsoKnownAs, statusListVersion, length, encoding, paymentConditions, feePaymentAddress, feePaymentAmount, feePaymentWindow } =
			request.body;
		const { statusPurpose } = request.query as { statusPurpose: keyof typeof DefaultStatusList2021StatusPurposeTypes };

		try {
			const result = await new IdentityStrategySetup(response.locals.customerId).agent.createEncryptedStatusList2021(
				did,
				{ name: statusListName, alsoKnownAs, version: statusListVersion },
				{ length, encoding, statusPurpose, paymentConditions, feePaymentAddress, feePaymentAmount, feePaymentWindow },
				response.locals.customerId
			);

			if (result.error) {
				return response.status(StatusCodes.BAD_REQUEST).json(result);
			}

			return response.status(StatusCodes.OK).json(result);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${error}`,
			});
		}
	}

	/**
	 * @openapi
	 *
	 * /credential-status/update/unencrypted:
	 *   post:
	 *     tags: [ Credential Status ]
	 *     summary: Update an existing unencrypted StatusList2021 credential status list.
	 *     parameters:
	 *       - in: query
	 *         name: statusAction
	 *         description: The update action to be performed on the unencrypted status list, can be revoke, suspend or reinstate
	 *         required: true
	 *         schema:
	 *           type: string
	 *           enum:
	 *             - revoke
	 *             - suspend
	 *             - reinstate
	 *     requestBody:
	 *       content:
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             $ref: '#/components/schemas/CredentialStatusUpdateRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/CredentialStatusUpdateRequest'
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/CredentialStatusResult'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	async updateUnencryptedStatusList(request: Request, response: Response) {
		const result = validationResult(request);
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array().pop()?.msg });
		}

		const { did, statusListName, statusListVersion, indices } = request.body;
		const { statusAction } = request.query as { statusAction: DefaultStatusAction };

		try {
			const result = await new IdentityStrategySetup(response.locals.customerId).agent.updateUnencryptedStatusList2021(
				did,
				{
					indices: typeof indices === 'number' ? [indices] : indices,
					statusListName,
					statusListVersion,
					statusAction,
				},
				response.locals.customerId
			);
			if (result.error) {
				return response.status(StatusCodes.BAD_REQUEST).json(result);
			}
			return response.status(StatusCodes.OK).json(result);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${error}`,
			});
		}
	}

	/**
	 * @openapi
	 *
	 * /credential-status/update/encrypted:
	 *   post:
	 *     tags: [ Credential Status ]
	 *     summary: Update an existing encrypted StatusList2021 credential status list.
	 *     parameters:
	 *       - in: query
	 *         name: statusAction
	 *         description: The update action to be performed on the encrypted status list, can be revoke, suspend or reinstate
	 *         required: true
	 *         schema:
	 *           type: string
	 *           enum:
	 *             - revoke
	 *             - suspend
	 *             - reinstate
	 *     requestBody:
	 *       content:
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             $ref: '#/components/schemas/CredentialStatusUpdateRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/CredentialStatusUpdateRequest'
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/CredentialStatusResult'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	async updateEncryptedStatusList(request: Request, response: Response) {
		const result = validationResult(request);

		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array().pop()?.msg });
		}

		const { did, statusListName, statusListVersion, indices, symmetricKey, paymentConditions, feePaymentAddress, feePaymentAmount, feePaymentWindow } = request.body;
		const { statusAction } = request.query as { statusAction: DefaultStatusAction };

		try {
			const result = await new IdentityStrategySetup(response.locals.customerId).agent.updateEncryptedStatusList2021(
				did,
				{
					indices: typeof indices === 'number' ? [indices] : indices,
					statusListName,
					statusListVersion,
					statusAction,
					paymentConditions,
					symmetricKey,
					feePaymentAddress,
					feePaymentAmount,
					feePaymentWindow
				},
				response.locals.customerId
			) as (BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult) & { updated: boolean };

			if (result.error) return response.status(StatusCodes.BAD_REQUEST).json(result);

			result.updated = function (that) {
				return (that as BulkRevocationResult)?.revoked?.every((item) => item) || (that as BulkSuspensionResult)?.suspended?.every((item) => item) || (that as BulkUnsuspensionResult)?.unsuspended?.every((item) => item);
			}(result);

			return response.status(StatusCodes.OK).json(result);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${error}`,
			});
		}
	}

	/**
	 * @openapi
	 *
	 * /credential-status/check:
	 *   post:
	 *     tags: [ Credential Status ]
	 *     summary: Check a StatusList2021 index for a given Verifiable Credential.
	 *     description: This endpoint checks a StatusList2021 index for a given Verifiable Credential and reports whether it is revoked or suspended. It offers a standalone method for checking an index without passing the entire Verifiable Credential or Verifiable Presentation.
	 *     parameters:
	 *       - in: query
	 *         name: statusPurpose
	 *         description: The purpose of the status list. Can be either revocation or suspension.
	 *         required: true
	 *         schema:
	 *           type: string
	 *           enum:
	 *             - revocation
	 *             - suspension
	 *       - in: query
	 *         name: encrypted
	 *         description: Define whether the status list is encrypted. The default is `false`, which means the DID-Linked Resource can be fetched and parsed publicly. Encrypted status lists can only be fetched if the payment conditions are satisfied.
	 *         required: true
	 *         schema:
	 *           type: boolean
	 *           default: false
	 *     requestBody:
	 *       content:
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             $ref: '#/components/schemas/CredentialStatusCheckRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/CredentialStatusCheckRequest'
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: object
	 *               properties:
	 *                 revoked:
	 *                   type: boolean
	 *                 suspended:
	 *                   type: boolean
	 *                   example: false
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	async checkStatusList(request: Request, response: Response) {
		const result = validationResult(request);
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array()[0].msg });
		}

		const { did, statusListName, index } = request.body;
		const statusPurpose = request.query.statusPurpose as keyof typeof DefaultStatusList2021StatusPurposeTypes;

		try {
			const result = await new IdentityStrategySetup(response.locals.customerId).agent.checkStatusList2021(
				did,
				{ statusListIndex: index, statusListName, statusPurpose },
				response.locals.customerId
			);

			if (result.error) {
				return response.status(StatusCodes.BAD_REQUEST).json(result);
			}
			return response.status(StatusCodes.OK).json(result);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${error}`,
			});
		}
	}

	/**
	 * @openapi
	 *
	 * /credential-status/search:
	 *   get:
	 *     tags: [ Credential Status ]
	 *     summary: Fetch StatusList2021 DID-Linked Resource based on search criteria.
	 *     parameters:
	 *       - in: query
	 *         name: did
	 *         description: The DID of the issuer of the status list.
	 *         required: true
	 *         schema:
	 *           type: string
	 *       - in: query
	 *         name: statusPurpose
	 *         description: The purpose of the status list. Can be either revocation or suspension.
	 *         schema:
	 *           type: string
	 *           enum:
	 *             - revocation
	 *             - suspension
	 *       - in: query
	 *         name: statusListName
	 *         description: The name of the StatusList2021 DID-Linked Resource.
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               type: array
	 *               items:
	 *                 type: object
	 *                 properties:
	 *                   statusListName:
	 *                     type: string
	 *                   statusListVersion:
	 *                     type: string
	 *                   statusListId:
	 *                     type: string
	 *                   statusListNextVersion:
	 *                     type: string
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	async searchStatusList(request: Request, response: Response) {
		const result = validationResult(request);
		if (!result.isEmpty()) {
			return response.status(StatusCodes.BAD_REQUEST).json({ error: result.array()[0].msg });
		}

		try {
			const { did, statusListName } = request.query;
			const statusPurpose = request.query.statusPurpose as 'revocation' | 'suspension';
			const statusList = await new IdentityStrategySetup(response.locals.customerId).agent.searchStatusList2021(
				did as string,
				statusListName as string,
				statusPurpose
			);
			return response.status(StatusCodes.OK).json(statusList);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${error}`,
			});
		}
	}
}
