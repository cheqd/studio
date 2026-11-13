/**
 * Thrown for every `IdentityEngine` method the Credo engine does not implement yet. It names the method, so a
 * caller (or a log line) says exactly what is missing. The router must not send such a call to the Credo engine.
 */
export class NotImplementedByEngineError extends Error {
	readonly engine: string;
	readonly method: string;

	constructor(engine: string, method: string) {
		super(`NotImplementedByEngine: the '${engine}' engine does not implement ${method}() yet`);
		this.name = 'NotImplementedByEngine';
		this.engine = engine;
		this.method = method;
	}
}

/**
 * The engine does not support what was asked for, and says exactly what. Unlike `NotImplementedByEngine` (not built
 * yet), this is a decision: the answer is `NotSupported` (HTTP 501, engine spec 3.3) until the decision changes.
 */
export class CredoNotSupportedError extends Error {
	readonly code = 'NotSupported';
	readonly status = 501;

	constructor(what: string) {
		super(`NotSupported: the 'credo' engine does not support ${what}`);
		this.name = 'NotSupported';
	}
}

/** The caller asked for something that is not theirs, or that does not exist. Deliberately the same message for both. */
export class CredoOwnershipError extends Error {
	constructor(what: string) {
		super(`${what} not found in wallet`);
		this.name = 'CredoOwnershipError';
	}
}

/**
 * Credo's storage is not configured, or is configured wrongly. The message names every variable that is missing or
 * invalid and says what to do, so an operator can fix it from the log line alone. The router treats it like any
 * other engine failure; it never stops Studio from starting while the Credo engine is not selected.
 */
export class CredoConfigurationError extends Error {
	readonly problems: string[];

	constructor(problems: string[]) {
		super(
			`Credo storage is not configured: ${problems.join('; ')}. ` +
				'See docs/credo-database-provisioning.md and example.env.'
		);
		this.name = 'CredoConfigurationError';
		this.problems = problems;
		// A configuration problem is reported by its message, not by where in the code it was noticed
		this.stack = `${this.name}: ${this.message}`;
	}
}
