import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { check, query } from 'express-validator';
import { validate } from '../validator/decorator.js';
import type {
	PublishRecordRequestBody,
	PublishRecordResponseBody,
	UnsuccessfulPublishRecordResponseBody,
	SearchRecordQuery,
	SearchRecordResponseBody,
	UnsuccessfulSearchRecordResponseBody,
	GetRecordParams,
	GetRecordQuery,
	GetRecordResponseBody,
	UnsuccessfulGetRecordResponseBody,
} from '../../types/oasf.js';
import { OasfService } from '../../services/api/oasf.js';

export class OasfController {
	// Validators
	public static recordPublishValidator = [
		check('data').exists().withMessage('data field is required').bail(),
		check('data.name')
			.exists()
			.withMessage('name is required')
			.isString()
			.withMessage('name must be a string')
			.bail(),
		check('data.version')
			.exists()
			.withMessage('version is required')
			.matches(/^\d+\.\d+\.\d+$/)
			.withMessage('version must follow semantic versioning (e.g., 1.0.0)')
			.bail(),
		check('data.schema_version')
			.exists()
			.withMessage('schema_version is required')
			.isString()
			.withMessage('schema_version must be a string')
			.bail(),
		check('data.description').optional().isString().withMessage('description must be a string').bail(),
		check('data.authors').optional().isArray().withMessage('authors must be an array').bail(),
		check('data.type')
			.optional()
			.isString()
			.isIn(['agent', 'organization', 'service', 'mcp-server'])
			.withMessage('Invalid record type')
			.bail(),
		check('data.skills').optional().isArray().withMessage('skills must be an array').bail(),
		check('data.locators').optional().isArray().withMessage('locators must be an array').bail(),
		check('data.domains').optional().isArray().withMessage('domains must be an array').bail(),
		check('data.modules').optional().isArray().withMessage('modules must be an array').bail(),
	];

	public static recordSearchValidator = [
		query('name').optional().isString().withMessage('name must be a string').bail(),
		query('version').optional().isString().withMessage('version must be a string').bail(),
		query('skill').optional().isString().withMessage('skill must be a string').bail(),
		query('skill_id').optional().isInt().withMessage('skill_id must be an integer').bail(),
		query('domain').optional().isString().withMessage('domain must be a string').bail(),
		query('locator').optional().isString().withMessage('locator must be a string').bail(),
		query('module').optional().isString().withMessage('module must be a string').bail(),
		query('type')
			.optional()
			.isString()
			.isIn(['agent', 'organization', 'service', 'mcp-server'])
			.withMessage('Invalid record type')
			.bail(),
		query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer').bail(),
		query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100').bail(),
	];

	public static recordGetValidator = [
		check('cid')
			.exists()
			.withMessage('cid was not provided')
			.isString()
			.withMessage('cid must be a string')
			.notEmpty()
			.withMessage('cid cannot be empty')
			.bail(),
		query('verify').optional().isBoolean().withMessage('verify must be a boolean').bail(),
	];

	/**
	 * @openapi
	 *
	 * /oasf/publish:
	 *   post:
	 *     tags: [ Records ]
	 *     summary: Publish an OASF record to the directory.
	 *     description: This endpoint publishes an OASF-compliant record to the Agent Directory. The record can represent an agent, organization, service, or MCP server.
	 *     requestBody:
	 *       content:
	 *         application/x-www-form-urlencoded:
	 *           schema:
	 *             $ref: '#/components/schemas/PublishRecordRequest'
	 *         application/json:
	 *           schema:
	 *             $ref: '#/components/schemas/PublishRecordRequest'
	 *     responses:
	 *       201:
	 *         description: The record was successfully published.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/PublishRecordResult'
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
	public async publishRecord(request: Request, response: Response) {
		const record = request.body as PublishRecordRequestBody;

		// Get directory service
		const oasfService = new OasfService();

		try {
			// Validate against OASF schema (optional)
			const isValid = await oasfService.validateOASFSchema(record);
			if (!isValid) {
				return response.status(StatusCodes.BAD_REQUEST).json({
					error: 'Record does not conform to OASF schema',
				} satisfies UnsuccessfulPublishRecordResponseBody);
			}

			// Publish to directory
			const result = await oasfService.publish(response.locals.customer, record);

			// Return the response
			return response.status(StatusCodes.CREATED).json({
				success: true,
				cid: result.cid,
				message: 'Record published successfully',
				data: {
					name: record.data.name,
					version: record.data.version,
					cid: result.cid,
					published_at: new Date().toISOString(),
				},
			} satisfies PublishRecordResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies UnsuccessfulPublishRecordResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /oasf/search:
	 *   get:
	 *     tags: [ Records ]
	 *     summary: Search for records in the directory.
	 *     description: This endpoint searches for OASF records in the Agent Directory based on various criteria such as name, version, skills, domains, and more.
	 *     parameters:
	 *       - name: name
	 *         description: Name of the record to search for.
	 *         in: query
	 *         schema:
	 *           type: string
	 *       - name: version
	 *         description: Version of the record to search for.
	 *         in: query
	 *         schema:
	 *           type: string
	 *       - name: skill
	 *         description: Skill name to filter by.
	 *         in: query
	 *         schema:
	 *           type: string
	 *       - name: skill_id
	 *         description: Skill ID to filter by.
	 *         in: query
	 *         schema:
	 *           type: integer
	 *       - name: domain
	 *         description: Domain to filter by.
	 *         in: query
	 *         schema:
	 *           type: string
	 *       - name: locator
	 *         description: Locator type to filter by.
	 *         in: query
	 *         schema:
	 *           type: string
	 *       - name: module
	 *         description: Module name to filter by.
	 *         in: query
	 *         schema:
	 *           type: string
	 *       - name: type
	 *         description: Type of record to filter by.
	 *         in: query
	 *         schema:
	 *           type: string
	 *           enum:
	 *              - agent
	 *              - organization
	 *              - service
	 *              - mcp-server
	 *       - name: page
	 *         description: Page number for pagination (default 1).
	 *         in: query
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *       - name: limit
	 *         description: Number of results per page (default 20, max 100).
	 *         in: query
	 *         schema:
	 *           type: integer
	 *           minimum: 1
	 *           maximum: 100
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/SearchRecordResult'
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
	public async searchRecord(request: Request, response: Response) {
		const query = request.query as SearchRecordQuery;

		// Get directory service
		const oasfService = new OasfService();

		try {
			// Set defaults for pagination
			const { page = 1, limit = 20 } = request.query as SearchRecordQuery;

			// Search directory
			const results = await oasfService.search({
				...query,
				page,
				limit,
			});

			// Return paginated results
			return response.status(StatusCodes.OK).json({
				success: true,
				data: results.records,
				pagination: {
					page,
					limit,
					total: results.total,
					total_pages: Math.ceil(results.total / limit),
				},
			} satisfies SearchRecordResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies UnsuccessfulSearchRecordResponseBody);
		}
	}

	/**
	 * @openapi
	 *
	 * /oasf/{cid}:
	 *   get:
	 *     tags: [ Records ]
	 *     summary: Fetch a record by CID.
	 *     description: This endpoint fetches a specific OASF record from the Agent Directory using its Content Identifier (CID). Optionally, the record's signature can be verified.
	 *     parameters:
	 *       - name: cid
	 *         description: Content Identifier (CID) of the record to fetch.
	 *         in: path
	 *         schema:
	 *           type: string
	 *         required: true
	 *       - name: verify
	 *         description: Whether to verify the record's signature.
	 *         in: query
	 *         schema:
	 *           type: boolean
	 *     responses:
	 *       200:
	 *         description: The request was successful.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/GetRecordResult'
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
	 *       404:
	 *         description: The record was not found.
	 *         content:
	 *           application/json:
	 *             schema:
	 *               $ref: '#/components/schemas/InvalidRequest'
	 *             example:
	 *               error: Record not found
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
	public async getRecord(request: Request, response: Response) {
		const { cid } = request.params as unknown as GetRecordParams;
		const { verify } = request.query as GetRecordQuery;

		// Get directory service
		const oasfService = new OasfService();

		try {
			// Fetch record from directory
			const record = await oasfService.getRecord(cid);

			if (!record) {
				return response.status(StatusCodes.NOT_FOUND).json({
					error: `Record with CID: ${cid} not found`,
				} satisfies UnsuccessfulGetRecordResponseBody);
			}

			// Optional: Verify signature
			let verificationResult = null;
			if (verify === 'true' || verify === true) {
				verificationResult = await oasfService.verifyRecord(cid);
			}

			// Return record with metadata
			return response.status(StatusCodes.OK).json({
				success: true,
				data: record,
				metadata: {
					cid,
					retrieved_at: new Date().toISOString(),
					verified: verificationResult?.verified || null,
					signature: verificationResult || null,
				},
			} satisfies GetRecordResponseBody);
		} catch (error) {
			return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
				error: `Internal error: ${(error as Error)?.message || error}`,
			} satisfies UnsuccessfulGetRecordResponseBody);
		}
	}
}
