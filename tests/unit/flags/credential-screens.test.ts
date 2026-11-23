import { afterEach, describe, expect, it, jest } from '@jest/globals';

jest.unstable_mockModule('../../../src/database/connection/connection.js', () => ({
	Connection: { instance: { dbConnection: { getRepository: () => ({}), query: async () => [] } } },
}));
const { CredentialScreensService, historyCutoff } = await import('../../../src/services/api/credential-screens.js');
const { credentialScreensMode, validateFlagWrite } = await import('../../../src/services/api/feature-flag.js');

const customerId = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const row = (customer: string | null, mode: string) => ({
	flagKey: 'credentialScreens',
	customerId: customer,
	route: null,
	value: { mode },
});

const envBefore = { ...process.env };
afterEach(() => {
	process.env = { ...envBefore };
	jest.restoreAllMocks();
});

describe('credentialScreensMode', () => {
	it('uses only the customer own row, and auto otherwise', () => {
		expect(credentialScreensMode([], customerId)).toBe('auto');
		expect(credentialScreensMode([row(customerId, 'on')], customerId)).toBe('on');
		expect(credentialScreensMode([row(other, 'on')], customerId)).toBe('auto');
		expect(credentialScreensMode([row(null, 'on')], customerId)).toBe('auto');
		expect(credentialScreensMode([row(customerId, 'nonsense')], customerId)).toBe('auto');
		expect(credentialScreensMode([row(customerId, 'on')], undefined)).toBe('auto');
	});
});

describe('validateFlagWrite for credentialScreens', () => {
	it('accepts a per-customer mode', () => {
		for (const mode of ['auto', 'on', 'off']) {
			expect(
				validateFlagWrite({ flagKey: 'credentialScreens', customerId, value: { mode }, reason: 'x' }).ok
			).toBe(true);
		}
	});
	it('refuses a global flag, a route, or a bad value', () => {
		expect(validateFlagWrite({ flagKey: 'credentialScreens', value: { mode: 'on' }, reason: 'x' }).ok).toBe(false);
		expect(
			validateFlagWrite({
				flagKey: 'credentialScreens',
				customerId,
				route: 'did',
				value: { mode: 'on' },
				reason: 'x',
			}).ok
		).toBe(false);
		expect(
			validateFlagWrite({ flagKey: 'credentialScreens', customerId, value: { mode: 'yes' }, reason: 'x' }).ok
		).toBe(false);
		expect(
			validateFlagWrite({
				flagKey: 'credentialScreens',
				customerId,
				value: { mode: 'on', extra: 1 },
				reason: 'x',
			}).ok
		).toBe(false);
	});
});

describe('CredentialScreensService.decide', () => {
	it('lets a staff override win over history', async () => {
		const lookup = jest.fn(async () => true);
		const service = new CredentialScreensService(lookup);
		expect(await service.decide(customerId, [row(customerId, 'off')])).toEqual({
			enabled: false,
			mode: 'off',
			source: 'flag',
		});
		expect(await service.decide(customerId, [row(customerId, 'on')])).toEqual({
			enabled: true,
			mode: 'on',
			source: 'flag',
		});
		expect(lookup).not.toHaveBeenCalled();
	});

	it('follows history on auto, and caches it', async () => {
		let t = 0;
		const lookup = jest.fn(async () => true);
		const service = new CredentialScreensService(lookup, () => t);
		expect(await service.decide(customerId, [])).toEqual({ enabled: true, mode: 'auto', source: 'history' });
		t = 60_000;
		await service.decide(customerId, []);
		expect(lookup).toHaveBeenCalledTimes(1);
		t = 11 * 60_000;
		await service.decide(customerId, []);
		expect(lookup).toHaveBeenCalledTimes(2);
	});

	it('hides the screens for a customer without history, and when the history read fails', async () => {
		expect(await new CredentialScreensService(async () => false).decide(customerId, [])).toEqual({
			enabled: false,
			mode: 'auto',
			source: 'default',
		});
		jest.spyOn(console, 'warn').mockImplementation(() => undefined);
		const failing = new CredentialScreensService(async () => {
			throw new Error('db down');
		});
		expect((await failing.decide(customerId, [])).enabled).toBe(false);
	});

	it('passes the release cutoff to the history read', async () => {
		process.env.CREDENTIAL_SCREENS_HISTORY_CUTOFF = '2026-12-08T00:00:00Z';
		const lookup = jest.fn(async () => false);
		await new CredentialScreensService(lookup).decide(customerId, []);
		expect(lookup).toHaveBeenCalledWith(customerId, new Date('2026-12-08T00:00:00Z'));
	});
});

describe('historyCutoff', () => {
	it('reads an ISO date and ignores anything else', () => {
		expect(historyCutoff({ CREDENTIAL_SCREENS_HISTORY_CUTOFF: '2026-12-08' })).toEqual(new Date('2026-12-08'));
		expect(historyCutoff({})).toBeUndefined();
		jest.spyOn(console, 'warn').mockImplementation(() => undefined);
		expect(historyCutoff({ CREDENTIAL_SCREENS_HISTORY_CUTOFF: 'soon' })).toBeUndefined();
	});
});
