import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn<(sql: string, params?: unknown[]) => Promise<unknown[]>>();
const getMany = jest.fn<() => Promise<unknown[]>>();
const queryBuilder = { where: () => queryBuilder, orWhere: () => queryBuilder, getMany };

jest.unstable_mockModule('../../../../src/database/connection/connection.js', () => ({
	Connection: {
		instance: {
			dbConnection: { query, getRepository: () => ({ createQueryBuilder: () => queryBuilder }) },
		},
	},
}));

const { DbArtifactEngineLookup, DbEngineFlagLookup } =
	await import('../../../../src/services/identity/engine/db-lookups.js');
const { statusListArtifact } = await import('../../../../src/services/identity/engine/artifact-refs.js');
const { FeatureFlagService } = await import('../../../../src/services/api/feature-flag.js');
const { EngineRouter } = await import('../../../../src/services/identity/engine/engine-router.js');
const { EngineRoutingUnavailableError } = await import('../../../../src/services/identity/engine/errors.js');

const did = { kind: 'did', id: 'did:cheqd:testnet:abc' } as const;
const missingColumn = Object.assign(new Error('column "engine" does not exist'), { code: '42703' });
const missingTable = Object.assign(new Error('relation "featureFlag" does not exist'), { code: '42P01' });

let before: string | undefined;
beforeEach(() => {
	before = process.env.ENABLE_EXTERNAL_DB;
	process.env.ENABLE_EXTERNAL_DB = 'true';
	query.mockReset();
	getMany.mockReset();
	FeatureFlagService.instance.cache.invalidate();
	jest.spyOn(console, 'warn').mockImplementation(() => undefined);
	jest.spyOn(console, 'info').mockImplementation(() => undefined);
});
afterEach(() => {
	process.env.ENABLE_EXTERNAL_DB = before ?? 'false';
	jest.restoreAllMocks();
});

describe('artefact engine lookup', () => {
	it('returns the recorded engine', async () => {
		query.mockResolvedValue([{ engine: 'credo' }]);
		expect(await new DbArtifactEngineLookup().recordedEngine(did)).toBe('credo');
	});

	it('returns null for a row with no engine, or no row', async () => {
		query.mockResolvedValueOnce([{ engine: null }]).mockResolvedValueOnce([]);
		expect(await new DbArtifactEngineLookup().recordedEngine(did)).toBeNull();
		expect(await new DbArtifactEngineLookup().recordedEngine(did)).toBeNull();
	});

	it('reads a schema that predates the engine column as no record', async () => {
		query.mockRejectedValue(missingColumn);
		expect(await new DbArtifactEngineLookup().recordedEngine(did)).toBeNull();
	});

	it('throws any other failure, so the router can refuse the request', async () => {
		query.mockRejectedValue(new Error('connection terminated'));
		await expect(new DbArtifactEngineLookup().recordedEngine(did)).rejects.toThrow('connection terminated');
	});
});

describe('status-list artefact lookup', () => {
	it('throws a typed error when the query fails', async () => {
		query.mockRejectedValue(new Error('connection terminated'));
		await expect(statusListArtifact('did:cheqd:testnet:abc', 'list', 'c1')).rejects.toBeInstanceOf(
			EngineRoutingUnavailableError
		);
	});

	it('returns undefined when there is no row, or no table yet', async () => {
		query.mockResolvedValueOnce([]).mockRejectedValueOnce(missingTable);
		expect(await statusListArtifact('did:cheqd:testnet:abc', 'list', 'c1')).toBeUndefined();
		expect(await statusListArtifact('did:cheqd:testnet:abc', 'list', 'c1')).toBeUndefined();
	});
});

describe('flag lookup through the router', () => {
	const router = () => new EngineRouter(new DbArtifactEngineLookup(), new DbEngineFlagLookup());

	it('refuses a new artefact when the flag read fails and nothing is known', async () => {
		getMany.mockRejectedValue(new Error('connection terminated'));
		await expect(router().decide({ route: 'did', customerId: 'c1' })).rejects.toBeInstanceOf(
			EngineRoutingUnavailableError
		);
	});

	it('uses the default when the read works and no flag is set', async () => {
		getMany.mockResolvedValue([]);
		expect(await router().decide({ route: 'did', customerId: 'c1' })).toEqual({
			engine: 'veramo',
			reason: 'default',
		});
	});

	it('uses the default when the featureFlag table does not exist yet', async () => {
		getMany.mockRejectedValue(missingTable);
		expect(await router().decide({ route: 'did', customerId: 'c1' })).toEqual({
			engine: 'veramo',
			reason: 'default',
		});
	});

	it('refuses an existing artefact when its engine lookup fails, whatever the flag says', async () => {
		query.mockRejectedValue(new Error('connection terminated'));
		getMany.mockResolvedValue([]);
		await expect(router().decide({ route: 'did', customerId: 'c1', artifact: did })).rejects.toBeInstanceOf(
			EngineRoutingUnavailableError
		);
	});
});
