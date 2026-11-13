import { beforeEach, describe, expect, it } from '@jest/globals';
import {
	IdempotencyError,
	IdempotencyService,
	canonicalJson,
	hashRequest,
	isTimeoutError,
} from '../../../src/services/idempotency/idempotency.js';
import type { IdempotencyRecord, IdempotencyStore } from '../../../src/services/idempotency/idempotency.js';
import { LedgerUnavailableError } from '../../../src/services/identity/ledger-lock.js';

class MemoryStore implements IdempotencyStore {
	rows = new Map<string, IdempotencyRecord>();
	committedBeforeWrite: string[] = [];
	private seq = 0;
	async insertSubmitting(row: Parameters<IdempotencyStore['insertSubmitting']>[0]) {
		const id = `${row.customerId}:${row.key}`;
		if (this.rows.has(id)) return null;
		const record: IdempotencyRecord = { id, ...row, state: 'submitting' };
		this.rows.set(id, record);
		this.seq++;
		return { ...record };
	}
	async find(customerId: string, key: string) {
		const row = this.rows.get(`${customerId}:${key}`);
		return row ? { ...row } : null;
	}
	async settle(id: string, change: Parameters<IdempotencyStore['settle']>[1]) {
		Object.assign(this.rows.get(id) as IdempotencyRecord, change);
	}
	async remove(id: string) {
		this.rows.delete(id);
	}
	only() {
		return [...this.rows.values()][0];
	}
}

let store: MemoryStore;
let service: IdempotencyService;
const input = (overrides: Record<string, unknown> = {}) => ({
	customerId: 'c1',
	key: 'k1',
	route: 'POST /agents',
	requestHash: hashRequest({ name: 'a' }),
	...overrides,
});
const ok = { status: 201, body: { agentId: 'a1' }, txHash: 'ABC' };

beforeEach(() => {
	store = new MemoryStore();
	service = new IdempotencyService({ store });
});

describe('IdempotencyService', () => {
	it('records the key as submitting before the write runs, then settles to succeeded with the hash', async () => {
		let stateDuringWrite: string | undefined;
		const outcome = await service.execute(input(), async () => {
			stateDuringWrite = store.only().state;
			return ok;
		});
		expect(stateDuringWrite).toBe('submitting');
		expect(outcome).toEqual({ replayed: false, result: ok });
		expect(store.only()).toMatchObject({ state: 'succeeded', txHash: 'ABC' });
	});

	it('returns the first result on a retry with the same key and request, without writing again', async () => {
		let writes = 0;
		const write = async () => (writes++, ok);
		await service.execute(input(), write);
		const retry = await service.execute(input(), write);
		expect(writes).toBe(1);
		expect(retry).toMatchObject({ replayed: true, state: 'succeeded', result: { status: 201, body: ok.body } });
	});

	it('answers 422 for the same key with a different request, and does not write', async () => {
		await service.execute(input(), async () => ok);
		let writes = 0;
		const error = await service
			.execute(input({ requestHash: hashRequest({ name: 'b' }) }), async () => (writes++, ok))
			.catch((e) => e);
		expect(error).toBeInstanceOf(IdempotencyError);
		expect(error.status).toBe(422);
		expect(writes).toBe(0);
	});

	it('scopes keys to the customer', async () => {
		await service.execute(input(), async () => ok);
		let writes = 0;
		await service.execute(input({ customerId: 'c2' }), async () => (writes++, ok));
		expect(writes).toBe(1);
	});

	it('settles a failed write to failed, rethrows, and replays the failure on retry', async () => {
		const failure = Object.assign(new Error('Agent not found'), { status: 404, code: 'not_found' });
		await expect(
			service.execute(input(), async () => {
				throw failure;
			})
		).rejects.toBe(failure);
		expect(store.only().state).toBe('failed');
		const retry = await service.execute(input(), async () => ok);
		expect(retry).toMatchObject({
			replayed: true,
			state: 'failed',
			result: { status: 404, body: { error: 'Agent not found', code: 'not_found' } },
		});
	});

	it('does not store the message of an unexpected error', async () => {
		await expect(
			service.execute(input(), async () => {
				throw new Error('connect ECONNREFUSED 10.0.0.1:26657');
			})
		).rejects.toThrow('ECONNREFUSED');
		expect(JSON.stringify(store.only().response)).not.toContain('ECONNREFUSED');
	});

	it('marks a cosmjs-style timeout unknown, throws LedgerUnavailable with the key, and never writes again', async () => {
		const timeout = Object.assign(
			new Error('Transaction with ID ABC was submitted but was not included in a block'),
			{
				name: 'TimeoutError',
			}
		);
		const error = await service
			.execute(input(), async () => {
				throw timeout;
			})
			.catch((e) => e);
		expect(error).toBeInstanceOf(LedgerUnavailableError);
		expect(error.idempotencyKey).toBe('k1');
		expect(store.only().state).toBe('unknown');

		let writes = 0;
		const retry = await service.execute(input(), async () => (writes++, ok)).catch((e) => e);
		expect(retry).toBeInstanceOf(LedgerUnavailableError);
		expect(retry.idempotencyKey).toBe('k1');
		expect(writes).toBe(0);
	});

	it('marks the key unknown when the deadline passes first', async () => {
		const never = () => new Promise<never>(() => undefined);
		const error = await service.execute(input({ deadlineMs: 20 }), never).catch((e) => e);
		expect(error).toBeInstanceOf(LedgerUnavailableError);
		expect(store.only().state).toBe('unknown');
	});

	it('forgets the key when the payer lock was never taken (nothing was written), so a retry can proceed', async () => {
		await expect(
			service.execute(input(), async () => {
				throw new LedgerUnavailableError('busy');
			})
		).rejects.toBeInstanceOf(LedgerUnavailableError);
		expect(store.rows.size).toBe(0);
		expect((await service.execute(input(), async () => ok)).replayed).toBe(false);
	});

	it('answers 409 while the first attempt is still submitting, and never writes', async () => {
		let release: () => void = () => undefined;
		const first = service.execute(input(), () => new Promise((resolve) => (release = () => resolve(ok))));
		await new Promise((resolve) => setImmediate(resolve));
		let writes = 0;
		const error = await service.execute(input(), async () => (writes++, ok)).catch((e) => e);
		expect(error).toBeInstanceOf(IdempotencyError);
		expect(error.status).toBe(409);
		expect(writes).toBe(0);
		release();
		await first;
	});

	it('rejects an empty or oversized key', async () => {
		await expect(service.execute(input({ key: '' }), async () => ok)).rejects.toMatchObject({ status: 400 });
		await expect(service.execute(input({ key: 'x'.repeat(256) }), async () => ok)).rejects.toMatchObject({
			status: 400,
		});
	});
});

describe('request hashing', () => {
	it('ignores key order and undefined fields', () => {
		expect(hashRequest({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(
			hashRequest({ b: { d: [1, 2], c: 2 }, a: 1, e: undefined })
		);
		expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
		expect(hashRequest({ a: 1 })).not.toBe(hashRequest({ a: 2 }));
	});

	it('recognises timeouts', () => {
		expect(isTimeoutError(Object.assign(new Error('x'), { name: 'TimeoutError' }))).toBe(true);
		expect(isTimeoutError(new Error('insufficient funds'))).toBe(false);
	});
});
