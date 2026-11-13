import { describe, expect, it } from '@jest/globals';
import { pickEngine, resolveFlags, validateFlagWrite } from '../../../src/services/api/feature-flag.js';
import type { FlagRow } from '../../../src/services/api/feature-flag.js';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const row = (
	flagKey: string,
	value: Record<string, unknown>,
	customerId: string | null = null,
	route: string | null = null
): FlagRow => ({
	flagKey,
	value,
	customerId,
	route,
});

describe('flag resolution', () => {
	it('defaults to veramo and the classic UI with no rows', () => {
		const flags = resolveFlags([], A);
		expect(flags.ui).toBe('classic');
		expect(flags.engine.default).toBe('veramo');
		expect(Object.values(flags.engine.routes).every((e) => e === 'veramo')).toBe(true);
	});

	it('prefers the most specific row: customer+route, customer, global+route, global', () => {
		const rows = [
			row('engine', { engine: 'veramo' }),
			row('engine', { engine: 'credo' }, null, 'did'),
			row('engine', { engine: 'veramo' }, A),
			row('engine', { engine: 'credo' }, A, 'credential'),
		];
		expect(pickEngine(rows, A, 'credential')).toBe('credo');
		expect(pickEngine(rows, A, 'did')).toBe('veramo');
		expect(pickEngine(rows, B, 'did')).toBe('credo');
		expect(pickEngine(rows, B, 'credential')).toBe('veramo');
	});

	it("never applies another customer's override", () => {
		const rows = [row('engine', { engine: 'credo' }, B)];
		expect(pickEngine(rows, A, 'did')).toBeUndefined();
		expect(resolveFlags(rows, A).engine.routes.did).toBe('veramo');
	});

	it('ignores invalid stored values', () => {
		const rows = [row('engine', { engine: 'bogus' }), row('ui', { ui: 'bogus' })];
		const flags = resolveFlags(rows, A);
		expect(flags.engine.default).toBe('veramo');
		expect(flags.ui).toBe('classic');
	});

	it('applies the ui flag with customer override over global', () => {
		const rows = [row('ui', { ui: 'new' }), row('ui', { ui: 'classic' }, A)];
		expect(resolveFlags(rows, A).ui).toBe('classic');
		expect(resolveFlags(rows, B).ui).toBe('new');
	});
});

describe('flag write validation', () => {
	const ok = { flagKey: 'engine', value: { engine: 'credo' }, route: 'did', customerId: A, reason: 'tester' };

	it('accepts a valid engine flag and normalises absent fields to null', () => {
		expect(validateFlagWrite(ok)).toEqual({ ok: true, write: ok });
		const minimal = validateFlagWrite({ flagKey: 'ui', value: { ui: 'new' }, reason: 'launch' });
		expect(minimal).toEqual({
			ok: true,
			write: { flagKey: 'ui', value: { ui: 'new' }, reason: 'launch', customerId: null, route: null },
		});
	});

	it.each<[string, unknown]>([
		['a non-object body', 'x'],
		['an unknown flagKey', { ...ok, flagKey: 'other' }],
		['a bad customerId', { ...ok, customerId: 'not-a-uuid' }],
		['an unknown route', { ...ok, route: 'nope' }],
		['a missing reason', { ...ok, reason: undefined }],
		['a blank reason', { ...ok, reason: '  ' }],
		['an unknown engine', { ...ok, value: { engine: 'foo' } }],
		['extra value keys', { ...ok, value: { engine: 'credo', extra: 1 } }],
		['a route on the ui flag', { flagKey: 'ui', value: { ui: 'new' }, route: 'did', reason: 'r' }],
		['a bad ui value', { flagKey: 'ui', value: { ui: 'x' }, reason: 'r' }],
		['an array value', { ...ok, value: [] }],
	])('rejects %s', (_name, body) => {
		expect(validateFlagWrite(body).ok).toBe(false);
	});
});
