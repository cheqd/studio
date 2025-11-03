import type { Request, Response } from 'express';
import { check, query } from '../validator/index.js';
import { fromString } from 'uint8arrays';
import { StatusCodes } from 'http-status-codes';
import { IdentityServiceStrategySetup } from '../../services/identity/index.js';
import type {
	CheckStatusListSuccessfulResponseBody,
	CheqdCredentialStatus,
	CreateEncryptedBitstringSuccessfulResponseBody,
	CreateUnencryptedBitstringSuccessfulResponseBody,
	FeePaymentOptions,
} from '../../types/credential-status.js';
import {
	DefaultStatusActionPurposeMap,
	DefaultStatusActions,
	MinimalPaymentCondition,
	StatusListType,
} from '../../types/credential-status.js';
import type {
	SearchStatusListQuery,
	SearchStatusListSuccessfulResponseBody,
	SearchStatusListUnsuccessfulResponseBody,
} from '../../types/credential-status.js';
import type {
	CheckStatusListRequestBody,
	CheckStatusListRequestQuery,
	CheckStatusListUnsuccessfulResponseBody,
	CreateEncryptedStatusListRequestBody,
	CreateEncryptedStatusListRequestQuery,
	CreateEncryptedStatusListSuccessfulResponseBody,
	CreateEncryptedStatusListUnsuccessfulResponseBody,
	CreateUnencryptedStatusListRequestBody,
	CreateUnencryptedStatusListRequestQuery,
	CreateUnencryptedStatusListSuccessfulResponseBody,
	CreateUnencryptedStatusListUnsuccessfulResponseBody,
	UpdateEncryptedStatusListRequestBody,
	UpdateEncryptedStatusListSuccessfulResponseBody,
	UpdateEncryptedStatusListUnsuccessfulResponseBody,
	UpdateUnencryptedStatusListRequestBody,
	UpdateUnencryptedStatusListRequestQuery,
	UpdateUnencryptedStatusListSuccessfulResponseBody,
	UpdateUnencryptedStatusListUnsuccessfulResponseBody,
} from '../../types/credential-status.js';
import {
	BulkRevocationResult,
	BulkSuspensionResult,
	BulkUnsuspensionResult,
	DefaultStatusListEncodings,
	DefaultStatusList2021StatusPurposeTypes,
	BitstringStatusPurposeTypes,
	BitstringStatusMessage,
	BulkBitstringUpdateResult,
} from '@cheqd/did-provider-cheqd';
import type { AlternativeUri } from '@cheqd/ts-proto/cheqd/resource/v2/resource.js';
import { toNetwork } from '../../helpers/helpers.js';
import { eventTracker } from '../../services/track/tracker.js';
import type { ICredentialStatusTrack, ITrackOperation, IFeePaymentOptions } from '../../types/track.js';
import { OperationCategoryNameEnum, OperationNameEnum } from '../../types/constants.js';
import { FeeAnalyzer } from '../../helpers/fee-analyzer.js';
import { validate } from '../validator/decorator.js';

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
		// collect request parameters - case: body
		const {
			did,
			encodedList,
			statusListName,
			alsoKnownAs,
			statusListVersion,
			length,
			encoding,
			statusSize: size,
			ttl,
			statusMessages,
		} = request.body as CreateUnencryptedStatusListRequestBody;

		// collect request parameters - case: query
		const { listType, statusPurpose } = request.query as CreateUnencryptedStatusListRequestQuery;

		// define broadcast mode
		const data = encodedList ? fromString(encodedList, encoding) : undefined;

		// create agent
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);

		try {
			// broadcast, if applicable
			if (data) {
				let result;
				if (listType === StatusListType.Bitstring) {
					result = await identityServiceStrategySetup.agent.broadcastBitstringStatusList(
						did,
						{ data, name: statusListName, alsoKnownAs, version: statusListVersion },
						response.locals.customer
					);
				} else {
					result = await identityServiceStrategySetup.agent.broadcastStatusList2021(
						did,
						{ data, name: statusListName, alsoKnownAs, version: statusListVersion },
						{ encoding, statusPurpose },
						response.locals.customer
					);
				}
				return response.status(StatusCodes.OK).json(result);
			}
			let result:
				| CreateUnencryptedStatusListSuccessfulResponseBody
				| CreateUnencryptedBitstringSuccessfulResponseBody;
			// create unencrypted status list
			if (listType === StatusListType.Bitstring) {
				// create BitstringStatusList
				result = (await identityServiceStrategySetup.agent.createUnencryptedBitstringStatusList(
					did,
					{
						name: statusListName,
						alsoKnownAs,
						version: statusListVersion,
					},
					{
						length,
						size,
						statusMessages,
						ttl,
						encoding,
						statusPurpose,
					},
					response.locals.customer
				)) as CreateUnencryptedBitstringSuccessfulResponseBody;
			} else {
				// create StatusList2021
				result = (await identityServiceStrategySetup.agent.createUnencryptedStatusList2021(
					did,
					{
						name: statusListName,
						alsoKnownAs,
						version: statusListVersion,
					},
					{
						length,
						encoding,
						statusPurpose,
					},
					response.locals.customer
				)) as CreateUnencryptedStatusListSuccessfulResponseBody;
			}

			// handle error
			if (result.error) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					...result,
					error: result.error?.message || result.error.toString(),
				} as CreateUnencryptedStatusListUnsuccessfulResponseBody);
			}

			// Keep track of resources
			const trackInfo = {
				category: OperationCategoryNameEnum.CREDENTIAL_STATUS,
				name: OperationNameEnum.CREDENTIAL_STATUS_CREATE_UNENCRYPTED,
				customer: response.locals.customer,
				user: response.locals.user,
				data: {
					did,
					resource: result.resourceMetadata,
					encrypted: result.resource?.metadata?.encrypted,
					symmetricKey: '',
				} satisfies ICredentialStatusTrack,
			} as ITrackOperation;

			// Track operation
			eventTracker.emit('track', trackInfo);

			return response.status(StatusCodes.OK).json({ ...result, encrypted: undefined });
		} catch (error) {
			// return catch-all error
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				created: false,
				error: `Internal error: ${(error as Record<string, unknown>)?.message || error}`,
			} satisfies CreateUnencryptedStatusListUnsuccessfulResponseBody);
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
		// collect request parameters - case: body
		const {
			did,
			statusListName,
			alsoKnownAs,
			statusListVersion,
			length,
			statusSize: size,
			ttl,
			statusMessages,
			encoding,
			paymentConditions,
			feePaymentAddress,
			feePaymentAmount,
			feePaymentWindow,
		} = request.body as CreateEncryptedStatusListRequestBody;

		// collect request parameters - case: query
		const { listType, statusPurpose } = request.query as CreateEncryptedStatusListRequestQuery;
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);
		let result: CreateEncryptedStatusListSuccessfulResponseBody | CreateEncryptedBitstringSuccessfulResponseBody;
		try {
			// create encrypted status list
			if (listType === StatusListType.Bitstring) {
				// create BitstringStatusList
				result = (await identityServiceStrategySetup.agent.createEncryptedBitstringStatusList(
					did,
					{
						name: statusListName,
						alsoKnownAs,
						version: statusListVersion,
					},
					{
						length,
						size,
						statusMessages,
						ttl,
						encoding,
						statusPurpose,
						paymentConditions,
						feePaymentAddress,
						feePaymentAmount,
						feePaymentWindow,
					},
					response.locals.customer
				)) as CreateEncryptedBitstringSuccessfulResponseBody;
			} else {
				// create StatusList2021
				result = (await identityServiceStrategySetup.agent.createEncryptedStatusList2021(
					did,
					{
						name: statusListName,
						alsoKnownAs,
						version: statusListVersion,
					},
					{
						length,
						encoding,
						statusPurpose,
						paymentConditions,
						feePaymentAddress,
						feePaymentAmount,
						feePaymentWindow,
					},
					response.locals.customer
				)) as CreateEncryptedStatusListSuccessfulResponseBody;
			}
			// handle error
			if (result.error) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					...result,
					error: result.error?.message || result.error.toString(),
				} as CreateEncryptedStatusListUnsuccessfulResponseBody);
			}
			// Keep track of resources
			// For now we decided not to store symmetricKey yet

			const trackInfo = {
				name: OperationNameEnum.CREDENTIAL_STATUS_CREATE_ENCRYPTED,
				category: OperationCategoryNameEnum.CREDENTIAL_STATUS,
				customer: response.locals.customer,
				user: response.locals.user,
				data: {
					did,
					resource: result.resourceMetadata,
					encrypted: true,
					symmetricKey: '',
				} satisfies ICredentialStatusTrack,
				feePaymentOptions: {},
			} as ITrackOperation;

			// Track operation
			eventTracker.emit('track', trackInfo);

			return response.status(StatusCodes.OK).json({ ...result, encrypted: undefined });
		} catch (error) {
			// return catch-all error
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				created: false,
				error: `Internal error: ${(error as Record<string, unknown>)?.message || error}`,
			} satisfies CreateEncryptedStatusListUnsuccessfulResponseBody);
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
		// collect request parameters - case: body
		const { did, statusListName, statusListVersion, indices } =
			request.body as UpdateUnencryptedStatusListRequestBody;

		// collect request parameters - case: query
		const { statusAction, listType } = request.query as UpdateUnencryptedStatusListRequestQuery;

		// define identity service strategy setup
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);

		// ensure unencrypted status list
		const unencrypted = await identityServiceStrategySetup.agent.searchStatusList(
			did,
			statusListName,
			listType,
			DefaultStatusActionPurposeMap[statusAction]
		);

		// handle error
		if (unencrypted.error) {
			// handle notFound error
			if (unencrypted.error === 'notFound') {
				return response.status(StatusCodes.NOT_FOUND).json({
					updated: false,
					error: `update: error: status list '${statusListName}' not found`,
				} satisfies UpdateUnencryptedStatusListUnsuccessfulResponseBody);
			}

			// handle generic error
			return response.status(StatusCodes.BAD_REQUEST).json({
				updated: false,
				error: `update: error: ${unencrypted.error}`,
			} satisfies UpdateUnencryptedStatusListUnsuccessfulResponseBody);
		}

		// validate unencrypted
		if (unencrypted.resource?.metadata?.encrypted)
			return response.status(StatusCodes.BAD_REQUEST).json({
				updated: false,
				error: `update: error: status list '${statusListName}' is encrypted`,
			} satisfies UpdateUnencryptedStatusListUnsuccessfulResponseBody);

		try {
			// update unencrypted status list
			const result = (await identityServiceStrategySetup.agent.updateUnencryptedStatusList(
				did,
				listType,
				{
					indices: typeof indices === 'number' ? [indices] : indices,
					statusListName,
					statusListVersion,
					statusAction,
				},
				response.locals.customer
			)) as (BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult | BulkBitstringUpdateResult) & {
				updated?: boolean;
			};

			// enhance result
			result.updated = (function (that) {
				// validate result - case: revocation
				if (
					(that as BulkRevocationResult)?.revoked?.every((item) => !!item) &&
					(that as BulkRevocationResult)?.revoked?.length !== 0
				)
					return true;

				// validate result - case: suspension
				if (
					(that as BulkSuspensionResult)?.suspended?.every((item) => !!item) &&
					(that as BulkSuspensionResult)?.suspended?.length !== 0
				)
					return true;

				// validate result - case: unsuspension
				if (
					(that as BulkUnsuspensionResult)?.unsuspended?.every((item) => !!item) &&
					(that as BulkUnsuspensionResult)?.unsuspended?.length !== 0
				)
					return true;

				return false;
			})(result);

			// handle error
			if (result.error) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					...result,
					error: result.error?.message || result.error.toString(),
				} as UpdateUnencryptedStatusListUnsuccessfulResponseBody);
			}
			// construct formatted response
			const formatted = {
				updated: true,
				revoked: (result as BulkRevocationResult)?.revoked || undefined,
				suspended: (result as BulkSuspensionResult)?.suspended || undefined,
				unsuspended: (result as BulkUnsuspensionResult)?.unsuspended || undefined,
				resource: result.statusList,
				resourceMetadata: result.resourceMetadata,
			} satisfies UpdateUnencryptedStatusListSuccessfulResponseBody;

			// track resource creation
			if (result.resourceMetadata) {
				const trackInfo = {
					category: OperationCategoryNameEnum.CREDENTIAL_STATUS,
					name: OperationNameEnum.CREDENTIAL_STATUS_UPDATE_UNENCRYPTED,
					customer: response.locals.customer,
					user: response.locals.user,
					data: {
						did,
						resource: result.resourceMetadata,
						encrypted: false,
						symmetricKey: '',
					} satisfies ICredentialStatusTrack,
				} as ITrackOperation;

				// Track operation
				eventTracker.emit('track', trackInfo);
			}

			return response.status(StatusCodes.OK).json(formatted);
		} catch (error) {
			// return catch-all error
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				updated: false,
				error: `Internal error: ${(error as Record<string, unknown>)?.message || error}`,
			} satisfies UpdateUnencryptedStatusListUnsuccessfulResponseBody);
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
		// collect request parameters - case: body
		const {
			did,
			statusListName,
			statusListVersion,
			indices,
			symmetricKey,
			paymentConditions,
			feePaymentAddress,
			feePaymentAmount,
			feePaymentWindow,
		} = request.body as UpdateEncryptedStatusListRequestBody;

		// collect request parameters - case: query
		const { statusAction, listType } = request.query as UpdateUnencryptedStatusListRequestQuery;

		// define identity service strategy setup
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);

		// ensure encrypted status list
		const encrypted = await identityServiceStrategySetup.agent.searchStatusList(
			did,
			statusListName,
			listType,
			DefaultStatusActionPurposeMap[statusAction]
		);

		// handle error
		if (encrypted.error) {
			// handle notFound error
			if (encrypted.error === 'notFound') {
				return response.status(StatusCodes.NOT_FOUND).json({
					updated: false,
					error: `update: error: status list '${statusListName}' not found`,
				} satisfies UpdateEncryptedStatusListUnsuccessfulResponseBody);
			}

			// handle generic error
			return response.status(StatusCodes.BAD_REQUEST).json({
				updated: false,
				error: `update: error: ${encrypted.error}`,
			} satisfies UpdateEncryptedStatusListUnsuccessfulResponseBody);
		}

		// validate encrypted
		if (!encrypted.resource?.metadata?.encrypted)
			return response.status(StatusCodes.BAD_REQUEST).json({
				updated: false,
				error: `update: error: status list '${statusListName}' is unencrypted`,
			} satisfies UpdateEncryptedStatusListUnsuccessfulResponseBody);

		try {
			// update encrypted status list
			const result = (await identityServiceStrategySetup.agent.updateEncryptedStatusList(
				did,
				listType,
				{
					indices: typeof indices === 'number' ? [indices] : indices,
					statusListName,
					statusListVersion,
					statusAction,
					paymentConditions,
					symmetricKey,
					feePaymentAddress,
					feePaymentAmount,
					feePaymentWindow,
				},
				response.locals.customer
			)) as (BulkRevocationResult | BulkSuspensionResult | BulkUnsuspensionResult | BulkBitstringUpdateResult) & {
				updated: boolean;
			};

			// enhance result
			result.updated = (function (that) {
				// validate result - case: revocation
				if (
					(that as BulkRevocationResult)?.revoked?.every((item) => !!item) &&
					(that as BulkRevocationResult)?.revoked?.length !== 0
				)
					return true;

				// validate result - case: suspension
				if (
					(that as BulkSuspensionResult)?.suspended?.every((item) => !!item) &&
					(that as BulkSuspensionResult)?.suspended?.length !== 0
				)
					return true;

				// validate result - case: unsuspension
				if (
					(that as BulkUnsuspensionResult)?.unsuspended?.every((item) => !!item) &&
					(that as BulkUnsuspensionResult)?.unsuspended?.length !== 0
				)
					return true;

				return false;
			})(result);

			// handle error
			if (result.error)
				return response.status(StatusCodes.BAD_REQUEST).json({
					...result,
					error: result.error?.message || result.error.toString(),
				} as UpdateEncryptedStatusListUnsuccessfulResponseBody);

			// construct formatted response
			const formatted = {
				updated: true,
				revoked: (result as BulkRevocationResult)?.revoked || undefined,
				suspended: (result as BulkSuspensionResult)?.suspended || undefined,
				unsuspended: (result as BulkUnsuspensionResult)?.unsuspended || undefined,
				resource: result.statusList,
				resourceMetadata: result.resourceMetadata,
				symmetricKey: result.symmetricKey,
			} satisfies UpdateEncryptedStatusListSuccessfulResponseBody;

			// track resource creation
			if (result.resourceMetadata) {
				const trackInfo = {
					category: OperationCategoryNameEnum.CREDENTIAL_STATUS,
					name: OperationNameEnum.CREDENTIAL_STATUS_UPDATE_ENCRYPTED,
					customer: response.locals.customer,
					user: response.locals.user,
					data: {
						did,
						resource: result.resourceMetadata,
						encrypted: true,
						symmetricKey: '',
					} satisfies ICredentialStatusTrack,
					feePaymentOptions: {},
				} as ITrackOperation;

				// Track operation
				eventTracker.emit('track', trackInfo);
			}

			return response.status(StatusCodes.OK).json(formatted);
		} catch (error) {
			// return catch-all error
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				updated: false,
				error: `Internal error: ${(error as Record<string, unknown>)?.message || error}`,
			} satisfies UpdateEncryptedStatusListUnsuccessfulResponseBody);
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
		const feePaymentOptions: IFeePaymentOptions[] = [];

		// Make the base body for tracking
		const trackInfo = {
			name: OperationNameEnum.CREDENTIAL_STATUS_CHECK,
			category: OperationCategoryNameEnum.CREDENTIAL_STATUS,
			customer: response.locals.customer,
			user: response.locals.user,
			successful: false,
		} as ITrackOperation;

		// collect request parameters - case: body
		const { did, statusListName, index, makeFeePayment, statusListCredential, statusSize, statusMessage } =
			request.body as CheckStatusListRequestBody;

		// collect request parameters - case: query
		const { statusPurpose, listType } = request.query as CheckStatusListRequestQuery;

		// define identity service strategy setup
		const identityServiceStrategySetup = new IdentityServiceStrategySetup(response.locals.customer.customerId);

		if (listType === StatusListType.Bitstring) {
			if (!statusListCredential)
				return response.status(StatusCodes.BAD_REQUEST).json({
					checked: false,
					error: `check: error: 'statusListCredential' is required for BitstringStatusList type`,
				} satisfies CheckStatusListUnsuccessfulResponseBody);
			if (statusSize && statusSize > 1 && !statusMessage)
				return response.status(StatusCodes.BAD_REQUEST).json({
					checked: false,
					error: `check: error: 'statusMessage' is required when 'statusSize' is greater than 1 for BitstringStatusList type`,
				} satisfies CheckStatusListUnsuccessfulResponseBody);
		}

		// ensure status list exists
		const statusList = await identityServiceStrategySetup.agent.searchStatusList(
			did,
			statusListName,
			listType,
			statusPurpose
		);

		// handle error
		if (statusList.error) {
			// handle notFound error
			if (statusList.error === 'notFound') {
				return response.status(StatusCodes.NOT_FOUND).json({
					checked: false,
					error: `check: error: status list '${statusListName}' not found`,
				} satisfies CheckStatusListUnsuccessfulResponseBody);
			}

			// handle generic error
			return response.status(StatusCodes.BAD_REQUEST).json({
				checked: false,
				error: `check: error: ${statusList.error}`,
			} satisfies CheckStatusListUnsuccessfulResponseBody);
		}

		try {
			// make fee payment, if defined
			if (makeFeePayment && statusList?.resource?.metadata?.encrypted) {
				// make fee payment
				const feePaymentResult = await Promise.all(
					statusList?.resource?.metadata?.paymentConditions?.map(
						async (condition: { feePaymentAddress: any; feePaymentAmount: any }) => {
							return await identityServiceStrategySetup.agent.remunerateStatusList2021(
								{
									feePaymentAddress: condition.feePaymentAddress,
									feePaymentAmount: condition.feePaymentAmount,
									feePaymentNetwork: toNetwork(did),
									memo: 'Automated status check fee payment, orchestrated by CaaS.',
								} satisfies FeePaymentOptions,
								response.locals.customer
							);
						}
					) || []
				);

				// Track the operation
				await Promise.all(
					feePaymentResult.map(async (result) => {
						const portion = await FeeAnalyzer.getPaymentTrack(result, toNetwork(did));
						feePaymentOptions.push(...portion);
					})
				);

				// handle error
				if (feePaymentResult.some((result) => result.error)) {
					// Track payment information even in case of error
					trackInfo.data = {
						did: did,
						resource: statusList.resourceMetadata,
						encrypted: statusList.resource?.metadata?.encrypted,
					} satisfies ICredentialStatusTrack;
					trackInfo.successful = false;
					trackInfo.feePaymentOptions = feePaymentOptions;

					// Track operation
					eventTracker.emit('track', trackInfo satisfies ITrackOperation);

					return response.status(StatusCodes.BAD_REQUEST).json({
						checked: false,
						error: `check: payment: error: ${feePaymentResult.find((result) => result.error)?.error}`,
					} satisfies CheckStatusListUnsuccessfulResponseBody);
				}
			}

			// check status list
			let result;
			if (listType === StatusListType.Bitstring) {
				result = await identityServiceStrategySetup.agent.checkBitstringStatusList(
					did,
					{
						id: statusListCredential + '#' + index,
						type: 'BitstringStatusListEntry',
						statusPurpose,
						statusListIndex: index.toString(),
						statusListCredential: statusListCredential || '',
						statusSize: statusSize,
						statusMessage: statusMessage,
					} as CheqdCredentialStatus,
					response.locals.customer
				);
			} else {
				result = await identityServiceStrategySetup.agent.checkStatusList2021(
					did,
					{
						statusListIndex: index,
						statusListName,
						statusPurpose,
					},
					response.locals.customer
				);
			}

			// handle error
			if ('error' in result && result.error) {
				return response.status(StatusCodes.BAD_REQUEST).json(result as CheckStatusListUnsuccessfulResponseBody);
			}

			(trackInfo.data = {
				did: did,
				resource: statusList.resourceMetadata,
				encrypted: statusList.resource?.metadata?.encrypted,
			} satisfies ICredentialStatusTrack),
				(trackInfo.successful = true);
			trackInfo.feePaymentOptions = feePaymentOptions;

			// Track operation
			eventTracker.emit('track', trackInfo satisfies ITrackOperation);

			// return result
			return response.status(StatusCodes.OK).json(result as CheckStatusListSuccessfulResponseBody);
		} catch (error) {
			// define error
			const errorRef = error as Record<string, unknown>;

			// handle doesn't meet condition
			if (errorRef?.errorCode === 'NodeAccessControlConditionsReturnedNotAuthorized')
				return response.status(StatusCodes.UNAUTHORIZED).json({
					checked: false,
					error: `check: error: ${
						errorRef?.message
							? 'unauthorized: decryption conditions are not met'
							: (error as Record<string, unknown>).toString()
					}`,
				} satisfies CheckStatusListUnsuccessfulResponseBody);

			// handle incorrect access control conditions
			if (errorRef?.errorCode === 'incorrect_access_control_conditions')
				return response.status(StatusCodes.BAD_REQUEST).json({
					checked: false,
					error: `check: error: ${
						errorRef?.message
							? 'incorrect access control conditions'
							: (error as Record<string, unknown>).toString()
					}`,
				} satisfies CheckStatusListUnsuccessfulResponseBody);

			// return catch-all error
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				checked: false,
				error: `Internal error: ${errorRef?.message || errorRef.toString()}`,
			} satisfies CheckStatusListUnsuccessfulResponseBody);
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
		// collect request parameters - case: query
		const { did, statusListName, listType, statusPurpose } = request.query as SearchStatusListQuery;

		try {
			// search status list
			const result = await new IdentityServiceStrategySetup().agent.searchStatusList(
				did,
				statusListName,
				listType,
				statusPurpose
			);

			// handle error
			if (result.error) {
				// handle notFound error
				if (result.error === 'notFound') {
					return response.status(StatusCodes.NOT_FOUND).json({
						found: false,
						error: `search: error: status list '${statusListName}' not found`,
					} satisfies SearchStatusListUnsuccessfulResponseBody);
				}

				// handle generic error
				return response.status(StatusCodes.BAD_REQUEST).json({
					found: false,
					error: `search: error: ${result.error}`,
				} satisfies SearchStatusListUnsuccessfulResponseBody);
			}

			// return result
			return response.status(StatusCodes.OK).json(result as SearchStatusListSuccessfulResponseBody);
		} catch (error) {
			// return catch-all error
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				found: false,
				error: `Internal error: ${(error as Record<string, unknown>)?.message || error}`,
			} satisfies SearchStatusListUnsuccessfulResponseBody);
		}
	}
}
