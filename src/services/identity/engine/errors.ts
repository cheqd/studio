/**
 * Engine-neutral errors raised by the router itself (engine spec 3.3). Engines map their own failures into the
 * same model; these are the ones that never reach an engine.
 */

/** The operation was withdrawn and is refused whatever the engine. Maps to HTTP 410. */
export class EngineGoneError extends Error {
	readonly code = 'Gone';
	readonly status = 410;

	constructor(message: string) {
		super(message);
		this.name = 'Gone';
	}
}

/**
 * The engine recorded for an artefact, or the engine a flag selects, could not be read. Guessing would send a
 * request that may belong to the Credo engine to Veramo, so the request is refused instead: a retryable 503.
 * The message is safe to show to a caller; the cause stays in the log.
 */
export class EngineRoutingUnavailableError extends Error {
	readonly code = 'EngineRoutingUnavailable';
	readonly status = 503;
	readonly retryAfterSeconds = 5;

	constructor(
		message = 'The identity engine for this request could not be determined. Retry shortly.',
		readonly cause?: unknown
	) {
		super(message);
		this.name = 'EngineRoutingUnavailable';
	}
}

/** True for a Postgres "undefined table" or "undefined column": the engine bookkeeping has not been migrated yet. */
export function isMissingSchemaError(error: unknown): boolean {
	const code = (error as { code?: unknown; driverError?: { code?: unknown } } | null)?.code;
	const driverCode = (error as { driverError?: { code?: unknown } } | null)?.driverError?.code;
	return [code, driverCode].some((value) => value === '42703' || value === '42P01');
}

/** Logs a fail-closed routing decision. No identifiers or request data. */
export function logRoutingFailure(what: 'artifact' | 'flag', error: unknown): void {
	try {
		console.warn(
			JSON.stringify({
				event: 'engine-routing-failed',
				lookup: what,
				error: error instanceof Error ? error.message : String(error),
			})
		);
	} catch {
		/* logging must not change the outcome */
	}
}
