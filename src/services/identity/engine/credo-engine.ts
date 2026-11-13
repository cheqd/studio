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
 * Placeholder for the Credo engine (migration plan, phase 1 step 2). Every call throws
 * `EngineNotImplementedError`. The router only returns it when a feature flag says `credo`, and no flag does
 * today. To plug the real engine in, replace this class with one that implements `IdentityEngine` and keep the
 * `CREDO_ENGINE_FACTORY` registration in `engine-router.ts` pointing at it.
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
