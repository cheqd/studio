import { describe, expect, it } from '@jest/globals';
import { StatusCodes } from 'http-status-codes';
import { InvalidAPIKeyError, apiKeyVerificationFailure } from '../../../src/services/admin/api-key-errors.js';

describe('apiKeyVerificationFailure', () => {
	it('returns 401 for an unknown or mismatched API key', () => {
		expect(apiKeyVerificationFailure(new InvalidAPIKeyError())).toEqual({
			status: StatusCodes.UNAUTHORIZED,
			error: 'Unauthorized error: Invalid API key.',
		});
	});

	it('returns 401 for a revoked API key', () => {
		expect(apiKeyVerificationFailure(new InvalidAPIKeyError('API key is revoked'))).toEqual({
			status: StatusCodes.UNAUTHORIZED,
			error: 'Unauthorized error: API key is revoked.',
		});
	});

	it('returns 500 for any other failure, without its details', () => {
		const failure = apiKeyVerificationFailure(new Error('connection terminated unexpectedly'));
		expect(failure.status).toBe(StatusCodes.INTERNAL_SERVER_ERROR);
		expect(failure.error).not.toContain('connection terminated');
	});
});
