import { describe, expect, it, jest } from '@jest/globals';
import { createOriginCheck } from '../../../src/helpers/cors-origin.js';
import { CORS_ERROR_MSG } from '../../../src/types/constants.js';

function setup() {
	let clock = 1_000_000;
	const log = jest.fn<(line: string) => void>();
	const check = createOriginCheck({
		allowedOrigins: 'https://studio.example,https://portal.example',
		log,
		now: () => clock,
	});
	const run = (origin?: string) => {
		const callback = jest.fn<(error: Error | null, allow?: boolean) => void>();
		check(origin, callback);
		return callback;
	};
	return { log, run, advance: (ms: number) => (clock += ms) };
}

describe('CORS origin check', () => {
	it('logs a rejected origin once per minute, not on every request', () => {
		const { log, run, advance } = setup();
		for (let i = 0; i < 50; i++) run('https://evil.example');
		expect(log).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith('CORS: origin https://evil.example is not in CORS_ALLOWED_ORIGINS');
		advance(59_000);
		run('https://evil.example');
		expect(log).toHaveBeenCalledTimes(1);
		advance(1_001);
		run('https://evil.example');
		expect(log).toHaveBeenCalledTimes(2);
	});

	it('logs each rejected origin separately', () => {
		const { log, run } = setup();
		run('https://a.example');
		run('https://b.example');
		expect(log).toHaveBeenCalledTimes(2);
	});

	it('logs nothing for an allowed origin or for a request without an origin', () => {
		const { log, run } = setup();
		expect(run('https://portal.example')).toHaveBeenCalledWith(null, true);
		expect(run(undefined)).toHaveBeenCalledWith(null, true);
		expect(log).not.toHaveBeenCalled();
	});

	it('answers a rejected origin exactly as before and never reveals the allow-list', () => {
		const { log, run } = setup();
		const callback = run('https://evil.example');
		const [error, allow] = callback.mock.calls[0];
		expect(allow).toBe(false);
		expect((error as Error).message).toBe(CORS_ERROR_MSG);
		expect(JSON.stringify(log.mock.calls)).not.toContain('studio.example');
	});

	it('keeps the existing matching rules', () => {
		const { run } = setup();
		// substring matching is tracked separately in the production gate and is deliberately unchanged
		expect(run('portal.example')).toHaveBeenCalledWith(null, true);
	});

	it('strips control characters from the logged origin', () => {
		const { log, run } = setup();
		run('https://x.example\nFAKE LOG LINE');
		expect(String(log.mock.calls[0][0])).not.toContain('\n');
	});
});
