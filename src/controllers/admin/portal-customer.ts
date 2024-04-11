import * as dotenv from 'dotenv';
import type { Request, Response } from 'express';
import { check } from 'express-validator';
import { validationResult } from '../validator';
import type { PortalCustomerGetUnsuccessfulResponseBody } from '../../types/portal.js';

dotenv.config();

export class PortalCustomerController {
	static portalCustomerGetValidator = [
		check('logToUserId').optional().isString().withMessage('logToUserId should be a string').bail(),
	];

	async get(request: Request, response: Response) {
		const result = validationResult(request);
		// handle error
		if (!result.isEmpty()) {
			return response.status(400).json({
				error: result.array().pop()?.msg,
			} satisfies PortalCustomerGetUnsuccessfulResponseBody);
		}

		return response.status(500).json({
			error: 'Not implemented yet',
		});
	}
}
