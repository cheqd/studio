import { describe, expect, it, jest } from '@jest/globals';
import { lazyRuntime } from '../../../../src/services/identity/engine/credo/factory.js';
import { enforceCredoRuntime } from '../../../../src/services/identity/engine/credo/boot.js';
import type { CredoRuntime } from '../../../../src/services/identity/engine/credo/ports.js';
import { FakeRuntime } from './fakes.js';

/** A start that the test finishes by hand, so calls can pile up while it is in flight */
function controlledStart() {
	let finish!: (runtime: CredoRuntime) => void;
	let fail!: (error: Error) => void;
	const start = jest.fn(
		() =>
			new Promise<CredoRuntime>((resolve, reject) => {
				finish = resolve;
				fail = reject;
			})
	);
	return { start, finish: (r: CredoRuntime) => finish(r), fail: (e: Error) => fail(e) };
}

describe('lazyRuntime (U-68)', () => {
	it('shares one start between concurrent first calls', async () => {
		const { start, finish } = controlledStart();
		const runtime = lazyRuntime(start);
		const fake = new FakeRuntime();

		const calls = Promise.all([
			runtime.ready(),
			runtime.resolveDid('did:cheqd:testnet:a'),
			runtime.createTenant('one'),
			runtime.createTenant('two'),
			runtime.ready(),
		]);
		finish(fake);
		await calls;

		expect(start).toHaveBeenCalledTimes(1);
		expect(fake.tenants).toHaveLength(2);
		await runtime.createTenant('three');
		expect(start).toHaveBeenCalledTimes(1);
	});

	it('does not cache a failed start: every waiting caller gets the error, the next call starts again', async () => {
		const first = controlledStart();
		let attempt = 0;
		const fake = new FakeRuntime();
		const start = jest.fn(() => (++attempt === 1 ? first.start() : Promise.resolve(fake as CredoRuntime)));
		const runtime = lazyRuntime(start);

		const waiting = [runtime.ready(), runtime.createTenant('x')];
		first.fail(new Error('Error connecting to database pool'));
		for (const call of waiting) await expect(call).rejects.toThrow('Error connecting to database pool');

		await runtime.ready();
		expect(start).toHaveBeenCalledTimes(2);
	});
});

describe('enforceCredoRuntime (U-68)', () => {
	const configured = { ENABLE_EXTERNAL_DB: 'true', CREDO_DB_USER: 'credo_app', CREDO_STORE_KEY: 'k' };

	it('opens the store at boot when Credo storage is configured', async () => {
		const start = jest.fn(async () => {});
		const log = jest.fn();
		const exit = jest.fn();
		await enforceCredoRuntime({ env: configured, start, log, error: jest.fn(), exit });
		expect(start).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith('Credo runtime: store open');
		expect(exit).not.toHaveBeenCalled();
	});

	it('stops the boot with a one-line reason when the store cannot be opened', async () => {
		const error = jest.fn();
		const exit = jest.fn();
		await enforceCredoRuntime({
			env: configured,
			start: async () => {
				throw new Error('Error connecting to database pool\nCaused by: password authentication failed');
			},
			log: jest.fn(),
			error,
			exit,
		});
		expect(exit).toHaveBeenCalledWith(1);
		expect(error).toHaveBeenCalledWith(
			'Credo runtime could not start, stopping: Error connecting to database pool / Caused by: password authentication failed'
		);
	});

	it('does not start Credo without the external database', async () => {
		const start = jest.fn(async () => {});
		await enforceCredoRuntime({ env: { CREDO_DB_USER: 'x' }, start, log: jest.fn(), error: jest.fn() });
		expect(start).not.toHaveBeenCalled();
	});

	it('warns and carries on when Credo storage is not configured at all', async () => {
		const start = jest.fn(async () => {});
		const error = jest.fn();
		const exit = jest.fn();
		await enforceCredoRuntime({ env: { ENABLE_EXTERNAL_DB: 'true' }, start, log: jest.fn(), error, exit });
		expect(start).not.toHaveBeenCalled();
		expect(exit).not.toHaveBeenCalled();
		expect(error).toHaveBeenCalledWith(expect.stringContaining('Credo storage is not configured'));
	});
});
