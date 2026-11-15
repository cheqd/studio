import { afterEach, describe, expect, it, jest } from '@jest/globals';
import type { NextFunction, Request, Response } from 'express';
import {
	FRESH_SIGNIN_ERROR_CODE,
	getFreshSignInMaxAgeSeconds,
	requireFreshSignIn,
} from '../../../src/middleware/fresh-signin.js';

const NOW_MS = 1_800_000_000_000;
const nowSeconds = NOW_MS / 1000;

function run(authTime: unknown, opts: { maxAgeSeconds?: number } = {}) {
	const headers: Record<string, string> = {};
	const res = { locals: { authTime }, statusCode: 0, body: undefined as unknown } as Record<string, any>;
	res.status = jest.fn((c: number) => {
		res.statusCode = c;
		return res;
	});
	res.json = jest.fn((b: unknown) => {
		res.body = b;
		return res;
	});
	res.setHeader = jest.fn((k: string, v: string) => {
		headers[k] = v;
	});
	const next = jest.fn() as unknown as NextFunction;
	requireFreshSignIn({ ...opts, now: () => NOW_MS })({} as Request, res as unknown as Response, next);
	return { res, next, headers };
}

afterEach(() => {
	delete process.env.FRESH_SIGNIN_MAX_AGE_SECONDS;
});

describe('requireFreshSignIn', () => {
	it('accepts a sign-in 30 seconds old', () => {
		const { next } = run(nowSeconds - 30);
		expect(next).toHaveBeenCalled();
	});

	it('rejects a stale auth_time (10 minutes old) with a distinct error code', () => {
		const { res, next, headers } = run(nowSeconds - 600);
		expect(next).not.toHaveBeenCalled();
		expect(res.statusCode).toBe(401);
		expect(res.body.code).toBe(FRESH_SIGNIN_ERROR_CODE);
		expect(res.body.maxAgeSeconds).toBe(300);
		expect(headers['WWW-Authenticate']).toContain('insufficient_user_authentication');
		expect(headers['WWW-Authenticate']).toContain('max_age=300');
	});

	it('rejects when auth_time is missing (fails closed)', () => {
		for (const value of [undefined, null, 'yesterday', NaN]) {
			const { res, next } = run(value);
			expect(next).not.toHaveBeenCalled();
			expect(res.body.code).toBe(FRESH_SIGNIN_ERROR_CODE);
		}
	});

	it('rejects an auth_time in the future beyond clock skew', () => {
		const { next } = run(nowSeconds + 3600);
		expect(next).not.toHaveBeenCalled();
	});

	it('defaults to 300 seconds and honours FRESH_SIGNIN_MAX_AGE_SECONDS', () => {
		expect(getFreshSignInMaxAgeSeconds()).toBe(300);
		process.env.FRESH_SIGNIN_MAX_AGE_SECONDS = '60';
		expect(getFreshSignInMaxAgeSeconds()).toBe(60);
		expect(run(nowSeconds - 120).next).not.toHaveBeenCalled();
		process.env.FRESH_SIGNIN_MAX_AGE_SECONDS = 'garbage';
		expect(getFreshSignInMaxAgeSeconds()).toBe(300);
	});

	it('falls back to 300 for 0, -5 and abc', () => {
		for (const value of ['0', '-5', 'abc']) {
			process.env.FRESH_SIGNIN_MAX_AGE_SECONDS = value;
			expect(getFreshSignInMaxAgeSeconds()).toBe(300);
		}
	});
});
