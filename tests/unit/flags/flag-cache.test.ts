import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { FLAG_CACHE_FAILURE_PAUSE_MS, FLAG_CACHE_TTL_MS, FlagCache } from '../../../src/services/api/flag-cache.js';

beforeEach(() => {
	jest.useFakeTimers();
	jest.setSystemTime(new Date('2026-11-13T12:00:00Z'));
});
afterEach(() => {
	jest.useRealTimers();
});

const fallback = ['default'];

describe('FlagCache', () => {
	it('has a 5 second TTL', () => {
		expect(FLAG_CACHE_TTL_MS).toBe(5000);
	});

	it('reads once, then serves from memory until the TTL passes', async () => {
		const cache = new FlagCache<string[]>();
		const load = jest.fn(async () => ['credo']);
		expect(await cache.get('c1', load, fallback)).toEqual(['credo']);
		jest.advanceTimersByTime(4999);
		expect(await cache.get('c1', load, fallback)).toEqual(['credo']);
		expect(load).toHaveBeenCalledTimes(1);

		jest.advanceTimersByTime(2);
		await cache.get('c1', load, fallback);
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('picks up a changed value after the TTL, not before', async () => {
		const cache = new FlagCache<string[]>();
		let value = ['veramo'];
		const load = async () => value;
		await cache.get('c1', load, fallback);
		value = ['credo'];
		jest.advanceTimersByTime(3000);
		expect(await cache.get('c1', load, fallback)).toEqual(['veramo']);
		jest.advanceTimersByTime(2001);
		expect(await cache.get('c1', load, fallback)).toEqual(['credo']);
	});

	it('keeps customers apart', async () => {
		const cache = new FlagCache<string[]>();
		await cache.get('a', async () => ['a'], fallback);
		expect(await cache.get('b', async () => ['b'], fallback)).toEqual(['b']);
		expect(await cache.get('a', async () => ['changed'], fallback)).toEqual(['a']);
	});

	it('returns the last known value when a read fails, and never throws', async () => {
		const failures: boolean[] = [];
		const cache = new FlagCache<string[]>({ onFailure: (_k, _e, usedLastKnown) => failures.push(usedLastKnown) });
		await cache.get('c1', async () => ['credo'], fallback);
		jest.advanceTimersByTime(6000);
		const result = await cache.get(
			'c1',
			async () => {
				throw new Error('connection refused');
			},
			fallback
		);
		expect(result).toEqual(['credo']);
		expect(failures).toEqual([true]);

		// Still serving the last known value a minute into an outage
		jest.advanceTimersByTime(60_000);
		expect(
			await cache.get(
				'c1',
				async () => {
					throw new Error('still down');
				},
				fallback
			)
		).toEqual(['credo']);
	});

	it('uses the compiled default only when there is no last known value', async () => {
		const failures: boolean[] = [];
		const cache = new FlagCache<string[]>({ onFailure: (_k, _e, usedLastKnown) => failures.push(usedLastKnown) });
		const result = await cache.get(
			'c1',
			async () => {
				throw new Error('table missing');
			},
			fallback
		);
		expect(result).toBe(fallback);
		expect(failures).toEqual([false]);
	});

	it('recovers when the database comes back', async () => {
		const cache = new FlagCache<string[]>();
		let up = false;
		const load = async () => {
			if (!up) throw new Error('down');
			return ['credo'];
		};
		expect(await cache.get('c1', load, fallback)).toBe(fallback);
		up = true;
		jest.advanceTimersByTime(FLAG_CACHE_FAILURE_PAUSE_MS + 1);
		expect(await cache.get('c1', load, fallback)).toEqual(['credo']);
	});

	it('does not hammer a failing database: one retry per pause', async () => {
		const cache = new FlagCache<string[]>();
		await cache.get('c1', async () => ['credo'], fallback);
		jest.advanceTimersByTime(6000);
		const load = jest.fn(async () => {
			throw new Error('down');
		});
		for (let i = 0; i < 5; i++) await cache.get('c1', load, fallback);
		expect(load).toHaveBeenCalledTimes(1);
		jest.advanceTimersByTime(FLAG_CACHE_FAILURE_PAUSE_MS + 1);
		await cache.get('c1', load, fallback);
		expect(load).toHaveBeenCalledTimes(2);
	});

	it('shares one read between concurrent callers', async () => {
		const cache = new FlagCache<string[]>();
		let release: (value: string[]) => void = () => undefined;
		const load = jest.fn(() => new Promise<string[]>((resolve) => (release = resolve)));
		const calls = [
			cache.get('c1', load, fallback),
			cache.get('c1', load, fallback),
			cache.get('c1', load, fallback),
		];
		release(['credo']);
		expect(await Promise.all(calls)).toEqual([['credo'], ['credo'], ['credo']]);
		expect(load).toHaveBeenCalledTimes(1);
	});

	describe('invalidate (PUT /admin/flags on this instance)', () => {
		it('makes the very next read go to the database', async () => {
			const cache = new FlagCache<string[]>();
			let value = ['veramo'];
			const load = async () => value;
			await cache.get('c1', load, fallback);
			value = ['credo'];
			cache.invalidate();
			expect(await cache.get('c1', load, fallback)).toEqual(['credo']);
		});

		it('keeps the old value as last known if the next read fails', async () => {
			const cache = new FlagCache<string[]>();
			await cache.get('c1', async () => ['veramo'], fallback);
			cache.invalidate();
			expect(
				await cache.get(
					'c1',
					async () => {
						throw new Error('down');
					},
					fallback
				)
			).toEqual(['veramo']);
		});

		it('does not keep a read that began before the invalidation', async () => {
			const cache = new FlagCache<string[]>();
			let release: (value: string[]) => void = () => undefined;
			const slow = cache.get('c1', () => new Promise<string[]>((resolve) => (release = resolve)), fallback);
			cache.invalidate();
			release(['old']);
			expect(await slow).toEqual(['old']);
			expect(await cache.get('c1', async () => ['new'], fallback)).toEqual(['new']);
		});
	});

	describe('failClosed reads (routing)', () => {
		it('throws when the read fails and nothing is known', async () => {
			const cache = new FlagCache<string[]>();
			await expect(
				cache.get(
					'c1',
					async () => {
						throw new Error('down');
					},
					fallback,
					{ failClosed: true }
				)
			).rejects.toThrow('down');
		});

		it('still serves the last known value when the read fails', async () => {
			const cache = new FlagCache<string[]>();
			await cache.get('c1', async () => ['credo'], fallback, { failClosed: true });
			jest.advanceTimersByTime(FLAG_CACHE_TTL_MS + 1);
			const value = await cache.get(
				'c1',
				async () => {
					throw new Error('down');
				},
				fallback,
				{ failClosed: true }
			);
			expect(value).toEqual(['credo']);
		});

		it('does not let a lenient read hand its fallback to a strict caller sharing the key', async () => {
			const cache = new FlagCache<string[]>();
			const failing = async (): Promise<string[]> => {
				throw new Error('down');
			};
			const lenient = cache.get('c1', failing, fallback);
			const strict = cache.get('c1', failing, fallback, { failClosed: true });
			expect(await lenient).toEqual(fallback);
			await expect(strict).rejects.toThrow('down');
		});
	});
});
