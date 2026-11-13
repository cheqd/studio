import type { NextFunction, Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

export const ENCRYPTED_STATUS_LIST_DEPRECATION_DATE_ENV = 'ENCRYPTED_STATUS_LIST_DEPRECATION_DATE';
export const ENCRYPTED_STATUS_LIST_SUNSET_DATE_ENV = 'ENCRYPTED_STATUS_LIST_SUNSET_DATE';
// Used when ENCRYPTED_STATUS_LIST_DEPRECATION_DATE is unset or invalid: the start of the phase 0 deploy week.
export const ENCRYPTED_STATUS_LIST_DEFAULT_DEPRECATION_DATE = new Date('2026-11-16T00:00:00Z');

export interface DeprecationOptions {
	/** When the operation was deprecated. Sent as `Deprecation: @<unix-seconds>` (RFC 9745). */
	deprecatedAt: () => Date;
	/** When the operation stops working. Sent as `Sunset: <HTTP-date>` (RFC 8594). If undefined, no Sunset header and no 410. */
	sunsetAt: () => Date | undefined;
	/** Optional documentation URL, sent as `Link: <url>; rel="deprecation"`. */
	link?: string;
	/** Text for the 410 Gone error body. */
	message?: string;
	/** Clock, injectable for tests. */
	now?: () => Date;
}

/**
 * Parses a date from an environment variable. Unset or blank gives undefined silently; an unparseable value gives
 * undefined with a warning, so a typo never turns into a surprise 410.
 */
export const parseDateEnv = (value: string | undefined, name: string): Date | undefined => {
	if (!value?.trim()) return undefined;
	const parsed = new Date(value.trim());
	if (Number.isNaN(parsed.getTime())) {
		console.warn(`Ignoring invalid ${name}="${value}": expected an ISO 8601 date, e.g. 2026-11-30T00:00:00Z.`);
		return undefined;
	}
	return parsed;
};

/**
 * Express middleware that marks a route as deprecated: adds `Deprecation`, `Sunset` and optional `Link` headers, and
 * answers 410 Gone once the sunset date has passed. Dates are read per request, so they are configuration-driven.
 */
export const deprecation = (options: DeprecationOptions) => {
	const now = options.now ?? (() => new Date());
	return (_request: Request, response: Response, next: NextFunction) => {
		const sunsetAt = options.sunsetAt();
		response.setHeader('Deprecation', `@${Math.floor(options.deprecatedAt().getTime() / 1000)}`);
		if (sunsetAt) response.setHeader('Sunset', sunsetAt.toUTCString());
		if (options.link) response.append('Link', `<${options.link}>; rel="deprecation"`);

		if (sunsetAt && now().getTime() >= sunsetAt.getTime()) {
			return response.status(StatusCodes.GONE).json({
				error: options.message ?? 'This operation has been removed.',
			});
		}
		return next();
	};
};

/** D2: encrypted (paid-access) status list creation is deprecated. Existing encrypted lists are unaffected. */
export const deprecateEncryptedStatusListCreation = deprecation({
	deprecatedAt: () =>
		parseDateEnv(
			process.env[ENCRYPTED_STATUS_LIST_DEPRECATION_DATE_ENV],
			ENCRYPTED_STATUS_LIST_DEPRECATION_DATE_ENV
		) ?? ENCRYPTED_STATUS_LIST_DEFAULT_DEPRECATION_DATE,
	sunsetAt: () =>
		parseDateEnv(process.env[ENCRYPTED_STATUS_LIST_SUNSET_DATE_ENV], ENCRYPTED_STATUS_LIST_SUNSET_DATE_ENV),
	message:
		'Creating encrypted (paid-access) status lists has been deprecated and is no longer available. ' +
		'Create an unencrypted status list with POST /credential-status/create/unencrypted instead. ' +
		'Existing encrypted status lists can still be read, checked and updated.',
});
