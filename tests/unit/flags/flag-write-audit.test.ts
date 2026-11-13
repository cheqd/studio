import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/** A transaction that records its statements and rolls back (restores `state`) when the work throws. */
const state = { flag: null as null | Record<string, unknown>, audit: [] as Record<string, unknown>[] };
let failAudit = false;
const transaction = jest.fn(async (work: (manager: unknown) => Promise<unknown>) => {
	const snapshot = { flag: state.flag, audit: [...state.audit] };
	const manager = {
		query: async (sql: string, parameters: unknown[]) => {
			if (sql.includes('FOR UPDATE')) return state.flag ? [{ value: state.flag.value }] : [];
			if (sql.includes('INSERT INTO "featureFlag"')) {
				state.flag = { value: JSON.parse(parameters[3] as string) };
				return [{ id: 'row', flagKey: parameters[0], value: state.flag.value }];
			}
			return [];
		},
		getRepository: () => ({
			insert: async (row: Record<string, unknown>) => {
				if (failAudit) throw new Error('audit insert failed');
				state.audit.push(row);
			},
		}),
	};
	try {
		return await work(manager);
	} catch (error) {
		state.flag = snapshot.flag;
		state.audit = snapshot.audit;
		throw error;
	}
});

jest.unstable_mockModule('../../../src/database/connection/connection.js', () => ({
	Connection: { instance: { dbConnection: { transaction } } },
}));

const { FeatureFlagService } = await import('../../../src/services/api/feature-flag.js');

const write = {
	flagKey: 'engine' as const,
	customerId: '11111111-1111-4111-8111-111111111111',
	route: 'did' as const,
	value: { engine: 'credo' },
	reason: 'switch one customer to credo',
};

beforeEach(() => {
	state.flag = null;
	state.audit = [];
	failAudit = false;
	jest.spyOn(console, 'info').mockImplementation(() => undefined);
});

describe('FeatureFlagService.setFlag', () => {
	it('writes the flag and an adminAuditLog row with actor, action, old and new value and reason', async () => {
		await FeatureFlagService.instance.setFlag({ ...write, value: { engine: 'veramo' } }, 'staff-1');
		await FeatureFlagService.instance.setFlag(write, 'staff-2');

		expect(state.audit).toHaveLength(2);
		expect(state.audit[1]).toMatchObject({
			actorUserId: 'staff-2',
			action: 'flag.set',
			targetCustomerId: write.customerId,
			reason: write.reason,
			metadata: {
				flagKey: 'engine',
				route: 'did',
				oldValue: { engine: 'veramo' },
				newValue: { engine: 'credo' },
			},
		});
		expect((state.audit[0].metadata as { oldValue: unknown }).oldValue).toBeNull();
	});

	it('does both in one transaction: a failed audit write leaves no flag change and keeps the cache', async () => {
		await FeatureFlagService.instance.setFlag({ ...write, value: { engine: 'veramo' } }, 'staff-1');
		const invalidate = jest.spyOn(FeatureFlagService.instance.cache, 'invalidate');
		failAudit = true;
		await expect(FeatureFlagService.instance.setFlag(write, 'staff-2')).rejects.toThrow('audit insert failed');
		expect(state.flag?.value).toEqual({ engine: 'veramo' });
		expect(state.audit).toHaveLength(1);
		expect(invalidate).not.toHaveBeenCalled();
	});

	it('invalidates the flag cache after the commit, and logs old and new values', async () => {
		const invalidate = jest.spyOn(FeatureFlagService.instance.cache, 'invalidate');
		await FeatureFlagService.instance.setFlag(write, 'staff-1');
		expect(invalidate).toHaveBeenCalledTimes(1);
		const line = JSON.parse((console.info as jest.Mock).mock.calls.at(-1)?.[0] as string);
		expect(line).toMatchObject({
			event: 'flag-changed',
			actorUserId: 'staff-1',
			oldValue: null,
			newValue: { engine: 'credo' },
		});
	});
});
