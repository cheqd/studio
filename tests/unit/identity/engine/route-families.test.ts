import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EngineRouter } from '../../../../src/services/identity/engine/engine-router.js';
import type { ArtifactEngineLookup, EngineFlagLookup } from '../../../../src/services/identity/engine/engine-router.js';
import { EngineGoneError } from '../../../../src/services/identity/engine/errors.js';
import type { ArtifactRef, EngineName, RoutedFamily } from '../../../../src/services/identity/engine/types.js';

beforeEach(() => {
	jest.spyOn(console, 'info').mockImplementation(() => undefined);
});

/** A router whose artifact lookup answers `recorded` and whose flag lookup answers `flagged`. */
function router(recorded: unknown, flagged: unknown = null) {
	const artifacts: ArtifactEngineLookup = { recordedEngine: jest.fn(async () => recorded) };
	const flags: EngineFlagLookup = { flaggedEngine: jest.fn(async () => flagged) };
	return new EngineRouter(artifacts, flags);
}

const did: ArtifactRef = { kind: 'did', id: 'did:cheqd:testnet:abc' };
const statusList: ArtifactRef = { kind: 'status-list', id: 'registry-1' };
const credential: ArtifactRef = { kind: 'credential', id: 'issued-1' };

/**
 * Every route family a controller or service now routes through, with the artifact it passes (if any).
 * The decision rule is the same for all of them; the table proves each family reaches it.
 */
const FAMILIES: [string, RoutedFamily, ArtifactRef | undefined][] = [
	['key: create, import, read', 'key', undefined],
	['did: import, list', 'did', undefined],
	['did: update, deactivate, export, exists', 'did', did],
	['resource: list', 'resource', undefined],
	['resource: create under an existing DID', 'resource', did],
	['credential: verify', 'credential', undefined],
	['credential: get', 'credential', credential],
	['presentation: create, verify', 'presentation', undefined],
	['status-list: create', 'status-list', undefined],
	['status-list: update, check, search, revoke, suspend, reinstate', 'status-list', statusList],
	['status-list: check on an issued credential', 'status-list', credential],
];

describe('every routed family follows the same decision table', () => {
	describe.each(FAMILIES)('%s', (_label, route, artifact) => {
		it('uses veramo by default', async () => {
			expect(await router(null, null).decide({ route, artifact })).toMatchObject({ engine: 'veramo' });
		});

		it('uses veramo when a flag returns rubbish, and refuses an unreadable recorded engine', async () => {
			if (artifact) {
				await expect(router('nonsense', 'nonsense').decide({ route, artifact })).rejects.toMatchObject({
					status: 503,
				});
			} else {
				expect((await router('nonsense', 'nonsense').decide({ route, artifact })).engine).toBe('veramo');
			}
		});

		if (artifact) {
			it.each<EngineName>(['veramo', 'credo'])(
				'uses the engine recorded on the artifact (%s)',
				async (engine) => {
					// the flag points the other way and must be ignored
					const other: EngineName = engine === 'veramo' ? 'credo' : 'veramo';
					expect(await router(engine, other).decide({ route, artifact })).toEqual({
						engine,
						reason: 'artifact',
					});
				}
			);
		} else {
			it.each<EngineName>(['veramo', 'credo'])(
				'uses the flagged engine for a new artifact (%s)',
				async (engine) => {
					expect(await router(null, engine).decide({ route, customerId: 'c1' })).toEqual({
						engine,
						reason: 'flag',
					});
				}
			);
		}
	});
});

describe('key creation exceptions', () => {
	it.each(['Secp256r1', 'P-256', 'p256', 'JsonWebKey', 'JsonWebKey2020', ' secp256r1 '])(
		'%s always goes to credo, whatever the flag says',
		async (keyType) => {
			expect(await router(null, 'veramo').decide({ route: 'key', keyType })).toEqual({
				engine: 'credo',
				reason: 'exception',
				rule: 'p256-key',
			});
		}
	);

	it.each(['Ed25519', 'Secp256k1', 'X25519', undefined])('%s follows the flag and default', async (keyType) => {
		expect((await router(null, null).decide({ route: 'key', keyType })).engine).toBe('veramo');
		expect((await router(null, 'credo').decide({ route: 'key', keyType })).engine).toBe('credo');
	});

	it('does not consult the flag or the artifact lookup for P-256', async () => {
		const subject = router('veramo', 'veramo');
		await subject.decide({ route: 'key', keyType: 'Secp256r1' });
		expect((subject as unknown as { flags: EngineFlagLookup }).flags.flaggedEngine).not.toHaveBeenCalled();
	});
});

describe('encrypted status-list creation is gone on every engine', () => {
	it.each<[string, unknown, unknown]>([
		['default', null, null],
		['flagged credo', null, 'credo'],
		['flagged veramo', null, 'veramo'],
	])('%s', async (_name, recorded, flagged) => {
		await expect(
			router(recorded, flagged).decide({ route: 'status-list', encryptedStatusList: true })
		).rejects.toBeInstanceOf(EngineGoneError);
	});

	it('maps to 410', async () => {
		await expect(router(null).decide({ route: 'status-list', encryptedStatusList: true })).rejects.toMatchObject({
			status: 410,
			code: 'Gone',
		});
	});

	it('does not apply to unencrypted creation or to other families', async () => {
		expect(
			(await router(null).decide({ route: 'status-list', encryptedStatusList: false, creates: true })).engine
		).toBe('credo');
		expect((await router(null).decide({ route: 'credential', encryptedStatusList: true })).engine).toBe('veramo');
	});
});

describe('agent families are credo only', () => {
	it('ignores flags and artifacts', async () => {
		expect(await router('veramo', 'veramo').decide({ route: 'agent', artifact: did })).toEqual({
			engine: 'credo',
			reason: 'exception',
			rule: 'agent-route',
		});
	});
});
