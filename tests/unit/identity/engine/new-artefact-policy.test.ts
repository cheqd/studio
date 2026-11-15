import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EngineRouter } from '../../../../src/services/identity/engine/engine-router.js';
import type { ArtifactEngineLookup, EngineFlagLookup } from '../../../../src/services/identity/engine/engine-router.js';
import { EngineRoutingUnavailableError } from '../../../../src/services/identity/engine/errors.js';
import { VERAMO_OVERRIDE_ENV } from '../../../../src/services/identity/engine/new-artefact-policy.js';
import type { ArtifactRef, EngineRoute } from '../../../../src/services/identity/engine/types.js';

let warn: jest.SpiedFunction<typeof console.warn>;

beforeEach(() => {
	jest.spyOn(console, 'info').mockImplementation(() => undefined);
	warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
	delete process.env[VERAMO_OVERRIDE_ENV];
});

afterEach(() => {
	delete process.env[VERAMO_OVERRIDE_ENV];
	jest.restoreAllMocks();
});

function router(recorded: unknown, flagged: unknown) {
	const artifacts: ArtifactEngineLookup = { recordedEngine: jest.fn(async () => recorded) };
	const flags: EngineFlagLookup = {
		flaggedEngine: jest.fn(async () => {
			if (flagged instanceof Error) throw flagged;
			return flagged;
		}),
	};
	return { subject: new EngineRouter(artifacts, flags), flags };
}

/**
 * One row per artefact family. `create` is what the creating call site asks for; `existing` is the artefact an
 * update, revoke, suspend, verify or read names (the issuer DID for a credential).
 */
const FAMILIES: {
	name: string;
	route: EngineRoute;
	create: { creates?: true; flagWhenUnrecorded?: true; artifact?: ArtifactRef };
	existing: ArtifactRef;
}[] = [
	{
		name: 'did (create, import)',
		route: 'did',
		create: { creates: true },
		existing: { kind: 'did', id: 'did:cheqd:testnet:abc' },
	},
	{ name: 'key (create, import)', route: 'key', create: { creates: true }, existing: { kind: 'did', id: 'd' } },
	{
		name: 'status-list (create)',
		route: 'status-list',
		create: { creates: true },
		existing: { kind: 'status-list', id: 'registry-1' },
	},
	{
		name: 'credential (issue by an issuer Studio has no record of)',
		route: 'credential',
		create: { flagWhenUnrecorded: true, artifact: { kind: 'did', id: 'did:cheqd:testnet:unknown' } },
		existing: { kind: 'credential', id: 'issued-1' },
	},
	{
		name: 'resource (create under a DID that is not recorded)',
		route: 'resource',
		create: { flagWhenUnrecorded: true, artifact: { kind: 'did', id: 'did:cheqd:testnet:unknown' } },
		existing: { kind: 'did', id: 'did:cheqd:testnet:abc' },
	},
];

describe.each(FAMILIES)('$name', ({ route, create, existing }) => {
	const context = { route, customerId: 'c1', ...create };

	describe('a new artefact goes to Credo whatever the flag table says', () => {
		it.each<[string, unknown]>([
			['no flag', null],
			['a veramo flag', 'veramo'],
			['a credo flag', 'credo'],
			['an unreadable flag', 'nonsense'],
		])('%s', async (_label, flagged) => {
			const { subject, flags } = router(undefined, flagged);
			expect(await subject.decide(context)).toEqual({ engine: 'credo', reason: 'default' });
			// The flag table is not even read: a flag outage cannot fail a create
			expect(flags.flaggedEngine).not.toHaveBeenCalled();
		});

		it('is not affected by a failing flag read', async () => {
			const { subject } = router(undefined, new Error('db down'));
			expect((await subject.decide(context)).engine).toBe('credo');
		});
	});

	describe('an existing artefact keeps its recorded engine', () => {
		it.each<[string, unknown, string]>([
			['recorded veramo, flag credo', 'veramo', 'credo'],
			['recorded veramo, no flag', 'veramo', 'null'],
			['recorded credo, flag veramo', 'credo', 'veramo'],
		])('%s', async (_label, recorded, flagged) => {
			const { subject } = router(recorded, flagged === 'null' ? null : flagged);
			expect(await subject.decide({ route, customerId: 'c1', artifact: existing })).toEqual({
				engine: recorded,
				reason: 'artifact',
			});
		});

		it.each<[string, unknown]>([
			['null engine column', null],
			['empty engine column', ''],
		])(
			'a legacy row with an %s stays on veramo, even with a credo flag and the override off',
			async (_l, recorded) => {
				const { subject } = router(recorded, 'credo');
				expect(await subject.decide({ route, customerId: 'c1', artifact: existing, ...create })).toEqual({
					engine: 'veramo',
					reason: 'default',
				});
			}
		);

		it('a failed artefact lookup is still refused with 503, never answered by credo or veramo', async () => {
			const subject = new EngineRouter(
				{ recordedEngine: async () => Promise.reject(new Error('down')) },
				{ flaggedEngine: async () => null }
			);
			await expect(subject.decide({ route, artifact: existing })).rejects.toBeInstanceOf(
				EngineRoutingUnavailableError
			);
		});
	});

	describe('the temporary Veramo override (off by default)', () => {
		it('with the variable on and a veramo flag, a new artefact goes to veramo and is logged', async () => {
			process.env[VERAMO_OVERRIDE_ENV] = 'true';
			const { subject } = router(undefined, 'veramo');
			expect(await subject.decide(context)).toEqual({ engine: 'veramo', reason: 'flag' });
			expect(warn).toHaveBeenCalledTimes(1);
			expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({
				event: 'veramo-new-artefact-override',
				routeFamily: route,
				customerId: 'c1',
			});
		});

		it('with the variable on but no veramo flag, a new artefact still goes to credo', async () => {
			process.env[VERAMO_OVERRIDE_ENV] = 'true';
			expect((await router(undefined, null).subject.decide(context)).engine).toBe('credo');
			expect((await router(undefined, 'credo').subject.decide(context)).engine).toBe('credo');
			expect(warn).not.toHaveBeenCalled();
		});

		it('only the exact value "true" turns it on', async () => {
			process.env[VERAMO_OVERRIDE_ENV] = '1';
			expect((await router(undefined, 'veramo').subject.decide(context)).engine).toBe('credo');
		});

		it('with the variable on, a failing flag read is refused with 503, not guessed', async () => {
			process.env[VERAMO_OVERRIDE_ENV] = 'true';
			await expect(router(undefined, new Error('db down')).subject.decide(context)).rejects.toBeInstanceOf(
				EngineRoutingUnavailableError
			);
		});

		it('does not move an existing artefact', async () => {
			process.env[VERAMO_OVERRIDE_ENV] = 'true';
			const { subject } = router('credo', 'veramo');
			expect((await subject.decide({ route, artifact: existing })).engine).toBe('credo');
		});
	});
});

describe('operations that create nothing and name no artefact keep the legacy choice', () => {
	it.each<EngineRoute>(['verify', 'presentation', 'credential', 'key', 'did'])(
		'%s: veramo with no flag',
		async (route) => {
			expect((await router(undefined, null).subject.decide({ route })).engine).toBe('veramo');
		}
	);
});
