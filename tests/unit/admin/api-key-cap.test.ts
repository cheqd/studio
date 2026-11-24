import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

jest.unstable_mockModule('../../../src/database/connection/connection.js', () => ({
	Connection: { instance: { dbConnection: { getRepository: () => ({}) } } },
}));

const { APIKeyController } = await import('../../../src/controllers/admin/api-key.js');
const { APIKeyService } = await import('../../../src/services/admin/api-key.js');
const { API_KEY_MAX_ACTIVE_PER_CUSTOMER, parseMaxActiveAPIKeys } = await import('../../../src/types/constants.js');
const { eventTracker } = await import('../../../src/services/track/tracker.js');

afterEach(() => {
	jest.restoreAllMocks();
});

function makeResponse() {
	return {
		locals: { customer: { customerId: 'customer-1' }, user: { logToId: 'user-1' } },
		statusCode: 200,
		body: undefined as unknown,
		status(code: number) {
			this.statusCode = code;
			return this;
		},
		json(body: unknown) {
			this.body = body;
			return this;
		},
	};
}

async function createWith(activeKeys: number) {
	jest.spyOn(APIKeyService.instance, 'countActive').mockResolvedValue(activeKeys);
	jest.spyOn(eventTracker, 'notify').mockImplementation(() => undefined as never);
	const create = jest.spyOn(APIKeyService.instance, 'create').mockResolvedValue({
		apiKey: 'caas_new',
		name: 'key',
		createdAt: new Date(),
		expiresAt: new Date(Date.now() + 60_000),
		revoked: false,
	} as never);
	const response = makeResponse();
	await new APIKeyController().create(
		{ body: { name: 'key' } } as unknown as Request,
		response as unknown as Response
	);
	return { response, create };
}

describe('per-customer cap on active API keys', () => {
	it('defaults to 10, and reads a positive integer from the environment', () => {
		expect(parseMaxActiveAPIKeys(undefined)).toBe(10);
		expect(parseMaxActiveAPIKeys('5')).toBe(5);
		expect(parseMaxActiveAPIKeys('0')).toBe(10);
		expect(parseMaxActiveAPIKeys('-3')).toBe(10);
		expect(parseMaxActiveAPIKeys('many')).toBe(10);
	});

	it('creates a key while the customer is below the cap', async () => {
		const { response, create } = await createWith(API_KEY_MAX_ACTIVE_PER_CUSTOMER - 1);
		expect(response.statusCode).toBe(201);
		expect(create).toHaveBeenCalledTimes(1);
	});

	it('refuses with 409 and a clear message once the cap is reached, without creating a key', async () => {
		for (const active of [API_KEY_MAX_ACTIVE_PER_CUSTOMER, API_KEY_MAX_ACTIVE_PER_CUSTOMER + 3]) {
			const { response, create } = await createWith(active);
			expect(response.statusCode).toBe(409);
			expect((response.body as { error: string }).error).toContain(
				`at most ${API_KEY_MAX_ACTIVE_PER_CUSTOMER} active API keys`
			);
			expect(create).not.toHaveBeenCalled();
			jest.restoreAllMocks();
		}
	});

	it('counts only keys of this customer that are neither revoked nor expired', async () => {
		const count = jest.fn(async (_options: unknown) => 3);
		const original = APIKeyService.instance.apiKeyRepository;
		APIKeyService.instance.apiKeyRepository = { count } as never;
		try {
			const now = new Date('2030-01-01T00:00:00.000Z');
			expect(await APIKeyService.instance.countActive({ customerId: 'customer-1' } as never, now)).toBe(3);
			const { where } = count.mock.calls[0][0] as {
				where: { customer: unknown; revoked: boolean; expiresAt: { type: string; value: Date } };
			};
			expect(where.customer).toEqual({ customerId: 'customer-1' });
			expect(where.revoked).toBe(false);
			expect(where.expiresAt.type).toBe('moreThan');
			expect(where.expiresAt.value).toEqual(now);
		} finally {
			APIKeyService.instance.apiKeyRepository = original;
		}
	});
});
