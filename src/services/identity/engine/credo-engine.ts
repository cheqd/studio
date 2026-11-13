import type { IdentityEngine } from './identity-engine.js';

export class EngineNotImplementedError extends Error {
	constructor(engine: string, method: string) {
		super(
			`Identity engine '${engine}' is not implemented: ${method}() is unavailable. This engine must not be selected until it is built.`
		);
		this.name = 'EngineNotImplementedError';
	}
}

/**
 * The placeholder that stood in for the Credo engine before it was built. The router no longer uses it (the real
 * `CredoEngine` is in `./credo/`); it stays as a test double that fails loudly on any call.
 */
export function createCredoEngineStub(): IdentityEngine {
	return new Proxy({ name: 'credo' } as unknown as IdentityEngine, {
		get(target, property, receiver) {
			if (property === 'name') return 'credo';
			if (typeof property === 'symbol' || property === 'then' || property === 'toJSON') {
				return Reflect.get(target, property, receiver);
			}
			return async () => {
				throw new EngineNotImplementedError('credo', property);
			};
		},
	});
}
