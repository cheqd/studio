import { describe, expect, it } from '@jest/globals';
import {
	ResourceContentCache,
	getCachedAccreditation,
	setCachedAccreditation,
} from '../../../../src/services/identity/engine/accreditation-cache.js';

describe('setCachedAccreditation', () => {
	it('never throws when the cache is full, and keeps the newest entry', () => {
		for (let i = 0; i < 250; i++) expect(() => setCachedAccreditation(`full::${i}`, { i })).not.toThrow();
		expect(getCachedAccreditation('full::249')).toEqual({ i: 249 });
		expect(getCachedAccreditation('full::0')).toBeNull();
	});
});

describe('ResourceContentCache', () => {
	it('loads a URL once for concurrent callers and serves it from the cache afterwards', async () => {
		const cache = new ResourceContentCache<string>({ ttlMs: 1000, maxEntries: 10 });
		let loads = 0;
		const load = async () => {
			loads++;
			await new Promise((resolve) => setTimeout(resolve, 5));
			return 'content';
		};
		const answers = await Promise.all([cache.get('a', load), cache.get('a', load), cache.get('a', load)]);
		expect(answers).toEqual(['content', 'content', 'content']);
		expect(await cache.get('a', load)).toBe('content');
		expect(loads).toBe(1);
	});

	it('does not keep an empty answer or a failure', async () => {
		const cache = new ResourceContentCache<string>({ ttlMs: 1000, maxEntries: 10 });
		expect(await cache.get('a', async () => null)).toBeNull();
		await expect(
			cache.get('a', async () => {
				throw new Error('resolver down');
			})
		).rejects.toThrow('resolver down');
		expect(await cache.get('a', async () => 'now')).toBe('now');
	});

	it('expires entries and evicts the least recently used when full', async () => {
		let now = 0;
		const cache = new ResourceContentCache<string>({ ttlMs: 100, maxEntries: 2, now: () => now });
		await cache.get('a', async () => 'a1');
		await cache.get('b', async () => 'b1');
		await cache.get('a', async () => 'unused'); // a is now the most recently used
		await cache.get('c', async () => 'c1'); // evicts b
		expect(await cache.get('b', async () => 'b2')).toBe('b2');
		expect(await cache.get('c', async () => 'unused')).toBe('c1');
		now = 1000;
		expect(await cache.get('c', async () => 'c2')).toBe('c2');
	});
});
