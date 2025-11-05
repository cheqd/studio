import type { Request, Response } from 'express';
import { check, query } from '../validator/index.js';
import type {
	ListStatusListQuery,
	SearchStatusListQuery,
	SearchStatusListUnsuccessfulResponseBody,
} from '../../types/credential-status.js';
import { DefaultStatusActions, MinimalPaymentCondition, StatusListType } from '../../types/credential-status.js';
import type {
	CheckStatusListRequestBody,
	CheckStatusListRequestQuery,
	CheckStatusListUnsuccessfulResponseBody,
	CreateEncryptedStatusListRequestBody,
	CreateEncryptedStatusListRequestQuery,
	CreateEncryptedStatusListUnsuccessfulResponseBody,
	CreateUnencryptedStatusListRequestBody,
	CreateUnencryptedStatusListRequestQuery,
	CreateUnencryptedStatusListUnsuccessfulResponseBody,
	UpdateEncryptedStatusListRequestBody,
	UpdateEncryptedStatusListUnsuccessfulResponseBody,
	UpdateUnencryptedStatusListRequestBody,
	UpdateUnencryptedStatusListRequestQuery,
	UpdateUnencryptedStatusListUnsuccessfulResponseBody,
} from '../../types/credential-status.js';
import {
	DefaultStatusListEncodings,
	DefaultStatusList2021StatusPurposeTypes,
	BitstringStatusPurposeTypes,
	BitstringStatusMessage,
} from '@cheqd/did-provider-cheqd';
import type { AlternativeUri } from '@cheqd/ts-proto/cheqd/resource/v2/resource.js';
import { validate } from '../validator/decorator.js';
import { CredentialStatusService } from '../../services/api/credential-status.js';
import { param } from 'express-validator';

export class CredentialStatusController {
	static createUnencryptedValidator = [
		check('did').exists().withMessage('did: required').bail().isDID(),
		check('listType')
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
			)
			.bail(),
		check('statusPurpose')
			.exists()
			.withMessage('statusPurpose: required')
			.bail()
			.custom((value, { req }) => {
				const listType = req.query?.listType || req.body.listType;
				let purposes = [];
				// Normalize input to array
				if (typeof value === 'string') {
					purposes = value
						.split(',')
						.map((p) => p.trim())
						.filter((p) => p);
				} else if (Array.isArray(value)) {
					purposes = value;
				} else {
					throw new Error('statusPurpose: should be a string or array');
				}
				// Check if multiple purposes are allowed for this listType
				if (purposes.length > 1 && listType === StatusListType.StatusList2021) {
					throw new Error('statusPurpose: multiple values only allowed for BitstringStatusList');
				}
				// Validate array is not empty
				if (purposes.length === 0) {
					throw new Error('statusPurpose: cannot be empty');
				}
				if (listType === StatusListType.StatusList2021) {
					const validPurposes = Object.keys(DefaultStatusList2021StatusPurposeTypes);
					// Check for valid purposes
					const invalidPurposes = purposes.filter((purpose) => !validPurposes.includes(purpose));
					if (invalidPurposes.length > 0) {
						throw new Error(
							`statusPurpose: invalid statusPurpose(s) "${invalidPurposes.join(', ')}", should be one of ${validPurposes.join(', ')}`
						);
					}
				} else {
					const validPurposes = Object.keys(BitstringStatusPurposeTypes);
					// Check for valid purposes
					const invalidPurposes = purposes.filter((purpose) => !validPurposes.includes(purpose));
					if (invalidPurposes.length > 0) {
						throw new Error(
							`statusPurpose: invalid statusPurpose(s) "${invalidPurposes.join(', ')}", should be one of ${validPurposes.join(', ')}`
						);
					}
				}
				// Check for duplicates
				const uniquePurposes = [...new Set(purposes)];
				if (uniquePurposes.length !== purposes.length) {
					throw new Error('statusPurpose: duplicate values not allowed');
				}

				return true;
			})
			.bail(),
		check('statusListName')
			.exists()
			.withMessage('statusListName: required')
			.bail()
			.isString()
			.withMessage('statusListName: should be a string')
			.bail()
			.notEmpty()
			.withMessage('statusListName: should be a non-empty string')
			.bail(),
		check('statusListVersion').optional().isString().withMessage('statusListVersion: should be a string').bail(),
		check('alsoKnownAs')
			.optional()
			.isArray()
			.withMessage('alsoKnownAs: should be an array')
			.bail()
			.notEmpty()
			.withMessage('alsoKnownAs: should be a non-empty array')
			.bail()
			.custom((value) => {
				return value.every(
					(item: AlternativeUri) =>
						item.description &&
						typeof item.description === 'string' &&
						item.uri &&
						typeof item.uri === 'string'
				);
			})
			.withMessage(
				'alsoKnownAs: should be an array of objects with `description` and `uri` properties of type string, non-empty'
			)
			.bail(),
		check('length')
			.optional()
			.isNumeric()
			.withMessage('length: should be a number')
			.bail()
			.custom(
				(value) =>
					!isNaN(parseInt(value.toString())) &&
					isFinite(parseInt(value.toString())) &&
					Number.isInteger(value)
			)
			.withMessage('length: should be an integer')
			.bail()
			.custom((value) => value > 0)
			.withMessage('length: should be a positive integer')
			.bail(),
		check('encoding')
			.optional()
			.custom((value, { req }) => {
				const listType = req.query?.listType || req.body.listType;
				if (listType === StatusListType.StatusList2021) {
					if (!Object.values(DefaultStatusListEncodings).includes(value)) {
						throw new Error(
							`encoding: invalid encoding, should be one of ${Object.keys(DefaultStatusListEncodings).join(', ')}`
						);
					}
				} else {
					if (value !== DefaultStatusListEncodings.base64url) {
						throw new Error(`encoding: invalid encoding, should be base64url for BitstringStatusList`);
					}
				}
				return true;
			})
			.bail(),
		check('statusSize')
			.optional()
			.isNumeric()
			.withMessage('statusSize: should be a number')
			.bail()
			.custom((value) => {
				const val = parseInt(value.toString(), 10);
				return !isNaN(val) && isFinite(val) && Number.isInteger(val);
			})
			.custom((value) => {
				const val = parseInt(value.toString(), 10);
				return val >= 1 && val <= 8;
			})
			.withMessage('statusSize: should be an integer between 1 and 8')
			.bail(),
		check('statusMessages')
			.optional()
			.isArray()
			.withMessage('statusMessages: should be an array')
			.bail()
			.custom((value) => Array.isArray(value) && value.length > 0)
			.withMessage('statusMessages: should be a non-empty array')
			.bail()
			.custom((value) =>
				value.every(
					(item: BitstringStatusMessage) =>
						typeof item?.status === 'string' && typeof item?.message === 'string'
				)
			)
			.withMessage(
				'statusMessages: should be an array of objects with `status` and `message` properties of type string'
			)
			.bail()
			.custom((value, { req }) => {
				const sizeRaw = req.query?.statusSize || req.body?.statusSize;
				const size = parseInt(sizeRaw?.toString(), 10);
				if (isNaN(size) || size <= 1) {
					return true; // If size is 1 or undefined, skip this check
				}
				return value.length === Math.pow(2, size);
			})
			.withMessage('statusMessages: array size must be 2^statusSize when statusSize > 1')
			.bail(),
		check('encodedList').optional().isString().withMessage('encodedList: should be a string').bail(),
	];

	static createEncryptedValidator = [
		...CredentialStatusController.createUnencryptedValidator,
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
				return value.every(
					(item: MinimalPaymentCondition) =>
						item.feePaymentAddress && typeof item.feePaymentAddress === 'string'
				);
			})
			.withMessage(
				'paymentConditions: should be an array of objects with feePaymentAddress property of type string, non-empty'
			)
			.bail()
			.custom((value) => {
				return value.every(
					(item: MinimalPaymentCondition) =>
						item.feePaymentAmount &&
						typeof item.feePaymentAmount === 'number' &&
						isFinite(parseFloat(item.feePaymentAmount.toString())) &&
						/^[0-9]+(?:\.[0-9]{1,2})?$/.test(item.feePaymentAmount.toString()) // check if number is float with 2 decimal places max
				);
			})
			.withMessage(
				'paymentConditions: should be an array of objects with feePaymentAmount property of type number, non-empty, integer or float with 2 decimal places max'
			)
			.bail()
			.custom((value) => {
				return value.every(
					(item: MinimalPaymentCondition) =>
						item.feePaymentWindow &&
						typeof item.feePaymentWindow === 'number' &&
						!isNaN(parseInt(item.feePaymentWindow.toString())) &&
						isFinite(parseInt(item.feePaymentWindow.toString())) &&
						parseInt(item.feePaymentWindow.toString()) > 0
				);
			})
			.withMessage(
				'paymentConditions: should be an array of objects with feePaymentWindow property of type number, non-empty, integer, strictly positive'
			)
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
		check('did').exists().withMessage('did: required').bail().isDID().bail(),
		check('listType')
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
			)
			.bail(),
		check('statusAction')
			.exists()
			.withMessage('statusAction: required')
			.bail()
			.isIn(Object.keys(DefaultStatusActions))
			.withMessage(
				`statusAction: invalid statusAction, should be one of ${Object.keys(DefaultStatusActions).join(', ')}`
			)
			.bail(),
		check('indices')
			.exists()
			.withMessage('indices: required')
			.bail()
			.custom((value) => {
				return (
					value &&
					((Array.isArray(value) &&
						value.every((item) => typeof item === 'number' && item >= 0 && Number.isInteger(item))) ||
						(typeof value === 'number' && value >= 0 && Number.isInteger(value)))
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
			.bail()
			.notEmpty()
			.withMessage('statusListName: should be a non-empty string')
			.bail(),
		check('statusListVersion').optional().isString().withMessage('statusListVersion: should be a string').bail(),
	];

	static updateEncryptedValidator = [
		...CredentialStatusController.updateUnencryptedValidator,
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
				return value.every(
					(item: MinimalPaymentCondition) =>
						item.feePaymentAddress && typeof item.feePaymentAddress === 'string'
				);
			})
			.withMessage(
				'paymentConditions: should be an array of objects with feePaymentAddress property of type string, non-empty'
			)
			.bail()
			.custom((value) => {
				return value.every(
					(item: MinimalPaymentCondition) =>
						item.feePaymentAmount &&
						typeof item.feePaymentAmount === 'number' &&
						isFinite(parseFloat(item.feePaymentAmount.toString())) &&
						/^[0-9]+(?:\.[0-9]{1,2})?$/.test(item.feePaymentAmount.toString()) // check if number is float with 2 decimal places max
				);
			})
			.withMessage(
				'paymentConditions: should be an array of objects with feePaymentAmount property of type number, non-empty, integer or float with 2 decimal places max'
			)
			.bail()
			.custom((value) => {
				return value.every(
					(item: MinimalPaymentCondition) =>
						item.feePaymentWindow &&
						typeof item.feePaymentWindow === 'number' &&
						!isNaN(parseInt(item.feePaymentWindow.toString())) &&
						isFinite(parseInt(item.feePaymentWindow.toString())) &&
						parseInt(item.feePaymentWindow.toString()) > 0
				);
			})
			.withMessage(
				'paymentConditions: should be an array of objects with feePaymentWindow property of type number, non-empty, integer, strictly positive'
			)
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
			.withMessage('feePaymentWindow: should be an integer'),
	];

	static checkValidator = [
		check('did').exists().withMessage('did: required').isDID().bail(),
		check('statusListName')
			.exists()
			.withMessage('statusListName: required')
			.bail()
			.isString()
			.withMessage('statusListName: should be a string')
			.bail()
			.notEmpty()
			.withMessage('statusListName: should be a non-empty string')
			.bail(),
		check('listType')
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
			)
			.bail(),
		check('statusPurpose')
			.exists()
			.withMessage('statusPurpose: required')
			.bail()
			.isString()
			.withMessage('statusPurpose: should be a string')
			.bail()
			.notEmpty()
			.withMessage('statusPurpose: should be a non-empty string')
			.bail()
			.custom((value, { req }) => {
				const listType = req.query?.listType || req.body.listType;
				if (listType === StatusListType.StatusList2021) {
					const validPurposes = Object.keys(DefaultStatusList2021StatusPurposeTypes);
					if (validPurposes.indexOf(value) === -1) {
						throw new Error(
							`statusPurpose: invalid statusPurpose "${value}", should be one of ${validPurposes.join(', ')}`
						);
					}
				} else {
					const validPurposes = Object.keys(BitstringStatusPurposeTypes);
					// Check for valid purposes
					if (validPurposes.indexOf(value) === -1) {
						throw new Error(
							`statusPurpose: invalid statusPurpose(s) "${value}", should be one of ${validPurposes.join(', ')}`
						);
					}
				}
				return true;
			})
			.bail(),
		check('index')
			.exists()
			.withMessage('index: required')
			.bail()
			.isNumeric()
			.withMessage('index: should be a number')
			.bail()
			.custom((value) => value >= 0)
			.withMessage('index: should be a positive number')
			.bail()
			.custom((value) => Number.isInteger(value))
			.withMessage('index: should be an integer')
			.bail(),
		check('makeFeePayment').optional().isBoolean().withMessage('makeFeePayment: should be a boolean').bail(),
	];

	static searchValidator = [
		query('did').exists().withMessage('did: required').isDID().bail(),
		query('statusListName')
			.exists()
			.withMessage('statusListName: required')
			.bail()
			.isString()
			.withMessage('statusListName: should be a string')
			.bail()
			.notEmpty()
			.withMessage('statusListName: should be a non-empty string')
			.bail(),
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
		query('statusPurpose')
			.exists()
			.withMessage('statusPurpose: required')
			.bail()
			.isString()
			.withMessage('statusPurpose: should be a string')
			.bail()
			.notEmpty()
			.withMessage('statusPurpose: should be a non-empty string')
			.bail()
			.isIn(Object.keys(DefaultStatusList2021StatusPurposeTypes))
			.withMessage(
				`statusPurpose: invalid statusPurpose, should be one of ${Object.keys(
					DefaultStatusList2021StatusPurposeTypes
				).join(', ')}`
			)
			.bail(),
	];

	static listValidator = [
		query('did').optional().isDID().withMessage('did: should be a valid DID').bail(),
		query('listType')
			.optional()
			.isString()
			.withMessage('listType: should be a string')
			.bail()
			.isIn([StatusListType.Bitstring, StatusListType.StatusList2021])
			.withMessage(
				`listType: invalid listType, should be one of [${Object.values(StatusListType)
					.map((v) => `'${v}'`)
					.join(', ')}]`
			)
			.bail(),
		query('statusListName')
			.optional()
			.isString()
			.withMessage('statusListName: should be a string')
			.bail()
			.notEmpty()
			.withMessage('statusListName: should be a non-empty string')
			.bail(),
		query('statusListVersion').optional().isString().withMessage('statusListVersion: should be a string').bail(),
		query('state')
			.optional()
			.isString()
			.withMessage('state: should be a string')
			.bail()
			.isIn(['ACTIVE', 'STANDBY', 'FULL'])
			.withMessage("state: invalid state, should be one of ['ACTIVE', 'STANDBY', 'FULL']")
			.bail(),
		query('credentialCategory')
			.optional()
			.isString()
			.withMessage('credentialCategory: should be a string')
			.bail()
			.isIn(['credential', 'accreditation'])
			.withMessage("credentialCategory: invalid category, should be one of ['credential', 'accreditation']")
			.bail(),
		query('deprecated').optional().isBoolean().withMessage('deprecated: should be a boolean').bail(),
	];

	static fetchValidator = [
		param('statusListId')
			.exists()
			.withMessage('statusListId: required')
			.bail()
			.isString()
			.withMessage('statusListId: should be a string')
			.bail()
			.notEmpty()
			.withMessage('statusListId: should be a non-empty string')
			.bail(),
	];

	/**
	 * @openapi
	 *
	 * /credential-status/create/unencrypted:
	 *   post:
	 *     tags: [ Status Lists ]
	 *     summary: Create an unencrypted StatusList2021 or BitstringStatusList credential status list.
	 *     description: This endpoint creates an unencrypted StatusList2021 or BitstringStatusList credential status list. The StatusList is published as a DID-Linked Resource on ledger. As input, it can can take input parameters needed to create the status list via a form, or a pre-assembled status list in JSON format. Status lists can be created as either encrypted or unencrypted.
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
	 *         name: statusPurpose
	 *         description: |
	 *           The purpose of the status list.
	 *           - For StatusList2021: Single value (revocation or suspension)
	 *           - For BitstringStatusList: Can accept multiple values as array of strings
	 *
	 *           Once this is set, it cannot be changed. A new status list must be created to change the purpose.
	 *         required: true
	 *         schema:
	 *           oneOf:
	 *             - type: string
	 *               enum:
	 *                 - revocation
	 *                 - suspension
	 *             - type: array
	 *               items:
	 *                 type: string
	 *                 enum: [revocation, suspension, message, refresh]
	 *         examples:
	 *           single_value:
	 *             summary: Single purpose (StatusList2021)
	 *             value: "revocation"
	 *           multiple_values_array:
	 *             summary: Multiple purposes as array (BitstringStatusList)
	 *             value: ["revocation", "suspension", "message"]
	 *           with_message:
	 *             summary: Including message purpose
	 *             value: ["revocation", "message"]
	 *     requestBody:
	 *       content:
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             $ref: '#/components/schemas/CredentialStatusCreateUnencryptedRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/CredentialStatusCreateUnencryptedRequest'
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/CredentialStatusCreateUnencryptedResult'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	async createUnencryptedStatusList(request: Request, response: Response) {
		const credentialStatusService = new CredentialStatusService();

		const result = await credentialStatusService.createUnencryptedStatusList(
			request.body as CreateUnencryptedStatusListRequestBody,
			request.query as CreateUnencryptedStatusListRequestQuery,
			response.locals.customer,
			response.locals.user
		);

		if (result.success) {
			return response.status(result.statusCode).json(result.data);
		} else {
			return response.status(result.statusCode).json({
				created: false,
				error: result.error,
			} as CreateUnencryptedStatusListUnsuccessfulResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /credential-status/create/encrypted:
	 *   post:
	 *     tags: [ Status Lists ]
	 *     summary: Create an encrypted StatusList2021 or BitstringStatusList credential status list.
	 *     description: This endpoint creates an encrypted StatusList2021 or BitstringStatusList credential status list. The StatusList is published as a DID-Linked Resource on ledger. As input, it can can take input parameters needed to create the status list via a form, or a pre-assembled status list in JSON format. Status lists can be created as either encrypted or unencrypted.
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
	 *         name: statusPurpose
	 *         description: |
	 *           The purpose of the status list.
	 *           - For StatusList2021: Single value (revocation or suspension)
	 *           - For BitstringStatusList: Can accept multiple values as array of strings
	 *
	 *           Once this is set, it cannot be changed. A new status list must be created to change the purpose.
	 *         required: true
	 *         schema:
	 *           oneOf:
	 *             - type: string
	 *               enum:
	 *                 - revocation
	 *                 - suspension
	 *             - type: array
	 *               items:
	 *                 type: string
	 *                 enum: [revocation, suspension, message, refresh]
	 *         examples:
	 *           single_value:
	 *             summary: Single purpose (StatusList2021)
	 *             value: "revocation"
	 *           multiple_values_array:
	 *             summary: Multiple purposes as array (BitstringStatusList)
	 *             value: ["revocation", "suspension", "message"]
	 *           with_message:
	 *             summary: Including message purpose
	 *             value: ["revocation", "message"]
	 *     requestBody:
	 *       content:
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             $ref: '#/components/schemas/CredentialStatusCreateEncryptedFormRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/CredentialStatusCreateEncryptedJsonRequest'
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/CredentialStatusCreateEncryptedResult'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	async createEncryptedStatusList(request: Request, response: Response) {
		const credentialStatusService = new CredentialStatusService();

		const result = await credentialStatusService.createEncryptedStatusList(
			request.body as CreateEncryptedStatusListRequestBody,
			request.query as CreateEncryptedStatusListRequestQuery,
			response.locals.customer,
			response.locals.user
		);

		if (result.success) {
			return response.status(result.statusCode).json(result.data);
		} else {
			return response.status(result.statusCode).json({
				created: false,
				error: result.error,
			} as CreateEncryptedStatusListUnsuccessfulResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /credential-status/update/unencrypted:
	 *   post:
	 *     tags: [ Status Lists ]
	 *     summary: Update an existing unencrypted StatusList2021 or BitstringStatusList credential status list.
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
	 *             $ref: '#/components/schemas/CredentialStatusUpdateUnencryptedRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/CredentialStatusUpdateUnencryptedRequest'
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/CredentialStatusUpdateUnencryptedResult'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	async updateUnencryptedStatusList(request: Request, response: Response) {
		const credentialStatusService = new CredentialStatusService();

		const result = await credentialStatusService.updateUnencryptedStatusList(
			request.body as UpdateUnencryptedStatusListRequestBody,
			request.query as UpdateUnencryptedStatusListRequestQuery,
			response.locals.customer,
			response.locals.user
		);

		if (result.success) {
			return response.status(result.statusCode).json(result.data);
		} else {
			return response.status(result.statusCode).json({
				updated: false,
				error: result.error,
			} as UpdateUnencryptedStatusListUnsuccessfulResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /credential-status/update/encrypted:
	 *   post:
	 *     tags: [ Status Lists ]
	 *     summary: Update an existing encrypted StatusList2021 or BitstringStatusList credential status list.
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
	 *             $ref: '#/components/schemas/CredentialStatusUpdateEncryptedFormRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/CredentialStatusUpdateEncryptedJsonRequest'
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/CredentialStatusUpdateEncryptedResult'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	async updateEncryptedStatusList(request: Request, response: Response) {
		const credentialStatusService = new CredentialStatusService();

		const result = await credentialStatusService.updateEncryptedStatusList(
			request.body as UpdateEncryptedStatusListRequestBody,
			request.query as UpdateUnencryptedStatusListRequestQuery,
			response.locals.customer,
			response.locals.user
		);

		if (result.success) {
			return response.status(result.statusCode).json(result.data);
		} else {
			return response.status(result.statusCode).json({
				updated: false,
				error: result.error,
			} as UpdateEncryptedStatusListUnsuccessfulResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /credential-status/check:
	 *   post:
	 *     tags: [ Status Lists ]
	 *     summary: Check a StatusList2021 or BitstringStatusList index for a given Verifiable Credential.
	 *     description: This endpoint checks a StatusList2021 or BitstringStatusList index for a given Verifiable Credential and reports whether it is revoked or suspended. It offers a standalone method for checking an index without passing the entire Verifiable Credential or Verifiable Presentation.
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
	 *         name: statusPurpose
	 *         description: The purpose of the status list. Can be either revocation or suspension.
	 *         required: true
	 *         schema:
	 *           type: string
	 *           enum:
	 *             - revocation
	 *             - suspension
	 *             - message
	 *             - refresh
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
	 *               $ref: '#/components/schemas/CredentialStatusCheckResult'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	async checkStatusList(request: Request, response: Response) {
		const credentialStatusService = new CredentialStatusService();

		const result = await credentialStatusService.checkStatusList(
			request.body as CheckStatusListRequestBody,
			request.query as CheckStatusListRequestQuery,
			response.locals.customer,
			response.locals.user
		);

		if (result.success) {
			return response.status(result.statusCode).json(result.data);
		} else {
			return response.status(result.statusCode).json({
				checked: false,
				error: result.error,
			} as CheckStatusListUnsuccessfulResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /credential-status/search:
	 *   get:
	 *     tags: [ Status Lists ]
	 *     summary: Fetch StatusList2021 or BitstringStatusList DID-Linked Resource based on search criteria.
	 *     parameters:
	 *       - in: query
	 *         name: did
	 *         description: The DID of the issuer of the status list.
	 *         required: true
	 *         schema:
	 *           type: string
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
	 *         name: statusPurpose
	 *         description: The purpose of the status list. Can be either revocation or suspension.
	 *         required: true
	 *         schema:
	 *           type: string
	 *           enum:
	 *             - revocation
	 *             - suspension
	 *       - in: query
	 *         name: statusListName
	 *         description: The name of the Status List DID-Linked Resource.
	 *         required: true
	 *         schema:
	 *           type: string
	 *       - in: query
	 *         name: statusListVersion
	 *         description: The version of the Status List DID-Linked Resource.
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/CredentialStatusListSearchResult'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	async searchStatusList(request: Request, response: Response) {
		const credentialStatusService = new CredentialStatusService();

		const result = await credentialStatusService.searchStatusList(request.query as SearchStatusListQuery);

		if (result.success) {
			return response.status(result.statusCode).json(result.data);
		} else {
			return response.status(result.statusCode).json({
				found: false,
				error: result.error,
			} as SearchStatusListUnsuccessfulResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /credential-status/list:
	 *   get:
	 *     tags: [ Status Lists ]
	 *     summary: List StatusList2021 or BitstringStatusList DID-Linked Resources created by the customer.
	 *     parameters:
	 *       - in: query
	 *         name: did
	 *         description: The DID of the issuer of the status list.
	 *         schema:
	 *           type: string
	 *       - in: query
	 *         name: listType
	 *         description: The type of Status List.
	 *         schema:
	 *           type: string
	 *           enum:
	 *             - StatusList2021
	 *             - BitstringStatusList
	 *       - in: query
	 *         name: statusListName
	 *         description: The name of the Status List DID-Linked Resource.
	 *         schema:
	 *           type: string
	 *       - in: query
	 *         name: statusListVersion
	 *         description: The version of the Status List DID-Linked Resource.
	 *         schema:
	 *           type: string
	 *       - in: query
	 *         name: state
	 *         description: The state of the Status List DID-Linked Resource.
	 *         schema:
	 *           type: string
	 *           enum:
	 *              - ACTIVE
	 *              - STANDBY
	 *              - FULL
	 *       - in: query
	 *         name: credentialCategory
	 *         description: Filter status lists by credential category assigned for.
	 *         schema:
	 *           type: string
	 *           enum:
	 *              - credential
	 *              - accreditation
	 *       - in: query
	 *         name: deprecated
	 *         description: Filter status lists by deprecated status.
	 *         schema:
	 *           type: boolean
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/CredentialStatusListSearchResult'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	async listStatusList(request: Request, response: Response) {
		const credentialStatusService = new CredentialStatusService();

		const result = await credentialStatusService.listStatusList(
			request.query as ListStatusListQuery,
			response.locals.customer
		);

		if (result.success) {
			return response.status(result.statusCode).json(result.data);
		} else {
			return response.status(result.statusCode).json({
				found: false,
				error: result.error,
			} as SearchStatusListUnsuccessfulResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /credential-status/{statusListId}:
	 *   get:
	 *     tags: [ Status Lists ]
	 *     summary: Fetch StatusList2021 or BitstringStatusList DID-Linked Resource based on search criteria.
	 *     parameters:
	 *       - in: path
	 *         name: statusListId
	 *         description: The statusListId of the status list.
	 *         required: true
	 *         schema:
	 *           type: string
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/CredentialStatusRecordResult'
	 *       400:
	 *         $ref: '#/components/schemas/InvalidRequest'
	 *       401:
	 *         $ref: '#/components/schemas/UnauthorizedError'
	 *       500:
	 *         $ref: '#/components/schemas/InternalError'
	 */
	@validate
	async fetchStatusList(request: Request, response: Response) {
		const credentialStatusService = new CredentialStatusService();
		const { statusListId } = request.params;
		const result = await credentialStatusService.getStatusList(
			{
				statusListId,
			},
			response.locals.customer
		);

		if (result.success) {
			return response.status(result.statusCode).json(result.data);
		} else {
			return response.status(result.statusCode).json({
				found: false,
				error: result.error,
			} as SearchStatusListUnsuccessfulResponseBody);
		}
	}
}
