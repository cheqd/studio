import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

// GET /event/list: newest first with a stable tie-breaker, and `successful=false` lists failed operations only.
const findAndCount = jest.fn(async (_options: unknown) => [[], 0] as [unknown[], number]);
jest.unstable_mockModule('../../../../src/database/connection/connection.js', () => ({
	Connection: { instance: { dbConnection: { getRepository: () => ({ findAndCount }) } } },
}));
const listOperations = jest.fn(async (_options: Record<string, unknown>, _customer: unknown) => ({
	total: 0,
	events: [],
}));
jest.unstable_mockModule('../../../../src/services/identity/index.js', () => ({
	IdentityServiceStrategySetup: class {
		agent = { listOperations };
	},
}));

const { OperationController } = await import('../../../../src/controllers/api/operation.js');
const { OperationService } = await import('../../../../src/services/api/operation.js');

const customer = { customerId: 'c-1' };

async function list(query: Record<string, string>) {
	const request = { query, params: {}, body: {} } as unknown as Request;
	for (const validator of OperationController.listOperationValidator) await validator.run(request);
	const response = { statusCode: 0, body: undefined as unknown } as Response & { statusCode: number; body: unknown };
	response.locals = { customer };
	response.status = ((code: number) => {
		response.statusCode = code;
		return response;
	}) as never;
	response.json = ((body: unknown) => {
		response.body = body;
		return response;
	}) as never;
	await new OperationController().listOperations(request, response);
	return response;
}

beforeEach(() => {
	findAndCount.mockClear();
	listOperations.mockClear();
});

describe('GET /event/list', () => {
	it('successful=false filters on the boolean false (failed operations only)', async () => {
		expect((await list({ successful: 'false' })).statusCode).toBe(200);
		expect(listOperations.mock.calls[0][0].successful).toBe(false);
		await list({ successful: 'true', deprecated: '0' });
		expect(listOperations.mock.calls[1][0]).toEqual(
			expect.objectContaining({ successful: true, deprecated: false })
		);
	});

	it('leaves the filter out when it is not given', async () => {
		await list({});
		expect('successful' in listOperations.mock.calls[0][0]).toBe(false);
		expect('deprecated' in listOperations.mock.calls[0][0]).toBe(false);
	});

	it('rejects a non-boolean successful with 400 and does not query', async () => {
		const response = await list({ successful: 'no' });
		expect(response.statusCode).toBe(400);
		expect(listOperations).not.toHaveBeenCalled();
	});
});

describe('OperationService.find', () => {
	it('orders newest first, with the operation id as tie-breaker', async () => {
		await OperationService.instance.find({ successful: false }, 2, 10);
		expect(findAndCount).toHaveBeenCalledWith({
			where: { successful: false },
			order: { createdAt: 'DESC', operationId: 'DESC' },
			skip: 10,
			take: 10,
			relations: undefined,
		});
	});
});
