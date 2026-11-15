import { describe, expect, it, jest } from '@jest/globals';

const KEY = '1'.repeat(64);
const CREDENTIAL = 'eyJhbGciOiJFUzI1NiJ9.eyJzZWNyZXQtY3JlZGVudGlhbCI6dHJ1ZX0.c2lnbmF0dXJl';

type Row = Record<string, unknown>;
const rows = new Map<string, Row>();
const queries: { sql: string; params?: unknown[] }[] = [];

const repository = {
	update: async (where: { id: string }, change: Row) => {
		rows.set(where.id, { ...(rows.get(where.id) ?? { id: where.id }), ...change });
	},
	findOne: async () => ({ ...(rows.get('r1') as Row), customer: { customerId: 'c1' } }),
	query: async (sql: string, params?: unknown[]) => {
		queries.push({ sql, params });
		return [{ id: 'a' }, { id: 'b' }];
	},
};

jest.unstable_mockModule('../../../src/database/connection/connection.js', () => ({
	Connection: { instance: { dbConnection: { getRepository: () => repository, options: { type: 'postgres' } } } },
}));

const { TypeormIdempotencyStore } = await import('../../../src/services/idempotency/typeorm-idempotency-store.js');
const { createSecretBoxCipher } = await import('../../../src/services/idempotency/response-cipher.js');
const response = { status: 201, body: { agentId: 'a1', credential: CREDENTIAL } };

describe('stored idempotent responses', () => {
	it('keep no plaintext credential in the stored column, and replay the original body', async () => {
		const store = new TypeormIdempotencyStore(createSecretBoxCipher(KEY));
		await store.settle('r1', { state: 'succeeded', txHash: 'ABC', response });

		const column = JSON.stringify(rows.get('r1')?.response);
		expect(column).not.toContain(CREDENTIAL);
		expect(column).not.toContain('agentId');
		expect(rows.get('r1')?.response).toMatchObject({ v: 1 });

		expect((await store.find('c1', 'k'))?.response).toEqual(response);
	});

	it('seal failed responses too, and leave a settle without a response alone', async () => {
		const store = new TypeormIdempotencyStore(createSecretBoxCipher(KEY));
		await store.settle('r2', { state: 'unknown' });
		expect(rows.get('r2')?.response).toBeUndefined();
		await store.settle('r3', { state: 'failed', response: { status: 500, body: { error: 'x' } } });
		expect(JSON.stringify(rows.get('r3')?.response)).not.toContain('"error"');
	});

	it('read a response written before sealing existed, and fail closed on a wrong key', async () => {
		rows.set('r1', { id: 'r1', state: 'succeeded', response });
		expect((await new TypeormIdempotencyStore(createSecretBoxCipher(KEY)).find('c1', 'k'))?.response).toEqual(
			response
		);

		await new TypeormIdempotencyStore(createSecretBoxCipher(KEY)).settle('r1', { state: 'succeeded', response });
		const other = new TypeormIdempotencyStore(createSecretBoxCipher('2'.repeat(64)));
		expect((await other.find('c1', 'k'))?.response).toBeNull();
	});

	it('refuses to start without an encryption key', () => {
		expect(() => createSecretBoxCipher('')).toThrow('EXTERNAL_DB_ENCRYPTION_KEY');
	});

	it('purges expired rows in a bounded batch', async () => {
		const store = new TypeormIdempotencyStore(createSecretBoxCipher(KEY));
		expect(await store.purgeExpired(50)).toBe(2);
		const { sql, params } = queries[queries.length - 1];
		expect(sql).toContain('"expiresAt" < now()');
		expect(sql).toContain('LIMIT $1');
		expect(params).toEqual([50]);
	});
});
