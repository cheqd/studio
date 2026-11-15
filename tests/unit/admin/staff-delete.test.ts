import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { staffIdentity } from './staff-identity-fixture.js';

const CUSTOMER = '11111111-1111-4111-8111-111111111111';
const STAFF_CUSTOMER = '33333333-3333-4333-8333-333333333333';
const target = { customerId: CUSTOMER, email: 'target@example.com', name: 'Target', source: 'sdk' };
const staffCustomer = { customerId: STAFF_CUSTOMER, email: 'staff@example.com', name: 'Staff' };

/** What the database holds, so a rolled-back transaction can be seen to leave it untouched. */
const db = { customers: new Set<string>([CUSTOMER, STAFF_CUSTOMER]), audit: [] as Array<Record<string, unknown>> };
let failAudit = false;
let transactions = 0;

const transaction = jest.fn(async (work: (manager: unknown) => Promise<unknown>) => {
	transactions += 1;
	const snapshot = { customers: new Set(db.customers), audit: [...db.audit] };
	const manager = {
		getRepository: () => ({
			insert: async (row: Record<string, unknown>) => {
				if (failAudit) throw new Error('audit insert failed');
				db.audit.push(row);
			},
		}),
		delete: async (_entity: unknown, where: { customerId: string }) => ({
			affected: db.customers.delete(where.customerId) ? 1 : 0,
		}),
	};
	try {
		return await work(manager);
	} catch (error) {
		db.customers = snapshot.customers;
		db.audit = snapshot.audit;
		throw error;
	}
});
const bestEffortInsert = jest.fn(async (row: Record<string, unknown>) => {
	db.audit.push(row);
});

jest.unstable_mockModule('../../../src/database/connection/connection.js', () => ({
	Connection: { instance: { dbConnection: { transaction, getRepository: () => ({ insert: bestEffortInsert }) } } },
}));

const restorePriorDeletionRecord = jest.fn(async () => undefined);
const recordAccountDeletion = jest.fn(async () => ({ marker: 'prior' }));
jest.unstable_mockModule('../../../src/services/api/account-deletion-live-deps.js', () => ({
	liveAccountDeletionDeps: {
		findCurrentSubscription: async () => null,
		cancelSubscription: async () => ({}),
		findUserForCustomer: async () => null,
		deleteLogtoUser: async () => ({ status: 200, error: '', data: {} }),
		recordAccountDeletion,
		restorePriorDeletionRecord,
		deleteCustomer: async () => {
			throw new Error('the unaudited delete must not be used');
		},
	},
}));
jest.unstable_mockModule('../../../src/services/api/customer.js', () => ({
	CustomerService: {
		instance: {
			get: async (id: string) => (id === CUSTOMER ? target : id === STAFF_CUSTOMER ? staffCustomer : null),
		},
	},
}));
jest.unstable_mockModule('../../../src/services/track/tracker.js', () => ({
	EventTracker: { compileBasicNotification: (message: string) => message },
	eventTracker: { notify: async () => undefined },
}));

const { OrganisationController } = await import('../../../src/controllers/admin/organisation.js');
const { AdminAnalyticsService } = await import('../../../src/services/admin/admin-analytics.js');

let plan = { plan: 'Basic', paid: false };
AdminAnalyticsService.instance.getPlan = (async () => plan) as never;

function run(options: {
	body?: Record<string, unknown>;
	headers?: Record<string, string>;
	locals?: Record<string, unknown>;
}) {
	const request = { body: options.body ?? {}, headers: options.headers ?? {} } as unknown as Request;
	const response = {
		locals: { scopes: ['admin:organisation:delete'], staffIdentity: staffIdentity(), ...options.locals },
		statusCode: 0,
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
	return new OrganisationController()
		.delete(request, response as unknown as Response)
		.then(() => ({ status: response.statusCode, body: response.body as Record<string, unknown> }));
}

// The portal path: the authenticated customer is the staff member's own
const portal = (body: Record<string, unknown>) =>
	run({ body, locals: { customer: staffCustomer, user: { logToId: 'logto-staff-1' } } });
// The M2M path: the customer-id header names the target
const m2m = (body: Record<string, unknown>) =>
	run({
		body,
		headers: { 'customer-id': CUSTOMER },
		locals: { customer: target, user: { logToId: 'logto-target' } },
	});

const good = { confirm: true, reason: 'User request', ticketRef: 'SUP-1031', customerId: CUSTOMER };

beforeEach(() => {
	db.customers = new Set([CUSTOMER, STAFF_CUSTOMER]);
	db.audit = [];
	failAudit = false;
	transactions = 0;
	plan = { plan: 'Basic', paid: false };
	restorePriorDeletionRecord.mockClear();
	recordAccountDeletion.mockClear();
	bestEffortInsert.mockClear();
	jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('DELETE /admin/organisation/delete (staff)', () => {
	it('deletes the customer and writes the audit row in one transaction', async () => {
		const result = await portal(good);
		expect(result.status).toBe(200);
		expect(result.body.success).toBe(true);
		expect(db.customers.has(CUSTOMER)).toBe(false);
		expect(transactions).toBe(1);
		expect(db.audit).toHaveLength(1);
		expect(db.audit[0]).toMatchObject({
			actorUserId: 'logto-staff-1',
			action: 'customer.delete',
			targetCustomerId: CUSTOMER,
			reason: 'User request',
			ticketRef: 'SUP-1031',
		});
	});

	it('keeps no name or email in the audit row', async () => {
		await portal(good);
		const text = JSON.stringify(db.audit);
		expect(text).not.toContain('target@example.com');
		expect(text).not.toContain('Target');
	});

	it('rolls back the deletion when the audit write fails, and restores the deletion record', async () => {
		failAudit = true;
		const result = await portal(good);
		expect(result.status).toBe(500);
		expect(db.customers.has(CUSTOMER)).toBe(true);
		expect(db.audit.filter((row) => row.action === 'customer.delete')).toHaveLength(0);
		expect(restorePriorDeletionRecord).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(result.body)).toContain('audit insert failed');
	});

	it('records a failed attempt separately, outside the transaction', async () => {
		failAudit = true;
		await portal(good);
		expect(db.audit.map((row) => row.action)).toEqual(['customer.delete.failed']);
	});

	it.each([
		['no reason', { confirm: true, customerId: CUSTOMER }],
		['a blank reason', { confirm: true, reason: '   ', customerId: CUSTOMER }],
		['a reason over 500 characters', { confirm: true, reason: 'x'.repeat(501), customerId: CUSTOMER }],
		['a non-string reason', { confirm: true, reason: 42, customerId: CUSTOMER }],
		['an over-long ticketRef', { ...good, ticketRef: 't'.repeat(101) }],
		['a non-string ticketRef', { ...good, ticketRef: 7 }],
		['a customerId that is not a UUID', { ...good, customerId: 'org_a1f3' }],
		['confirm missing', { reason: 'x', customerId: CUSTOMER }],
		['confirm not true', { ...good, confirm: 'true' }],
	])('refuses %s with 400 and deletes nothing', async (_name, body) => {
		const result = await portal(body);
		expect(result.status).toBe(400);
		expect(db.customers.has(CUSTOMER)).toBe(true);
		expect(db.audit).toHaveLength(0);
		expect(recordAccountDeletion).not.toHaveBeenCalled();
	});

	it('refuses staff deleting their own organisation (portal path, explicit or implied)', async () => {
		db.customers.add(STAFF_CUSTOMER);
		const implied = await portal({ confirm: true, reason: 'cleanup' });
		expect(implied.status).toBe(403);
		const explicit = await run({
			body: { confirm: true, reason: 'cleanup', customerId: STAFF_CUSTOMER },
			locals: { customer: staffCustomer, user: { logToId: 'logto-staff-1' } },
		});
		expect(explicit.status).toBe(403);
		expect(db.customers.has(STAFF_CUSTOMER)).toBe(true);
		expect(db.audit).toHaveLength(0);
	});

	it('needs confirmPaidPlan for a paid plan', async () => {
		plan = { plan: 'Build', paid: true };
		const refused = await portal(good);
		expect(refused.status).toBe(400);
		expect(String(refused.body.error)).toContain('confirmPaidPlan');
		expect(db.customers.has(CUSTOMER)).toBe(true);
		const accepted = await portal({ ...good, confirmPaidPlan: true });
		expect(accepted.status).toBe(200);
		expect(db.audit[0].metadata).toMatchObject({ plan: 'Build', paid: true });
	});

	it('does not need confirmPaidPlan for a free plan', async () => {
		expect((await portal(good)).status).toBe(200);
	});

	it('is 404 for an unknown customerId', async () => {
		const result = await portal({ ...good, customerId: '99999999-9999-4999-8999-999999999999' });
		expect(result.status).toBe(404);
		expect(db.audit).toHaveLength(0);
	});

	it('keeps the machine-to-machine behaviour: the customer-id header names the target, with a reason now required', async () => {
		const result = await m2m({ confirm: true, reason: 'support request' });
		expect(result.status).toBe(200);
		expect(db.customers.has(CUSTOMER)).toBe(false);
		expect(db.audit[0]).toMatchObject({
			actorUserId: 'm2m',
			targetCustomerId: CUSTOMER,
			reason: 'support request',
		});
		expect((await m2m({ confirm: true })).status).toBe(400);
	});

	it('is 404 when there is no customer at all (existing behaviour)', async () => {
		const result = await run({ body: { confirm: true, reason: 'x' }, locals: {} });
		expect(result.status).toBe(404);
	});

	it('answers 403 without the delete scope when authentication is on', async () => {
		const original = process.env.ENABLE_AUTHENTICATION;
		process.env.ENABLE_AUTHENTICATION = 'true';
		try {
			const result = await run({
				body: good,
				locals: { scopes: ['admin:customers:read'], customer: staffCustomer },
			});
			expect(result.status).toBe(403);
			expect(db.customers.has(CUSTOMER)).toBe(true);
		} finally {
			if (original === undefined) Reflect.deleteProperty(process.env, 'ENABLE_AUTHENTICATION');
			else process.env.ENABLE_AUTHENTICATION = original;
		}
	});
});
