import type { NextFunction, Request, Response } from 'express';
import { logRoutingOutcome } from '../services/identity/engine/routing-log.js';
import { runWithRequestContext, startRequestContext } from '../services/request-context.js';

/**
 * Opens a request context for everything downstream and, when the response is sent, logs one line per engine
 * routing decision made during the request (engine spec 4.3). Adds no header and reads no body.
 */
export function requestContext(request: Request, response: Response, next: NextFunction): void {
	const context = startRequestContext(request.headers['x-request-id']);
	response.once('finish', () => {
		const customerId = (response.locals?.customer?.customerId as string | undefined) ?? context.customerId;
		logRoutingOutcome(context, { status: response.statusCode, customerId });
	});
	runWithRequestContext(context, () => next());
}
