import { describe, expect, it } from '@jest/globals';
import { statusUpdateFailure } from '../../../../src/services/api/status-update-outcome.js';

describe('statusUpdateFailure', () => {
	it('turns updated:false with an empty error and an unknown status into a 500, never a success', () => {
		const failure = statusUpdateFailure('revoke', { updated: false, statusValue: 3, error: undefined });
		expect(failure?.statusCode).toBe(500);
		expect(failure?.error).toContain('was not revoked');
	});

	it('answers 409 when the credential is already in the requested state', () => {
		expect(statusUpdateFailure('suspend', { updated: false, statusValue: 2 })?.statusCode).toBe(409);
		expect(statusUpdateFailure('reinstate', { updated: false, statusValue: 0 })?.statusCode).toBe(409);
	});

	it('reads the StatusList2021 shape (revoked/suspended/unsuspended) as well', () => {
		expect(statusUpdateFailure('revoke', { revoked: false })?.statusCode).toBe(500);
		expect(statusUpdateFailure('suspend', { suspended: [false, false] })?.statusCode).toBe(500);
		expect(statusUpdateFailure('reinstate', { unsuspended: false })?.statusCode).toBe(500);
	});

	it('reports an engine error as 400 with its message', () => {
		const failure = statusUpdateFailure('revoke', { updated: false, error: new Error('list not found') });
		expect(failure?.statusCode).toBe(400);
		expect(failure?.error).toContain('list not found');
	});

	it('lets a real update through, including a partly successful bulk one', () => {
		expect(statusUpdateFailure('revoke', { updated: true, statusValue: 1 })).toBeNull();
		expect(statusUpdateFailure('revoke', { revoked: true })).toBeNull();
		expect(statusUpdateFailure('suspend', { suspended: [true, false] })).toBeNull();
		expect(statusUpdateFailure('revoke', { updated: [true, false] })).toBeNull();
	});

	it('leaves a result with no update signal alone', () => {
		expect(statusUpdateFailure('revoke', {})).toBeNull();
		expect(statusUpdateFailure('revoke', undefined)).toBeNull();
	});
});
