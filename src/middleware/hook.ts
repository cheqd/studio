import type { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';

import * as dotenv from 'dotenv';
import { verifyHookSignature } from '../helpers/helpers.js';

dotenv.config();

export class LogToWebHook {
	static async verifyHookSignature(request: Request, response: Response, next: NextFunction) {
		const logtoSignature = request.headers['logto-signature-sha-256'] as string;
		if (
			!verifyHookSignature(process.env.LOGTO_WEBHOOK_SECRET as string, request.rawBody.toString(), logtoSignature)
		) {
			return response.status(StatusCodes.BAD_REQUEST).json({
				error: 'Invalid signature in LogTo webhook',
			});
		}
		return next();
	}

	static getCustomerId(request: Request): string {
		const { body } = request;
		return body.user.id;
	}

	static isUserSuspended(request: Request): boolean {
		const { body } = request;
		return body.user.isSuspended;
	}
}
