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

/**
 * Extra signers (`publicKeyHexs` on DID update, DID deactivate and resource create) are not passed through the Credo
 * registrar yet, so a Credo DID refuses them instead of ignoring them: ignored, a multi-controller update would be
 * sent with too few signatures and fail at the ledger, or succeed without the signer the caller asked for.
 */
export class CredoExtraSignersNotSupportedError extends Error {
	readonly code = 'extra_signers_not_supported';
	readonly status = 400;

	constructor() {
		super(
			'Extra signers (publicKeyHexs) are not supported for this identifier yet: every key in publicKeyHexs must be an authentication key of the DID itself. Send the request without the other keys.'
		);
		this.name = 'CredoExtraSignersNotSupported';
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

/**
 * The customer row points at a Credo tenant (`customer.credoTenantId`) that is not in Credo's Askar store. The
 * engine does not create a replacement: a new tenant would be empty, so every DID and key the customer made in the
 * old one would silently stop working. An operator has to restore the tenant or decide to reset it. Raised before
 * anything is written, so an idempotent request is not kept (`nothingWritten`).
 */
export class CredoTenantMissingError extends Error {
	readonly status = 500;
	readonly code = 'credo_tenant_missing';
	readonly nothingWritten = true;

	constructor(readonly tenantId: string) {
		super('The identity engine record for this account is missing. Contact support; nothing was changed.');
		this.name = 'CredoTenantMissingError';
	}
}

/** Turns Credo's "TenantRecord: record with id <id> not found" for this tenant into `CredoTenantMissingError`. */
export function asTenantMissing(tenantId: string, error: unknown): unknown {
	const message = error instanceof Error ? error.message : '';
	return message.startsWith(`TenantRecord: record with id ${tenantId} not found`)
		? new CredoTenantMissingError(tenantId)
		: error;
}

/**
 * A presentation was submitted for verification without the verifier's own challenge (or, unless the audience check
 * is switched off by policy, without the domain it is meant for). The presentation's own nonce is never used in its
 * place: that would make the check succeed for any presentation and give no replay or audience protection.
 */
export class PresentationBindingRequiredError extends Error {
	readonly status = 400;
	readonly code = 'invalid_request';

	constructor(readonly missing: 'challenge' | 'domain') {
		super(
			missing === 'challenge'
				? 'challenge is required: pass the challenge you issued to the holder'
				: 'verifierDid is required as the domain the presentation was made for, unless policies.audience is false'
		);
		this.name = 'PresentationBindingRequiredError';
	}
}
