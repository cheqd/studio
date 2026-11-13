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

/** The caller asked for something that is not theirs, or that does not exist. Deliberately the same message for both. */
export class CredoOwnershipError extends Error {
	constructor(what: string) {
		super(`${what} not found in wallet`);
		this.name = 'CredoOwnershipError';
	}
}
