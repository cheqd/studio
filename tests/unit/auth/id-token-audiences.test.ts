import { describe, expect, it } from '@jest/globals';
import { audienceMatches, idTokenAudiences, portalAppIds } from '../../../src/middleware/auth/id-token-audiences.js';

describe('idTokenAudiences', () => {
	it("accepts only Studio's own LogTo application by default", () => {
		expect(idTokenAudiences({ LOGTO_APP_ID: 'studio-app' })).toEqual(['studio-app']);
	});

	it('adds the CLI applications listed in LOGTO_CLI_APP_IDS', () => {
		expect(idTokenAudiences({ LOGTO_APP_ID: 'studio-app', LOGTO_CLI_APP_IDS: ' cli-one , cli-two,' })).toEqual([
			'studio-app',
			'cli-one',
			'cli-two',
		]);
	});

	it('ignores empty values and duplicates', () => {
		expect(idTokenAudiences({ LOGTO_APP_ID: 'studio-app', LOGTO_CLI_APP_IDS: 'studio-app,,' })).toEqual([
			'studio-app',
		]);
		expect(idTokenAudiences({ LOGTO_CLI_APP_IDS: '' })).toEqual([]);
	});
});

describe('portal application ids', () => {
	it('parses a trimmed, de-duplicated list and treats blank as unset', () => {
		expect(portalAppIds({ PORTAL_APP_IDS: ' a, b ,a,, ' })).toEqual(['a', 'b']);
		expect(portalAppIds({ PORTAL_APP_IDS: ' , ' })).toEqual([]);
		expect(portalAppIds({})).toEqual([]);
	});

	it('matches string and array audiences only against listed ids', () => {
		expect(audienceMatches('a', ['a'])).toBe(true);
		expect(audienceMatches(['x', 'a'], ['a'])).toBe(true);
		expect(audienceMatches('x', ['a'])).toBe(false);
		expect(audienceMatches(undefined, ['a'])).toBe(false);
		expect(audienceMatches([1, null], ['a'])).toBe(false);
	});
});
