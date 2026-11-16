import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

/**
 * A small in-memory fixed-window rate limiter.
 *
 * Counters live in this process only. With more than one instance each instance enforces its own limit, so the
 * effective limit is the configured one multiplied by the number of instances; a shared store (for example Redis) or
 * an ingress-level limit is needed for an exact global figure.
 *
 * Behind a reverse proxy or load balancer, set TRUST_PROXY (see `trustProxySetting`) so that `request.ip` is the
 * client address and not the proxy's; otherwise every client shares one per-IP counter.
 */

export interface RateLimiterOptions {
	/** Window length in milliseconds */
	windowMs: number;
	/** Requests allowed per key and window */
	max: number;
	/** Counter key for a request, or undefined to not count it */
	key: (request: Request, response: Response) => string | undefined;
	/** Requests that are never counted (health, readiness, static documentation) */
	skip?: (request: Request) => boolean;
	now?: () => number;
	/** Upper bound on tracked keys; the oldest windows are dropped first when reached */
	maxKeys?: number;
}

interface Counter {
	count: number;
	resetAt: number;
}

const DEFAULT_MAX_KEYS = 100_000;

export function createRateLimiter(options: RateLimiterOptions): RequestHandler & { reset(): void } {
	const now = options.now ?? Date.now;
	const maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
	const counters = new Map<string, Counter>();

	const sweep = () => {
		const current = now();
		for (const [key, counter] of counters) if (counter.resetAt <= current) counters.delete(key);
	};
	const timer = setInterval(sweep, Math.max(options.windowMs, 1000));
	timer.unref();

	const handler = ((request: Request, response: Response, next: NextFunction) => {
		if (options.skip?.(request)) return next();
		const key = options.key(request, response);
		if (key === undefined) return next();

		const current = now();
		let counter = counters.get(key);
		if (!counter || counter.resetAt <= current) {
			if (counters.size >= maxKeys) {
				sweep();
				// Still full of live windows: drop the oldest entries rather than grow without bound
				for (const oldest of counters.keys()) {
					if (counters.size < maxKeys) break;
					counters.delete(oldest);
				}
			}
			counter = { count: 0, resetAt: current + options.windowMs };
			counters.set(key, counter);
		}
		counter.count++;

		const retryAfter = Math.max(1, Math.ceil((counter.resetAt - current) / 1000));
		response.setHeader('RateLimit-Limit', String(options.max));
		response.setHeader('RateLimit-Remaining', String(Math.max(0, options.max - counter.count)));
		response.setHeader('RateLimit-Reset', String(retryAfter));
		if (counter.count > options.max) {
			response.setHeader('Retry-After', String(retryAfter));
			return response
				.status(StatusCodes.TOO_MANY_REQUESTS)
				.json({ error: 'Too many requests. Try again later.', code: 'rate_limited' });
		}
		return next();
	}) as RequestHandler & { reset(): void };
	handler.reset = () => counters.clear();
	return handler;
}

// --------------------------------------------------------------------------------------------- configuration

export interface RateLimitConfig {
	enabled: boolean;
	windowSeconds: number;
	ipMax: number;
	customerMax: number;
}

type Env = Record<string, string | undefined>;

const positiveInt = (value: string | undefined, fallback: number, name: string): number => {
	if (!value?.trim()) return fallback;
	const parsed = Number(value);
	if (Number.isInteger(parsed) && parsed > 0) return parsed;
	console.warn(`Ignoring invalid ${name}="${value}": expected a positive whole number. Using ${fallback}.`);
	return fallback;
};

/**
 * Defaults: 1000 requests per minute per IP address and 600 per minute per customer. RATE_LIMIT_ENABLED=false turns
 * both off (for a deployment that limits at the ingress).
 */
export function rateLimitConfig(env: Env = process.env): RateLimitConfig {
	return {
		enabled: env.RATE_LIMIT_ENABLED !== 'false',
		windowSeconds: positiveInt(env.RATE_LIMIT_WINDOW_SECONDS, 60, 'RATE_LIMIT_WINDOW_SECONDS'),
		ipMax: positiveInt(env.RATE_LIMIT_IP_MAX, 1000, 'RATE_LIMIT_IP_MAX'),
		customerMax: positiveInt(env.RATE_LIMIT_CUSTOMER_MAX, 600, 'RATE_LIMIT_CUSTOMER_MAX'),
	};
}

/** Liveness, readiness and static documentation are never limited. */
const EXEMPT_PREFIXES = [
	'/health',
	'/healthz',
	'/ready',
	'/readyz',
	'/readiness',
	'/live',
	'/livez',
	'/swagger',
	'/admin/swagger',
];
export const isRateLimitExempt = (request: Pick<Request, 'path'>): boolean =>
	request.path === '/' ||
	EXEMPT_PREFIXES.some((prefix) => request.path === prefix || request.path.startsWith(`${prefix}/`));

/** Per-IP limiter. Mount it before body parsing and authentication. */
export function ipRateLimiter(config: RateLimitConfig = rateLimitConfig()) {
	return createRateLimiter({
		windowMs: config.windowSeconds * 1000,
		max: config.ipMax,
		skip: isRateLimitExempt,
		key: (request) => `ip:${request.ip ?? request.socket?.remoteAddress ?? 'unknown'}`,
	});
}

/** Per-customer limiter. Mount it after authentication; requests with no customer are left to the IP limiter. */
export function customerRateLimiter(config: RateLimitConfig = rateLimitConfig()) {
	return createRateLimiter({
		windowMs: config.windowSeconds * 1000,
		max: config.customerMax,
		skip: isRateLimitExempt,
		key: (_request, response) => {
			const customerId = response.locals?.customer?.customerId;
			return typeof customerId === 'string' ? `customer:${customerId}` : undefined;
		},
	});
}

/**
 * Value for Express's `trust proxy` setting from TRUST_PROXY: unset leaves it off, a whole number is the number of
 * proxy hops, "true" or "false" are booleans, and anything else (an address list or preset such as "loopback") is
 * passed to Express as it is.
 */
export function trustProxySetting(value: string | undefined): boolean | number | string | undefined {
	if (!value?.trim()) return undefined;
	if (value === 'true') return true;
	if (value === 'false') return false;
	return /^\d+$/.test(value) ? Number(value) : value;
}
