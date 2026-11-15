import { CORS_ERROR_MSG } from '../types/constants.js';

const LOG_WINDOW_MS = 60_000;
const MAX_TRACKED_ORIGINS = 1000;
const MAX_LOGGED_ORIGIN_LENGTH = 200;

export type OriginCallback = (error: Error | null, allow?: boolean) => void;

export interface OriginCheckOptions {
	/** The `CORS_ALLOWED_ORIGINS` value: a comma separated list. */
	allowedOrigins: string;
	log?: (line: string) => void;
	now?: () => number;
	windowMs?: number;
}

/** An origin is attacker-controlled text: strip anything that could split or forge a log line, and bound its length. */
function printable(origin: string): string {
	// eslint-disable-next-line no-control-regex
	return origin.replace(/[\u0000-\u001f\u007f]/g, '?').slice(0, MAX_LOGGED_ORIGIN_LENGTH);
}

/**
 * The `origin` callback for the `cors` middleware. The matching rules are unchanged (a request without an `Origin`
 * header passes; otherwise the origin must be found in the list). A rejected origin is logged once per window, with
 * the origin only: never the allow-list, headers or tokens. The response to the caller is not changed.
 */
export function createOriginCheck(options: OriginCheckOptions) {
	const log = options.log ?? ((line: string) => console.warn(line));
	const now = options.now ?? Date.now;
	const windowMs = options.windowMs ?? LOG_WINDOW_MS;
	const lastLogged = new Map<string, number>();

	function logRejection(origin: string): void {
		const at = now();
		const previous = lastLogged.get(origin);
		if (previous !== undefined && at - previous < windowMs) return;
		if (lastLogged.size >= MAX_TRACKED_ORIGINS) {
			for (const [key, loggedAt] of lastLogged) if (at - loggedAt >= windowMs) lastLogged.delete(key);
			// Every tracked origin is still inside its window: drop the oldest so the map stays bounded
			if (lastLogged.size >= MAX_TRACKED_ORIGINS) lastLogged.delete(lastLogged.keys().next().value as string);
		}
		lastLogged.set(origin, at);
		log(`CORS: origin ${printable(origin)} is not in CORS_ALLOWED_ORIGINS`);
	}

	return (origin: string | undefined, callback: OriginCallback): void => {
		if (!origin) return callback(null, true);
		for (const allowed of options.allowedOrigins.split(',')) {
			if (allowed.indexOf(origin) !== -1) return callback(null, true);
		}
		logRejection(origin);
		return callback(new Error(CORS_ERROR_MSG), false);
	};
}
