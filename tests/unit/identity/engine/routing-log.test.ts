import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EngineRouter } from '../../../../src/services/identity/engine/engine-router.js';
import { logRoutingOutcome, outcomeOf, routingLogLine } from '../../../../src/services/identity/engine/routing-log.js';
import { operationRouting, networkOf } from '../../../../src/services/track/operation-routing.js';
import {
	currentRequestContext,
	newRequestId,
	runWithRequestContext,
	startRequestContext,
} from '../../../../src/services/request-context.js';
import type { IIdentityService } from '../../../../src/services/identity/index.js';

const router = (recorded: unknown = null, flagged: unknown = null) =>
	new EngineRouter(
		{ recordedEngine: async () => recorded },
		{ flaggedEngine: async () => flagged },
		{ veramo: () => ({ name: 'veramo' }) as never, credo: () => ({ name: 'credo' }) as never }
	);

beforeEach(() => {
	jest.spyOn(console, 'info').mockImplementation(() => undefined);
});

describe('routing log lines (engine spec 4.3)', () => {
	it('carries requestId, customerId, route family, engine, rule, outcome and duration, and nothing else', async () => {
		const context = startRequestContext('req-12345678', 1000);
		await runWithRequestContext(context, () =>
			router(null, 'credo').engineFor({ route: 'did', customerId: 'c1' }, {} as IIdentityService)
		);
		const lines: string[] = [];
		logRoutingOutcome(context, { status: 200 }, (line) => lines.push(line));
		// Reading the clock inside the helper makes the duration non-negative
		const parsed = JSON.parse(lines[0]);
		expect(Object.keys(parsed).sort()).toEqual(
			[
				'customerId',
				'durationMs',
				'engine',
				'event',
				'outcome',
				'requestId',
				'routeFamily',
				'rule',
				'status',
			].sort()
		);
		expect(parsed).toMatchObject({
			event: 'engine-routed',
			requestId: 'req-12345678',
			customerId: 'c1',
			routeFamily: 'did',
			engine: 'credo',
			rule: 'flag',
			outcome: 'ok',
			status: 200,
		});
		expect(parsed.durationMs).toBeGreaterThanOrEqual(0);
	});

	it.each([
		[
			'artifact',
			router('credo'),
			{ route: 'did' as const, artifact: { kind: 'did' as const, id: 'did:cheqd:testnet:a' } },
			'artifact',
		],
		['flag', router(null, 'credo'), { route: 'did' as const }, 'flag'],
		['default', router(), { route: 'did' as const }, 'default'],
		['exception', router(), { route: 'agent' as const }, 'exception:agent-route'],
		['p256 exception', router(), { route: 'key' as const, keyType: 'Secp256r1' }, 'exception:p256-key'],
	])('names the rule that chose the engine: %s', async (_name, subject, decisionContext, rule) => {
		const context = startRequestContext(undefined, Date.now());
		await runWithRequestContext(context, () =>
			subject.engineFor({ ...decisionContext, customerId: 'c1' }, {} as IIdentityService)
		);
		expect(routingLogLine(context, context.decisions[0], { status: 200 }).rule).toBe(rule);
	});

	it('records a refused request (Gone) with engine none and the rule', async () => {
		const context = startRequestContext(undefined, Date.now());
		await expect(
			runWithRequestContext(context, () =>
				router().engineFor(
					{ route: 'status-list', encryptedStatusList: true, customerId: 'c1' },
					{} as IIdentityService
				)
			)
		).rejects.toMatchObject({ code: 'Gone' });
		const line = routingLogLine(context, context.decisions[0], { status: 410 });
		expect(line).toMatchObject({
			engine: 'none',
			rule: 'exception:encrypted-status-list',
			outcome: 'error',
			status: 410,
		});
	});

	it('logs at once, with an unknown outcome, when there is no request to wait for', async () => {
		await router(null, 'credo').engineFor({ route: 'did', customerId: 'c1' }, {} as IIdentityService);
		const line = JSON.parse((console.info as jest.Mock).mock.calls.at(-1)?.[0] as string);
		expect(line).toMatchObject({ event: 'engine-routed', engine: 'credo', outcome: 'unknown', status: null });
	});

	it('maps statuses to outcomes', () => {
		expect([outcomeOf(200), outcomeOf(302), outcomeOf(404), outcomeOf(503), outcomeOf(undefined)]).toEqual([
			'ok',
			'ok',
			'error',
			'error',
			'unknown',
		]);
	});

	it('takes a plain X-Request-Id from the caller and replaces anything else', () => {
		expect(newRequestId('abc-12345678')).toBe('abc-12345678');
		expect(newRequestId('has spaces and <script>')).toMatch(/^[0-9a-f-]{36}$/);
		expect(newRequestId(undefined)).toMatch(/^[0-9a-f-]{36}$/);
	});
});

describe('operation columns', () => {
	const operation = (overrides: Record<string, unknown> = {}) =>
		({
			name: 'createDid',
			category: 'did',
			data: { did: 'did:cheqd:testnet:abc' },
			customer: {},
			...overrides,
		}) as never;

	it('fills engine, outcome, durationMs and network from the request and the operation', async () => {
		const context = startRequestContext(undefined, 1000);
		await runWithRequestContext(context, async () => {
			await router(null, 'credo').engineFor({ route: 'did', customerId: 'c1' }, {} as IIdentityService);
			expect(currentRequestContext()).toBe(context);
			expect(operationRouting(operation(), 1250)).toEqual({
				engine: 'credo',
				network: 'testnet',
				outcome: 'ok',
				durationMs: 250,
			});
			expect(operationRouting(operation({ successful: false }), 1250).outcome).toBe('error');
			expect(
				operationRouting(operation({ data: { did: 'did:cheqd:mainnet:x', error: 'boom' } }), 1250)
			).toMatchObject({
				outcome: 'error',
				network: 'mainnet',
			});
		});
	});

	it('leaves the engine empty when the request never reached the router, and does not guess a duration', () => {
		expect(operationRouting(operation())).toEqual({
			engine: undefined,
			network: 'testnet',
			outcome: 'ok',
			durationMs: undefined,
		});
	});

	it('takes the network from the fee payment when the DID does not say', () => {
		expect(networkOf({ data: { keyRef: 'k' }, feePaymentOptions: [{ network: 'mainnet' }] } as never)).toBe(
			'mainnet'
		);
		expect(networkOf({ data: { keyRef: 'k' } } as never)).toBeUndefined();
	});
});
