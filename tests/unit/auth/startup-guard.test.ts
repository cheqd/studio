import { describe, expect, it, jest } from '@jest/globals';
import {
	assertSecureStartup,
	evaluateStartupGuard,
	INSECURE_OVERRIDE_VARIABLE,
} from '../../../src/helpers/startup-guard.js';

const secure = { NODE_ENV: 'production', ENABLE_AUTHENTICATION: 'true', ENABLE_EXTERNAL_DB: 'true' };

describe('startup guard', () => {
	it('allows production with authentication and the external database on', () => {
		expect(evaluateStartupGuard(secure)).toEqual({ ok: true, overridden: false });
	});

	it.each([
		['authentication off', { ...secure, ENABLE_AUTHENTICATION: 'false' }],
		['authentication unset', { ...secure, ENABLE_AUTHENTICATION: undefined }],
		['authentication mistyped', { ...secure, ENABLE_AUTHENTICATION: 'True' }],
		['external database off', { ...secure, ENABLE_EXTERNAL_DB: 'false' }],
		['external database numeric', { ...secure, ENABLE_EXTERNAL_DB: '1' }],
	])('refuses production with %s', (_name, env) => {
		const result = evaluateStartupGuard(env);
		expect(result.ok).toBe(false);
		expect(result.reason).toContain('not fully enabled');
	});

	it.each([
		['development', { NODE_ENV: 'development' }],
		['test', { NODE_ENV: 'test' }],
		['unset (local end-to-end harness)', { ENABLE_AUTHENTICATION: 'false', ENABLE_EXTERNAL_DB: 'false' }],
	])('does not trip in %s', (_name, env) => {
		expect(evaluateStartupGuard(env)).toEqual({ ok: true, overridden: false });
	});

	it('continues with a warning when the explicit override is set', () => {
		const log = { error: jest.fn(), warn: jest.fn() };
		assertSecureStartup({ NODE_ENV: 'production', [INSECURE_OVERRIDE_VARIABLE]: 'true' }, log);
		expect(log.warn).toHaveBeenCalledTimes(1);
		expect(log.error).not.toHaveBeenCalled();
	});

	it('does not accept a loosely written override', () => {
		expect(evaluateStartupGuard({ NODE_ENV: 'production', [INSECURE_OVERRIDE_VARIABLE]: '1' }).ok).toBe(false);
	});

	it('logs one line and throws when refusing', () => {
		const log = { error: jest.fn(), warn: jest.fn() };
		expect(() => assertSecureStartup({ NODE_ENV: 'production' }, log)).toThrow('Refusing to start');
		expect(log.error).toHaveBeenCalledTimes(1);
		expect(String(log.error.mock.calls[0][0])).not.toContain('\n');
	});
});
