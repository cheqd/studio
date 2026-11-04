import { describe, expect, it } from '@jest/globals';
import { idTokenAudiences } from '../../../src/middleware/auth/id-token-audiences.js';

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
