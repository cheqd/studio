import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';
import { staffIdentity } from './staff-identity-fixture.js';
import { AuditLogAdminController } from '../../../src/controllers/admin/audit-log.js';
import { AdminAnalyticsService, type Queryable } from '../../../src/services/admin/admin-analytics.js';
import { StudioMigrations1791702500300 } from '../../../src/database/migrations/1791702500300-studio-migrations.js';
import type { QueryRunner } from 'typeorm';

const target = '11111111-1111-4111-8111-111111111111';

function serviceWith(rowsFor: (sql: string) => unknown[] = () => []) {
	const calls: Array<{ sql: string; parameters: unknown[] }> = [];
	const db: Queryable = {
		query: async (sql: string, parameters: unknown[] = []) => {
			calls.push({ sql, parameters });
			return rowsFor(sql);
		},
	};
	return { service: new AdminAnalyticsService(() => db), calls };
}

describe('AdminAnalyticsService.auditLog filters (U-43)', () => {
	it('without filters: no WHERE, page and limit bound as before', async () => {
		const { service, calls } = serviceWith();
		await service.auditLog(2, 25);
		expect(calls[0].sql).not.toContain('WHERE');
		expect(calls[0].sql).toContain('LIMIT $1 OFFSET $2');
		expect(calls[0].parameters).toEqual([25, 25]);
		expect(calls[1].parameters).toEqual([]);
	});

	it('every filter becomes a bound condition, the same on the page and the count', async () => {
		const { service, calls } = serviceWith((sql) => (sql.includes('COUNT(*)') ? [{ total: '3' }] : []));
		const result = await service.auditLog(1, 10, {
			action: 'customer.delete',
			actor: 'Staff@Cheqd.io',
			targetCustomerId: target,
			q: "50%_'; DROP TABLE x; --",
			from: '2026-11-01',
			to: '2026-11-30',
		});
		expect(result.total).toBe(3);
		const [page, count] = calls;
		for (const clause of [
			'a."action" = $1',
			'(a."actorUserId" = $2 OR lower(sc."email") = lower($2))',
			'a."targetCustomerId" = $3::uuid',
			'(a."reason" ILIKE $4 OR a."ticketRef" ILIKE $4)',
			'a."createdAt" >= $5::timestamptz',
			`a."createdAt" < ($6::timestamptz + interval '1 day')`,
		]) {
			expect(page.sql).toContain(clause);
			expect(count.sql).toContain(clause);
		}
		expect(page.sql).toContain('LIMIT $7 OFFSET $8');
		expect(count.parameters).toEqual([
			'customer.delete',
			'Staff@Cheqd.io',
			target,
			"%50\\%\\_'; DROP TABLE x; --%",
			'2026-11-01T00:00:00Z',
			'2026-11-30T00:00:00Z',
		]);
		expect(page.parameters).toEqual([...count.parameters, 10, 0]);
		for (const { sql } of calls) expect(sql).not.toContain('DROP TABLE');
		// the count joins the staff email too, so the actor filter works there
		expect(count.sql).toContain('LEFT JOIN "customer" sc ON sc."customerId" = su."customerId"');
	});

	it('only the given filters are applied', async () => {
		const { service, calls } = serviceWith();
		await service.auditLog(1, 25, { action: 'flag.update' });
		expect(calls[1].sql).toContain('WHERE a."action" = $1');
		expect(calls[1].sql).not.toMatch(/ILIKE|actorUserId" =|targetCustomerId" =/);
		expect(calls[1].parameters).toEqual(['flag.update']);
	});
});

describe('GET /admin/audit-log filter validation', () => {
	const service = { auditLog: jest.fn(async () => ({ entries: [], total: 0 })) };
	const controller = new AuditLogAdminController(() => service as unknown as AdminAnalyticsService);
	const original = process.env.ENABLE_AUTHENTICATION;

	beforeEach(() => {
		service.auditLog.mockClear();
		Reflect.deleteProperty(process.env, 'ENABLE_AUTHENTICATION');
	});
	afterEach(() => {
		if (original === undefined) Reflect.deleteProperty(process.env, 'ENABLE_AUTHENTICATION');
		else process.env.ENABLE_AUTHENTICATION = original;
	});

	async function call(query: Record<string, string>) {
		const request = { method: 'GET', query, params: {}, body: {} } as unknown as Request;
		for (const validator of AuditLogAdminController.listValidator) await validator.run(request);
		const response = {
			locals: { scopes: [], staffIdentity: staffIdentity() },
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
		await controller.list(request, response as unknown as Response);
		return response;
	}

	it('passes the filters through, dropping empty ones', async () => {
		const query = {
			action: 'customer.delete',
			actor: 'staff@cheqd.io',
			targetCustomerId: target,
			q: 'SUP-12',
			from: '2026-11-01',
			to: '2026-11-01',
			page: '2',
		};
		expect((await call(query)).statusCode).toBe(200);
		expect(service.auditLog).toHaveBeenLastCalledWith(2, 25, {
			action: 'customer.delete',
			actor: 'staff@cheqd.io',
			targetCustomerId: target,
			q: 'SUP-12',
			from: '2026-11-01',
			to: '2026-11-01',
		});
	});

	it.each([
		['a non-UUID target', { targetCustomerId: 'org_1' }],
		['an action with spaces', { action: 'customer delete' }],
		['an upper-case action', { action: 'Customer.Delete' }],
		['an empty q', { q: '' }],
		['a long q', { q: 'x'.repeat(201) }],
		['a long actor', { actor: 'x'.repeat(201) }],
		['a bad from', { from: '2026-13-01' }],
		['a datetime to', { to: '2026-11-01T10:00:00Z' }],
		['from after to', { from: '2026-11-02', to: '2026-11-01' }],
	])('rejects %s with 400 and does not query', async (_name, query) => {
		expect((await call(query)).statusCode).toBe(400);
		expect(service.auditLog).not.toHaveBeenCalled();
	});
});

describe('migration 1791702500300: audit-log filter indexes', () => {
	it('adds two indexes, re-runnable, and down drops them', async () => {
		const statements: string[] = [];
		const queryRunner = { query: async (sql: string) => statements.push(sql) } as unknown as QueryRunner;
		await new StudioMigrations1791702500300().up(queryRunner);
		expect(statements).toEqual([
			`SET LOCAL lock_timeout = '3s'`,
			`CREATE INDEX IF NOT EXISTS "IDX_adminAuditLog_action_createdAt" ON "adminAuditLog" ("action", "createdAt")`,
			`CREATE INDEX IF NOT EXISTS "IDX_adminAuditLog_actorUserId_createdAt" ON "adminAuditLog" ("actorUserId", "createdAt")`,
		]);
		statements.length = 0;
		await new StudioMigrations1791702500300().down(queryRunner);
		expect(statements.slice(1)).toEqual([
			`DROP INDEX IF EXISTS "IDX_adminAuditLog_actorUserId_createdAt"`,
			`DROP INDEX IF EXISTS "IDX_adminAuditLog_action_createdAt"`,
		]);
	});
});
