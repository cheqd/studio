import express, { type RequestHandler } from 'express';

/**
 * JSON body parsing with a small default limit.
 *
 * Every route accepts JSON up to JSON_BODY_LIMIT (default 1mb). The few routes that legitimately carry more get
 * JSON_BODY_LIMIT_LARGE (default 10mb), and only those:
 *
 *   - POST /resource/create/:did   DID-Linked Resource content, sent encoded inside the JSON body
 *   - POST /credentials/import     batches of received credentials
 *   - POST /admin/webhook          payment-provider events, whose signature is checked against the raw body
 */
export const LARGE_BODY_ROUTES = ['/resource/create/:did', '/credentials/import', '/admin/webhook'] as const;

type Env = Record<string, string | undefined>;

export interface BodyLimits {
	defaultLimit: string;
	largeLimit: string;
}

export function bodyLimits(env: Env = process.env): BodyLimits {
	return {
		defaultLimit: env.JSON_BODY_LIMIT?.trim() || '1mb',
		largeLimit: env.JSON_BODY_LIMIT_LARGE?.trim() || '10mb',
	};
}

/** Parsers to mount in order. Large-limit routes come first: a parser skips a request that is already parsed. */
export function jsonBodyParsers(
	verify: (req: express.Request & { rawBody?: Buffer }, res: unknown, buf: Buffer) => void,
	limits: BodyLimits = bodyLimits()
): { path?: string; handler: RequestHandler }[] {
	const large = express.json({ limit: limits.largeLimit, verify: verify as never });
	const standard = express.json({ limit: limits.defaultLimit, verify: verify as never });
	return [...LARGE_BODY_ROUTES.map((path) => ({ path, handler: large })), { handler: standard }];
}
