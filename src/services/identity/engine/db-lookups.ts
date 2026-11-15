import { Connection } from '../../../database/connection/connection.js';
import { FeatureFlagService, pickEngine } from '../../api/feature-flag.js';
import { EngineRouter } from './engine-router.js';
import { isMissingSchemaError } from './errors.js';
import type { ArtifactEngineLookup, EngineFlagLookup } from './engine-router.js';
import type { ArtifactKind, ArtifactRef, EngineRoute } from './types.js';

const ARTIFACT_TABLES: Record<ArtifactKind, { table: string; idColumn: string }> = {
	did: { table: 'identifier', idColumn: 'did' },
	'status-list': { table: 'statusRegistry', idColumn: 'registryId' },
	credential: { table: 'issuedCredential', idColumn: 'issuedCredentialId' },
};

const usesPostgres = () => process.env.ENABLE_EXTERNAL_DB === 'true';

/**
 * Reads `<table>.engine` for one artifact. The column is added by a separate migration, so it is read with raw
 * SQL: if it does not exist yet (Postgres "undefined column") nothing is recorded and the answer is null. Any
 * other failure is thrown, and the router refuses the request rather than guess an engine.
 */
export class DbArtifactEngineLookup implements ArtifactEngineLookup {
	async recordedEngine(artifact: ArtifactRef): Promise<unknown> {
		if (!usesPostgres()) return null;
		const { table, idColumn } = ARTIFACT_TABLES[artifact.kind];
		try {
			const rows = await Connection.instance.dbConnection.query(
				`SELECT "engine" FROM "${table}" WHERE "${idColumn}" = $1 LIMIT 1`,
				[artifact.id]
			);
			return rows[0]?.engine ?? null;
		} catch (error) {
			if (isMissingSchemaError(error)) return null;
			throw error;
		}
	}
}

/**
 * Reads the `engine` flag from the `featureFlag` table; an absent table or row means no flag applies. A failed read
 * with no last-known value is thrown (the strict cache read), not read as "no flag".
 */
export class DbEngineFlagLookup implements EngineFlagLookup {
	async flaggedEngine(customerId: string | undefined, route: EngineRoute): Promise<unknown> {
		if (!usesPostgres()) return null;
		try {
			return pickEngine(await FeatureFlagService.instance.rowsForRouting(customerId), customerId, route);
		} catch (error) {
			if (isMissingSchemaError(error)) return null;
			throw error;
		}
	}
}

export const engineRouter = new EngineRouter(new DbArtifactEngineLookup(), new DbEngineFlagLookup());
