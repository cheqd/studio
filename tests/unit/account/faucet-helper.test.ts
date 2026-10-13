import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { FaucetHelper, isFaucetTimeout } from '../../../src/helpers/faucet.js';

describe('FaucetHelper.delegateTokens timeout', () => {
	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('gives up with a TimeoutError when the faucet never answers', async () => {
		// A fetch that only settles when the request is aborted, like a hung connection
		jest.spyOn(globalThis, 'fetch').mockImplementation(
			(_url, init) =>
				new Promise((_resolve, reject) => {
					init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
				})
		);

		const started = Date.now();
		const outcome = await FaucetHelper.delegateTokens('cheqd1abc', 'A', 'B', 'a@b.io', 1000, 50).catch((e) => e);

		expect(isFaucetTimeout(outcome)).toBe(true);
		expect(Date.now() - started).toBeLessThan(2000);
	});

	it('passes an abort signal to fetch', async () => {
		const fetchSpy = jest
			.spyOn(globalThis, 'fetch')
			.mockResolvedValue({ status: 200, text: async () => '' } as unknown as Response);

		await FaucetHelper.delegateTokens('cheqd1abc', 'A', 'B', 'a@b.io', 1000);

		const init = fetchSpy.mock.calls[0][1] as RequestInit;
		expect(init.signal).toBeInstanceOf(AbortSignal);
		expect(init.signal?.aborted).toBe(false);
	});

	it('returns the faucet status and body when it answers in time', async () => {
		jest.spyOn(globalThis, 'fetch').mockResolvedValue({
			status: 500,
			text: async () => 'boom',
		} as unknown as Response);

		expect(await FaucetHelper.delegateTokens('cheqd1abc', 'A', 'B', 'a@b.io', 1000)).toEqual({
			status: 500,
			error: 'boom',
			data: {},
		});
	});
});

describe('isFaucetTimeout', () => {
	it('recognises timeouts and aborts, and nothing else', () => {
		expect(isFaucetTimeout(new DOMException('timed out', 'TimeoutError'))).toBe(true);
		expect(isFaucetTimeout(new DOMException('aborted', 'AbortError'))).toBe(true);
		expect(isFaucetTimeout(new Error('network down'))).toBe(false);
		expect(isFaucetTimeout(undefined)).toBe(false);
		expect(isFaucetTimeout(null)).toBe(false);
	});
});
