import { afterEach, describe, expect, it, jest } from '@jest/globals';

const { LogToHelper } = await import('../../../src/middleware/auth/logto-helper.js');

afterEach(() => {
	jest.restoreAllMocks();
});

function helperWith(result: unknown) {
	const helper = new LogToHelper();
	const spy = jest.spyOn(helper, 'getRolesForUser').mockResolvedValue(result as never);
	return { helper, spy };
}

describe('LogToHelper.getUserRoles', () => {
	it('returns role names only and caches them per user', async () => {
		const { helper, spy } = helperWith({
			status: 200,
			error: '',
			data: [
				{ id: 'r1', name: 'cheqd admin' },
				{ id: 'r2', name: 'Portal' },
			],
		});
		const first = await helper.getUserRoles('user-1');
		const second = await helper.getUserRoles('user-1');
		expect(first.data).toEqual(['cheqd admin', 'Portal']);
		expect(second.data).toEqual(['cheqd admin', 'Portal']);
		expect(spy).toHaveBeenCalledTimes(1);
		await helper.getUserRoles('user-2');
		expect(spy).toHaveBeenCalledTimes(2);
	});

	it('re-reads after the cache expires', async () => {
		const { helper, spy } = helperWith({ status: 200, error: '', data: [{ id: 'r1', name: 'Portal' }] });
		const now = jest.spyOn(Date, 'now');
		now.mockReturnValue(1_000);
		await helper.getUserRoles('user-1');
		now.mockReturnValue(1_000 + 31_000);
		await helper.getUserRoles('user-1');
		expect(spy).toHaveBeenCalledTimes(2);
	});

	it('reports a failure without caching it', async () => {
		const { helper, spy } = helperWith({ status: 502, error: 'down', data: {} });
		expect((await helper.getUserRoles('user-1')).status).toBe(502);
		await helper.getUserRoles('user-1');
		expect(spy).toHaveBeenCalledTimes(2);
	});
});
