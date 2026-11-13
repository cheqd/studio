import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EngineRouter } from '../../../../src/services/identity/engine/engine-router.js';
import type {
	ArtifactEngineLookup,
	EngineFactory,
	EngineFlagLookup,
} from '../../../../src/services/identity/engine/engine-router.js';
import {
	EngineNotImplementedError,
	createCredoEngineStub,
} from '../../../../src/services/identity/engine/credo-engine.js';
import { EngineGoneError } from '../../../../src/services/identity/engine/errors.js';
import { isP256KeyType } from '../../../../src/services/identity/engine/engine-router.js';
import { VeramoEngine } from '../../../../src/services/identity/engine/veramo-engine.js';
import type { IIdentityService } from '../../../../src/services/identity/index.js';
import type { EngineName } from '../../../../src/services/identity/engine/types.js';

beforeEach(() => {
	// Routing decisions made outside a request are logged at once; keep the test output quiet
	jest.spyOn(console, 'info').mockImplementation(() => undefined);
});

const did = { kind: 'did', id: 'did:cheqd:testnet:abc' } as const;

function router(recorded: unknown | Error, flagged: unknown | Error = null) {
	const artifacts: ArtifactEngineLookup = {
		recordedEngine: jest.fn(async () => {
			if (recorded instanceof Error) throw recorded;
			return recorded;
		}),
	};
	const flags: EngineFlagLookup = {
		flaggedEngine: jest.fn(async () => {
			if (flagged instanceof Error) throw flagged;
			return flagged;
		}),
	};
	return { subject: new EngineRouter(artifacts, flags), artifacts, flags };
}

describe('EngineRouter decision table', () => {
	describe('operation on an existing artifact: the recorded engine wins', () => {
		it.each<[string, unknown, EngineName]>([
			['recorded veramo', 'veramo', 'veramo'],
			['recorded credo', 'credo', 'credo'],
		])('%s', async (_name, recorded, expected) => {
			const { subject, flags } = router(recorded, 'veramo');
			expect(await subject.decide({ route: 'did', customerId: 'c1', artifact: did })).toEqual({
				engine: expected,
				reason: 'artifact',
			});
			expect(flags.flaggedEngine).not.toHaveBeenCalled();
		});

		it('ignores a flag that points the other way', async () => {
			const { subject } = router('veramo', 'credo');
			expect((await subject.decide({ route: 'did', customerId: 'c1', artifact: did })).engine).toBe('veramo');
		});
	});

	describe('missing or unreadable engine column reads as veramo', () => {
		it.each<[string, unknown]>([
			['null', null],
			['undefined (row without the column)', undefined],
			['empty string', ''],
			['unknown engine name', 'something-else'],
			['non-string', 42],
			['query error (column does not exist)', new Error('column "engine" does not exist')],
		])('%s', async (_name, recorded) => {
			const { subject } = router(recorded, 'credo');
			expect(await subject.decide({ route: 'did', customerId: 'c1', artifact: did })).toEqual({
				engine: 'veramo',
				reason: 'default',
			});
		});
	});

	describe('new artifact: the featureFlag value, else the global default', () => {
		it('uses the flagged engine', async () => {
			const { subject, artifacts } = router('veramo', 'credo');
			expect(await subject.decide({ route: 'did', customerId: 'c1' })).toEqual({
				engine: 'credo',
				reason: 'flag',
			});
			expect(artifacts.recordedEngine).not.toHaveBeenCalled();
		});

		it('falls back to veramo with no flag', async () => {
			const { subject } = router(null, null);
			expect(await subject.decide({ route: 'credential', customerId: 'c1' })).toEqual({
				engine: 'veramo',
				reason: 'default',
			});
		});

		it.each<[string, unknown]>([
			['an invalid flag value', 'nonsense'],
			['a failing flag lookup (table missing)', new Error('relation "featureFlag" does not exist')],
		])('falls back to veramo on %s', async (_name, flagged) => {
			const { subject } = router(null, flagged);
			expect((await subject.decide({ route: 'did' })).engine).toBe('veramo');
		});
	});

	describe('engineFor', () => {
		const service = {} as IIdentityService;

		it('returns a VeramoEngine by default', async () => {
			const engine = await router(null).subject.engineFor({ route: 'did' }, service);
			expect(engine).toBeInstanceOf(VeramoEngine);
			expect(engine.name).toBe('veramo');
		});

		it('returns the factory for the chosen engine', async () => {
			const credo = { name: 'credo' } as ReturnType<EngineFactory>;
			const { artifacts, flags } = router(null, 'credo');
			const subject = new EngineRouter(artifacts, flags, {
				veramo: (s) => new VeramoEngine(s),
				credo: () => credo,
			});
			expect(await subject.engineFor({ route: 'did' }, service)).toBe(credo);
		});
	});
});

describe('EngineRouter exceptions (engine spec 4.1)', () => {
	describe('agent route families always use Credo', () => {
		it.each<[string, unknown, unknown, boolean]>([
			['no flag, no artifact', null, 'veramo', false],
			['a flag that points at veramo', null, 'veramo', false],
			['a recorded veramo artifact', 'veramo', 'veramo', true],
			['an unreadable flag lookup', null, new Error('db down'), false],
		])('%s', async (_name, recorded, flagged, withArtifact) => {
			const { subject } = router(recorded, flagged);
			expect(
				await subject.decide({
					route: 'agent',
					customerId: 'c1',
					artifact: withArtifact ? did : undefined,
				})
			).toEqual({ engine: 'credo', reason: 'exception', rule: 'agent-route' });
		});

		it('never reads the flags or the artifact table', async () => {
			const { subject, flags, artifacts } = router('veramo', 'veramo');
			await subject.decide({ route: 'agent', customerId: 'c1', artifact: did });
			expect(flags.flaggedEngine).not.toHaveBeenCalled();
			expect(artifacts.recordedEngine).not.toHaveBeenCalled();
		});

		it('returns the Credo factory from engineFor', async () => {
			const veramo = jest.fn();
			const credo = jest.fn(() => createCredoEngineStub());
			const subject = new EngineRouter(
				{ recordedEngine: async () => 'veramo' },
				{ flaggedEngine: async () => 'veramo' },
				{ veramo: veramo as never, credo }
			);
			await subject.engineFor({ route: 'agent', customerId: 'c1' }, {} as IIdentityService);
			expect(credo).toHaveBeenCalledTimes(1);
			expect(veramo).not.toHaveBeenCalled();
		});
	});

	describe('P-256 key creation always uses Credo', () => {
		it.each(['Secp256r1', 'secp256r1', 'P-256', 'p256', 'JsonWebKey', 'JsonWebKey2020'])('%s', async (keyType) => {
			const { subject } = router(null, 'veramo');
			expect(await subject.decide({ route: 'key', customerId: 'c1', keyType })).toEqual({
				engine: 'credo',
				reason: 'exception',
				rule: 'p256-key',
			});
		});

		it('also applies when a DID is created with a P-256 key, and beats a recorded veramo artifact', async () => {
			const { subject } = router('veramo', 'veramo');
			expect((await subject.decide({ route: 'did', customerId: 'c1', keyType: 'Secp256r1' })).engine).toBe(
				'credo'
			);
			expect(
				(await subject.decide({ route: 'did', customerId: 'c1', keyType: 'Secp256r1', artifact: did })).engine
			).toBe('credo');
		});

		it.each(['Ed25519', 'Secp256k1', 'X25519', undefined, ''])(
			'other key types follow the flag: %s',
			async (keyType) => {
				const { subject } = router(null, 'veramo');
				expect(await subject.decide({ route: 'key', customerId: 'c1', keyType })).toEqual({
					engine: 'veramo',
					reason: 'flag',
				});
			}
		);

		it('recognises the P-256 names only', () => {
			expect(isP256KeyType('Secp256r1')).toBe(true);
			expect(isP256KeyType('Secp256k1')).toBe(false);
			expect(isP256KeyType(undefined)).toBe(false);
			expect(isP256KeyType(256)).toBe(false);
		});
	});

	describe('encrypted status-list creation is Gone on every engine', () => {
		it.each<[string, unknown, unknown]>([
			['flag veramo', null, 'veramo'],
			['flag credo', null, 'credo'],
			['no flag', null, null],
			['recorded credo', 'credo', 'credo'],
		])('%s', async (_name, recorded, flagged) => {
			const { subject } = router(recorded, flagged);
			const error = await subject
				.decide({ route: 'status-list', customerId: 'c1', encryptedStatusList: true })
				.catch((e) => e);
			expect(error).toBeInstanceOf(EngineGoneError);
			expect(error.status).toBe(410);
			expect(error.code).toBe('Gone');
		});

		it('does not stop an unencrypted list, or the flag on other routes', async () => {
			const { subject } = router(null, 'credo');
			expect(
				await subject.decide({ route: 'status-list', customerId: 'c1', encryptedStatusList: false })
			).toEqual({
				engine: 'credo',
				reason: 'flag',
			});
			expect((await subject.decide({ route: 'did', customerId: 'c1', encryptedStatusList: true })).engine).toBe(
				'credo'
			);
		});

		it('engineFor throws Gone before any engine is built', async () => {
			const factory = jest.fn();
			const subject = new EngineRouter(
				{ recordedEngine: async () => null },
				{ flaggedEngine: async () => null },
				{ veramo: factory as never, credo: factory as never }
			);
			await expect(
				subject.engineFor({ route: 'status-list', encryptedStatusList: true }, {} as IIdentityService)
			).rejects.toBeInstanceOf(EngineGoneError);
			expect(factory).not.toHaveBeenCalled();
		});
	});

	it('precedence: Gone, then agent, then P-256, then artifact, then flag, then default', async () => {
		const { subject } = router('veramo', 'veramo');
		await expect(
			subject.decide({ route: 'status-list', encryptedStatusList: true, keyType: 'Secp256r1', artifact: did })
		).rejects.toBeInstanceOf(EngineGoneError);
		expect((await subject.decide({ route: 'agent', keyType: 'Ed25519', artifact: did })).rule).toBe('agent-route');
		expect((await subject.decide({ route: 'key', keyType: 'Secp256r1', artifact: did })).rule).toBe('p256-key');
		expect((await subject.decide({ route: 'did', artifact: did })).reason).toBe('artifact');
		expect((await subject.decide({ route: 'did' })).reason).toBe('flag');
		expect((await router(null, null).subject.decide({ route: 'did' })).reason).toBe('default');
	});
});

describe('Credo engine stub', () => {
	it('is named credo and rejects every call with a clear error', async () => {
		const stub = createCredoEngineStub();
		expect(stub.name).toBe('credo');
		await expect(stub.createDid('testnet', { id: '' }, {} as never)).rejects.toBeInstanceOf(
			EngineNotImplementedError
		);
		await expect(stub.verifyCredential('x', {}, {} as never)).rejects.toThrow(
			/not implemented: verifyCredential\(\)/
		);
	});
});

describe('VeramoEngine', () => {
	it('delegates unchanged to the wrapped service', async () => {
		const createDid = jest.fn(async () => ({ did: 'did:cheqd:testnet:x' }));
		const engine = new VeramoEngine({ createDid } as unknown as IIdentityService);
		const customer = { customerId: 'c1' } as never;
		const doc = { id: 'did:cheqd:testnet:x' };
		expect(await engine.createDid('testnet', doc, customer)).toEqual({ did: 'did:cheqd:testnet:x' });
		expect(createDid).toHaveBeenCalledWith('testnet', doc, customer);
	});
});
