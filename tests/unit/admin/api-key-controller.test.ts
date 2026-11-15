import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

jest.unstable_mockModule('../../../src/database/connection/connection.js', () => ({
	Connection: { instance: { dbConnection: { getRepository: () => ({}) } } },
}));

const { APIKeyController } = await import('../../../src/controllers/admin/api-key.js');
const { APIKeyService } = await import('../../../src/services/admin/api-key.js');
const { API_KEY_MAX_EXPIRATION_DAYS } = await import('../../../src/types/constants.js');

const NOW = new Date('2030-06-15T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
	jest.useFakeTimers({ now: NOW });
});
afterEach(() => {
	jest.useRealTimers();
	jest.restoreAllMocks();
});

async function errorsFor(validators: { run: (req: Request) => Promise<unknown> }[], body: unknown) {
	const request = { body } as unknown as Request;
	for (const validator of validators) await validator.run(request);
	const { validationResult } = await import('../../../src/controllers/validator/index.js');
	return validationResult(request)
		.array()
		.map((e) => e.msg);
}

describe.each([
	['create', () => APIKeyController.apiKeyCreateValidator, { name: 'portal key' }],
	['update', () => APIKeyController.apiKeyUpdateValidator, { apiKey: 'caas_x' }],
])('API key %s validation of expiresAt', (_name, validators, base) => {
	const run = (expiresAt?: string) =>
		errorsFor(validators() as never, expiresAt === undefined ? base : { ...base, expiresAt });

	it('accepts no expiry, and an expiry inside the window', async () => {
		expect(await run()).toEqual([]);
		expect(await run(new Date(NOW.getTime() + 30 * DAY).toISOString())).toEqual([]);
	});

	it('accepts an expiry exactly at the maximum', async () => {
		expect(await run(new Date(NOW.getTime() + API_KEY_MAX_EXPIRATION_DAYS * DAY).toISOString())).toEqual([]);
	});

	it('rejects an expiry in the past, or exactly now', async () => {
		expect(await run(new Date(NOW.getTime() - DAY).toISOString())).toContain('expiresAt must be in the future');
		expect(await run(NOW.toISOString())).toContain('expiresAt must be in the future');
	});

	it('rejects an expiry beyond the maximum', async () => {
		const errors = await run(new Date(NOW.getTime() + API_KEY_MAX_EXPIRATION_DAYS * DAY + 1000).toISOString());
		expect(errors.join()).toMatch(/no more than \d+ days/);
	});

	it('rejects something that is not a date', async () => {
		expect(await run('tomorrow-ish')).not.toEqual([]);
	});
});

describe('API key listing', () => {
	it('exposes expiresAt and an expired flag, leaving the other fields as they were', async () => {
		const entity = (name: string, expiresAt: Date, revoked = false) => ({
			apiKey: `caas_${name}`,
			name,
			createdAt: new Date(NOW.getTime() - DAY),
			expiresAt,
			revoked,
		});
		jest.spyOn(APIKeyService.instance, 'find').mockResolvedValue([
			entity('live', new Date(NOW.getTime() + DAY)),
			entity('past', new Date(NOW.getTime() - 1)),
			entity('now', new Date(NOW.getTime())),
			entity('revoked', new Date(NOW.getTime() + DAY), true),
		] as never);
		let body: { apiKeys: Record<string, unknown>[] } | undefined;
		const response = {
			locals: { customer: {} },
			status: () => response,
			json: (b: typeof body) => ((body = b), response),
		};
		await new APIKeyController().list({} as Request, response as unknown as Response);
		expect(body?.apiKeys.map((k) => [k.name, k.expired, k.revoked])).toEqual([
			['live', false, false],
			['past', true, false],
			['now', true, false],
			['revoked', false, true],
		]);
		expect(Object.keys(body?.apiKeys[0] ?? {}).sort()).toEqual(
			['apiKey', 'createdAt', 'expired', 'expiresAt', 'name', 'revoked'].sort()
		);
		expect(body?.apiKeys[1].expiresAt).toBe(new Date(NOW.getTime() - 1).toISOString());
	});
});
