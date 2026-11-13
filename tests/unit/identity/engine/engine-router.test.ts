import { describe, expect, it, jest } from '@jest/globals';
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
import { VeramoEngine } from '../../../../src/services/identity/engine/veramo-engine.js';
import type { IIdentityService } from '../../../../src/services/identity/index.js';
import type { EngineName } from '../../../../src/services/identity/engine/types.js';

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
