import { describe, expect, it } from '@jest/globals';
import { unsupportedIssuanceStatus } from '../../../src/helpers/issuance-status.js';

describe('unsupportedIssuanceStatus', () => {
	it('rejects a BitstringStatusList with the revocation purpose, naming what is supported', () => {
		const message = unsupportedIssuanceStatus({
			statusListType: 'BitstringStatusList',
			statusPurpose: 'revocation',
		});
		expect(message).toContain("statusPurpose 'revocation' is not supported for statusListType BitstringStatusList");
		expect(message).toContain('refresh, message');
	});

	it('rejects a BitstringStatusList with the suspension purpose', () => {
		expect(
			unsupportedIssuanceStatus({ statusListType: 'BitstringStatusList', statusPurpose: 'suspension' })
		).toBeDefined();
	});

	it('rejects a StatusList2021 with a Bitstring purpose', () => {
		expect(unsupportedIssuanceStatus({ statusListType: 'StatusList2021', statusPurpose: 'message' })).toBeDefined();
	});

	it.each([
		[{ statusListType: 'BitstringStatusList', statusPurpose: 'message' }],
		[{ statusListType: 'BitstringStatusList', statusPurpose: 'refresh' }],
		[{ statusListType: 'StatusList2021', statusPurpose: 'revocation' }],
		[{ statusListType: 'StatusList2021', statusPurpose: 'suspension' }],
		[undefined],
	])('accepts %j', (status) => {
		expect(unsupportedIssuanceStatus(status)).toBeUndefined();
	});
});
