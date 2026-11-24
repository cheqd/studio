import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { StatusCodes } from 'http-status-codes';
import { currentRequestContext } from '../services/request-context.js';

/**
 * Keeps internal error details out of 500 responses (S16, #834). Controllers often answer an unexpected failure with
 * `Internal error: ${error.message}`, and that message can come from the database driver, Stripe or another library.
 * This middleware replaces the body of every 500 response with a generic message and an error id, and logs the
 * original body with that id, so support can find the detail from what the caller reports.
 *
 * Deliberate messages are untouched: every 4xx response, and the other 5xx statuses (501, 502, 503, 504), which code
 * chooses on purpose with a message written for the caller.
 */

export const INTERNAL_ERROR_MESSAGE = 'Internal error. Quote the errorId when contacting support.';

export interface InternalErrorBody {
	error: string;
	errorId: string;
	/** Kept from the original body when it was a short machine-readable code. */
	code?: string;
}

const SAFE_CODE = /^[A-Za-z0-9_.:-]{1,64}$/;
const sanitised = new WeakSet<object>();

/** Logs the detail with a new error id and returns the body to send instead. */
export function internalErrorBody(request: Request, detail: unknown): InternalErrorBody {
	const errorId = randomUUID();
	const requestId = currentRequestContext()?.requestId;
	console.error(
		`Internal error ${errorId} on ${request.method} ${request.path}${requestId ? ` (request ${requestId})` : ''}:`,
		detail
	);
	// A code a controller put in its response body is a stable identifier meant for the caller; a thrown error's code
	// (a driver or system code) is not, so only the former is kept.
	const code = detail instanceof Error ? undefined : (detail as { code?: unknown } | null | undefined)?.code;
	const body: InternalErrorBody = {
		error: INTERNAL_ERROR_MESSAGE,
		errorId,
		...(typeof code === 'string' && SAFE_CODE.test(code) ? { code } : {}),
	};
	sanitised.add(body);
	return body;
}

/** Wraps `response.json` (which `response.send` uses for objects) and `response.send` for text bodies. */
export function hideInternalErrors(request: Request, response: Response, next: NextFunction): void {
	const json = response.json.bind(response);
	const send = response.send.bind(response);
	let inJson = false;

	response.json = (body?: unknown) => {
		inJson = true;
		try {
			if (response.statusCode === StatusCodes.INTERNAL_SERVER_ERROR && !isSanitised(body)) {
				return json(internalErrorBody(request, body));
			}
			return json(body);
		} finally {
			inJson = false;
		}
	};

	response.send = (body?: unknown) => {
		if (
			!inJson &&
			response.statusCode === StatusCodes.INTERNAL_SERVER_ERROR &&
			(typeof body === 'string' || Buffer.isBuffer(body))
		) {
			return response.json(String(body));
		}
		return send(body);
	};

	next();
}

/**
 * The last error handler: an error a route threw or passed to `next` becomes a 500 with a generic body. HTTP errors
 * that are meant for the caller (4xx with `expose`, such as a malformed JSON body) keep their status and message.
 */
export function internalErrorHandler(error: unknown, request: Request, response: Response, next: NextFunction): void {
	if (response.headersSent) return next(error);
	const status =
		(error as { status?: unknown; statusCode?: unknown })?.status ??
		(error as { statusCode?: unknown })?.statusCode;
	if (typeof status === 'number' && status >= 400 && status < 500 && (error as { expose?: unknown }).expose) {
		response.status(status).json({ error: (error as Error).message });
		return;
	}
	response.status(StatusCodes.INTERNAL_SERVER_ERROR).json(internalErrorBody(request, error));
}

function isSanitised(body: unknown): boolean {
	return typeof body === 'object' && body !== null && sanitised.has(body);
}
