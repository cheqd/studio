import { describe, expect, it } from '@jest/globals';
import {
	DEFAULT_LOCK_POOL,
	DEFAULT_MAIN_POOL,
	loadLockPoolSettings,
	loadMainPoolSettings,
	toPgPoolExtra,
} from '../../../../src/database/config/pool-config.js';

describe('pool settings', () => {
	it('use the documented defaults when nothing is set', () => {
		expect(loadMainPoolSettings({})).toEqual(DEFAULT_MAIN_POOL);
		expect(loadLockPoolSettings({})).toEqual(DEFAULT_LOCK_POOL);
		expect(DEFAULT_MAIN_POOL).toEqual({ max: 10, idleTimeoutMillis: 10_000, connectionTimeoutMillis: 30_000 });
	});

	it('read each value from its own variable', () => {
		const main = loadMainPoolSettings({
			EXTERNAL_DB_POOL_MAX: '25',
			EXTERNAL_DB_POOL_IDLE_TIMEOUT_MS: '5000',
			EXTERNAL_DB_POOL_CONNECTION_TIMEOUT_MS: '7000',
		});
		expect(toPgPoolExtra(main)).toEqual({ max: 25, idleTimeoutMillis: 5000, connectionTimeoutMillis: 7000 });
		expect(loadLockPoolSettings({ EXTERNAL_DB_LOCK_POOL_MAX: '4' }).max).toBe(4);
	});

	it('treat a blank value as unset', () => {
		expect(loadMainPoolSettings({ EXTERNAL_DB_POOL_MAX: '  ' }).max).toBe(DEFAULT_MAIN_POOL.max);
	});

	it.each(['0', '-1', 'abc', '1.5'])('reject %s, naming the variable', (value) => {
		expect(() => loadMainPoolSettings({ EXTERNAL_DB_POOL_MAX: value })).toThrow(/EXTERNAL_DB_POOL_MAX/);
		expect(() => loadLockPoolSettings({ EXTERNAL_DB_LOCK_POOL_MAX: value })).toThrow(/EXTERNAL_DB_LOCK_POOL_MAX/);
	});
});
