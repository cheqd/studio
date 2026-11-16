import { describe, expect, it, jest } from '@jest/globals';

/**
 * Askar's native module registers process-global FFI types when it is evaluated, so evaluating it twice in one Jest
 * worker throws "Duplicate type name 'ByteBuffer'" (docs/testing-askar.md). If importing the engine, the factory or
 * the runtime ever evaluates it again, this module factory throws and the imports below fail.
 */
const evaluated = jest.fn();
jest.unstable_mockModule('@openwallet-foundation/askar-nodejs', () => {
	evaluated();
	throw new Error('askar-nodejs must not be evaluated by importing the Credo engine');
});

describe('Askar native module', () => {
	it('is not evaluated by importing the Credo factory (and so the runtime) or the router', async () => {
		await import('../../../../src/services/identity/engine/credo/factory.js');
		await import('../../../../src/services/identity/engine/engine-router.js');
		expect(evaluated).not.toHaveBeenCalled();
	});

	it('fails loudly, and is retried, when loadAskar cannot load the native module', async () => {
		const { loadAskar } = await import('../../../../src/services/identity/engine/credo/askar-native.js');
		await expect(loadAskar()).rejects.toThrow();
		await expect(loadAskar()).rejects.toThrow();
		expect(evaluated).toHaveBeenCalled();
		// let the sibling import that loadAskar started finish before the environment is torn down
		await import('@credo-ts/askar');
	});
});
