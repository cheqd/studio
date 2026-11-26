import { describe, expect, it } from '@jest/globals';
import {
	AdminAnalyticsService,
	JOURNEY_STEPS,
	STALLED_STEP_KEYS,
	opaqueAccountRef,
	type Queryable,
} from '../../../src/services/admin/admin-analytics.js';

const customerA = '11111111-1111-4111-8111-111111111111';
const customerB = '22222222-2222-4222-8222-222222222222';

function serviceWith(rowsFor: (sql: string) => unknown[]) {
	const calls: Array<{ sql: string; parameters: unknown[] }> = [];
	const db: Queryable = {
		query: async (sql: string, parameters: unknown[] = []) => {
			calls.push({ sql, parameters });
			return rowsFor(sql);
		},
	};
	return { service: new AdminAnalyticsService(() => db), calls };
}

const pageRows = [
	{ customerId: customerA, signedUpAt: new Date('2026-11-20T08:00:00Z'), lastActiveAt: '2026-11-21T09:30:00Z' },
	{ customerId: customerB, signedUpAt: '2026-11-18T12:00:00Z', lastActiveAt: null },
];

describe('AdminAnalyticsService.stalledAccounts (U-40)', () => {
	it('returns anonymised accounts with the step, its predecessor and the total', async () => {
		const { service } = serviceWith((sql) => (sql.includes('COUNT(*) AS total') ? [{ total: '7' }] : pageRows));
		const result = await service.stalledAccounts('first-credential', 'first-did', 30, 'all', 2, 2);
		expect(result).toEqual({
			journey: 'first-credential',
			step: 'first-did',
			stepLabel: 'First DID created',
			previousStep: 'funded',
			previousStepLabel: 'Funded address',
			range: 30,
			from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
			to: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
			segment: 'all',
			page: 2,
			limit: 2,
			total: 7,
			accounts: [
				{
					ref: opaqueAccountRef(customerA),
					signedUpAt: '2026-11-20T08:00:00.000Z',
					lastActiveAt: '2026-11-21T09:30:00.000Z',
				},
				{ ref: opaqueAccountRef(customerB), signedUpAt: '2026-11-18T12:00:00.000Z', lastActiveAt: null },
			],
		});
	});

	it('never returns a customer id, name or email', async () => {
		const { service } = serviceWith((sql) =>
			sql.includes('COUNT(*) AS total')
				? [{ total: '2' }]
				: pageRows.map((r) => ({ ...r, name: 'Acme', email: 'a@acme.example' }))
		);
		const text = JSON.stringify(await service.stalledAccounts('first-agent', 'funded', 7, 'agents', 1, 25));
		expect(text).not.toContain(customerA);
		expect(text).not.toContain(customerA.slice(0, 8));
		expect(text).not.toContain('Acme');
		expect(text).not.toContain('acme.example');
	});

	it('selects reached-previous-but-not-this-step, newest first, paginated with bound parameters', async () => {
		const { service, calls } = serviceWith((sql) => (sql.includes('COUNT(*) AS total') ? [{ total: '0' }] : []));
		await service.stalledAccounts('first-agent', 'registered-agent', 90, 'people', 3, 10);
		const [page, total] = calls;
		const stalled = 'j.signed IS NOT NULL AND j.funded IS NOT NULL AND j.did IS NOT NULL AND j.agent IS NULL';
		expect(page.sql).toContain(`WHERE ${stalled} ORDER BY j.signed DESC, j."customerId" LIMIT $3 OFFSET $4`);
		expect(page.parameters).toEqual([expect.any(Array), 'people', 10, 20]);
		expect(total.sql).toContain(`SELECT COUNT(*) AS total FROM j WHERE ${stalled}`);
		expect(total.parameters).toEqual([page.parameters[0], 'people']);
		// the name and email columns are never selected
		for (const { sql } of calls) expect(sql).not.toMatch(/c\."(name|email)"/);
	});

	it('the first step after sign-up stalls on funding only', async () => {
		const { service, calls } = serviceWith(() => []);
		await service.stalledAccounts('first-credential', 'funded', 30, 'all', 1, 25);
		expect(calls[0].sql).toContain('WHERE j.signed IS NOT NULL AND j.funded IS NULL ORDER BY');
	});

	it('the first-api-call journey: stalled at the call means a key but no call', async () => {
		const { service, calls } = serviceWith(() => []);
		const result = await service.stalledAccounts('first-api-call', 'first-api-call', 30, 'all', 1, 25);
		expect(calls[0].sql).toContain(
			'WHERE j.signed IS NOT NULL AND j.apikey IS NOT NULL AND j.apicall IS NULL ORDER BY'
		);
		expect([result?.previousStep, result?.previousStepLabel]).toEqual(['first-api-key', 'First API key']);
		// funding steps are not part of this journey
		expect(await service.stalledAccounts('first-api-call', 'funded', 30, 'all', 1, 25)).toBeNull();
	});

	it('uses the same cohort as the funnel, so total = previous accounts minus this step accounts', async () => {
		const { service, calls } = serviceWith(() => []);
		await service.funnel('first-agent', 30, 'all');
		await service.stalledAccounts('first-agent', 'card-signed', 30, 'all', 1, 25);
		const cohortOf = (sql: string) => sql.slice(sql.indexOf('cohort AS'), sql.indexOf('LEFT JOIN cards'));
		expect(cohortOf(calls[1].sql)).toBe(cohortOf(calls[0].sql));
	});

	it('returns null for the first step or a step of another journey', async () => {
		const { service, calls } = serviceWith(() => []);
		expect(await service.stalledAccounts('first-agent', 'signed-up', 30, 'all', 1, 25)).toBeNull();
		expect(await service.stalledAccounts('first-credential', 'card-signed', 30, 'all', 1, 25)).toBeNull();
		expect(calls).toHaveLength(0);
	});

	it('an empty total reads as 0', async () => {
		const { service } = serviceWith(() => []);
		expect((await service.stalledAccounts('first-agent', 'funded', 30, 'all', 1, 25))?.total).toBe(0);
	});
});

describe('stalled step keys and references', () => {
	it('lists every step after the first, once', () => {
		expect(STALLED_STEP_KEYS.sort()).toEqual(
			[
				'card-signed',
				'first-api-call',
				'first-api-key',
				'first-credential',
				'first-did',
				'funded',
				'registered-agent',
			].sort()
		);
		for (const steps of Object.values(JOURNEY_STEPS)) expect(steps[0].key).toBe('signed-up');
	});

	it('the opaque reference is short, stable, distinct per account and not derived by truncation', () => {
		const ref = opaqueAccountRef(customerA);
		expect(ref).toMatch(/^acct_[0-9a-f]{12}$/);
		expect(opaqueAccountRef(customerA)).toBe(ref);
		expect(opaqueAccountRef(customerB)).not.toBe(ref);
		expect(ref).not.toContain(customerA.replace(/-/g, '').slice(0, 6));
	});
});
