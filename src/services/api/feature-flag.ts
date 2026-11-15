import validator from 'validator';
import { Connection } from '../../database/connection/connection.js';
import { FeatureFlagEntity } from '../../database/entities/feature-flag.entity.js';
import { AdminAuditLogEntity } from '../../database/entities/admin-audit-log.entity.js';
import { ENGINE_NAMES, ENGINE_ROUTES, isEngineName } from '../identity/engine/types.js';
import type { EngineName, EngineRoute } from '../identity/engine/types.js';
import { engineForNewArtefact } from '../identity/engine/new-artefact-policy.js';
import { FlagCache } from './flag-cache.js';

export const FLAG_KEYS = ['engine', 'ui'] as const;
export type FlagKey = (typeof FLAG_KEYS)[number];

export const UI_VARIANTS = ['classic', 'new'] as const;
export type UiVariant = (typeof UI_VARIANTS)[number];
export const DEFAULT_UI: UiVariant = 'classic';

/** The part of a `featureFlag` row the resolvers need. */
export interface FlagRow {
	flagKey: string;
	customerId: string | null;
	route: string | null;
	value: Record<string, unknown>;
	updatedAt?: Date | string;
}

/**
 * Most specific row wins: a customer's route override, then the customer's override for all routes, then the
 * global setting for the route, then the global setting for all routes. Rows for other customers are ignored.
 */
export function pickFlagRow(
	rows: readonly FlagRow[],
	flagKey: FlagKey,
	customerId: string | undefined,
	route: string | null
): FlagRow | undefined {
	const rank = (row: FlagRow): number => {
		const customerMatch = row.customerId !== null && row.customerId === customerId;
		const global = row.customerId === null;
		if (!customerMatch && !global) return -1;
		if (row.route !== null && row.route !== route) return -1;
		return (customerMatch ? 2 : 0) + (row.route === null ? 0 : 1);
	};
	return rows
		.filter((row) => row.flagKey === flagKey)
		.map((row) => ({ row, score: rank(row) }))
		.filter(({ score }) => score >= 0)
		.sort((a, b) => b.score - a.score)[0]?.row;
}

export function pickEngine(rows: readonly FlagRow[], customerId: string | undefined, route: string | null) {
	const value = pickFlagRow(rows, 'engine', customerId, route)?.value?.engine;
	return isEngineName(value) ? value : undefined;
}

export interface ResolvedFlags {
	ui: UiVariant;
	engine: { default: EngineName; routes: Record<EngineRoute, EngineName> };
}

/**
 * The flags that apply to one caller: global defaults with that caller's overrides on top. The engine values are the
 * ones a NEW artefact gets: Credo, unless the temporary Veramo override is on and a row says `veramo`. Existing
 * artefacts ignore all of this and use the engine recorded on them.
 */
export function resolveFlags(rows: readonly FlagRow[], customerId: string | undefined): ResolvedFlags {
	const ui = pickFlagRow(rows, 'ui', customerId, null)?.value?.ui;
	const routes = {} as Record<EngineRoute, EngineName>;
	for (const route of ENGINE_ROUTES) {
		routes[route] = engineForNewArtefact(pickEngine(rows, customerId, route));
	}
	return {
		ui: UI_VARIANTS.includes(ui as UiVariant) ? (ui as UiVariant) : DEFAULT_UI,
		engine: { default: engineForNewArtefact(pickEngine(rows, customerId, null)), routes },
	};
}

export interface FlagWrite {
	flagKey: FlagKey;
	customerId: string | null;
	route: EngineRoute | null;
	value: Record<string, unknown>;
	reason: string;
}

export type FlagWriteValidation = { ok: true; write: FlagWrite } | { ok: false; error: string };

export function validateFlagWrite(body: unknown): FlagWriteValidation {
	if (typeof body !== 'object' || body === null || Array.isArray(body)) {
		return { ok: false, error: 'Request body must be a JSON object' };
	}
	const { flagKey, customerId, route, value, reason } = body as Record<string, unknown>;
	if (!FLAG_KEYS.includes(flagKey as FlagKey)) {
		return { ok: false, error: `flagKey must be one of: ${FLAG_KEYS.join(', ')}` };
	}
	if (
		customerId !== undefined &&
		customerId !== null &&
		(typeof customerId !== 'string' || !validator.isUUID(customerId))
	) {
		return { ok: false, error: 'customerId must be a UUID, or omitted for a global flag' };
	}
	if (route !== undefined && route !== null && !ENGINE_ROUTES.includes(route as EngineRoute)) {
		return { ok: false, error: `route must be one of: ${ENGINE_ROUTES.join(', ')}, or omitted for all routes` };
	}
	if (typeof reason !== 'string' || reason.trim().length === 0 || reason.length > 500) {
		return { ok: false, error: 'reason is required (1 to 500 characters) and is written to the audit record' };
	}
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		return { ok: false, error: 'value must be a JSON object' };
	}
	const keys = Object.keys(value);
	if (flagKey === 'engine') {
		if (keys.length !== 1 || !isEngineName((value as Record<string, unknown>).engine)) {
			return {
				ok: false,
				error: `value for engine must be {"engine": ${ENGINE_NAMES.map((n) => `"${n}"`).join(' | ')}}`,
			};
		}
	} else {
		if (route !== undefined && route !== null) {
			return { ok: false, error: 'route must be omitted for the ui flag' };
		}
		if (keys.length !== 1 || !UI_VARIANTS.includes((value as Record<string, unknown>).ui as UiVariant)) {
			return { ok: false, error: `value for ui must be {"ui": ${UI_VARIANTS.map((n) => `"${n}"`).join(' | ')}}` };
		}
	}
	return {
		ok: true,
		write: {
			flagKey: flagKey as FlagKey,
			customerId: (customerId as string | null | undefined) ?? null,
			route: (route as EngineRoute | null | undefined) ?? null,
			value: value as Record<string, unknown>,
			reason: reason.trim(),
		},
	};
}

export class FeatureFlagService {
	static instance = new FeatureFlagService();

	/** Cached reads (engine spec 4.2): 5 second TTL, last-known value on a failed read, never throws. */
	readonly cache = new FlagCache<FeatureFlagEntity[]>({
		onFailure: (key, error, usedLastKnown) =>
			console.warn(
				JSON.stringify({
					event: 'flag-read-failed',
					customerScoped: key !== '',
					usedLastKnown,
					error: error instanceof Error ? error.message : String(error),
				})
			),
	});

	/**
	 * Global rows plus the caller's own, from the cache. A failed read returns the last known rows, or no rows
	 * (the compiled defaults) when there is none: it never throws, so flags can never fail a request.
	 */
	async rowsFor(customerId: string | undefined): Promise<FeatureFlagEntity[]> {
		return this.cache.get(customerId ?? '', () => this.readRows(customerId), []);
	}

	/**
	 * Like `rowsFor`, for routing decisions: a failed read with no last-known value throws instead of returning no
	 * rows, so a database fault is never read as "no flag, use the default engine".
	 */
	async rowsForRouting(customerId: string | undefined): Promise<FeatureFlagEntity[]> {
		return this.cache.get(customerId ?? '', () => this.readRows(customerId), [], { failClosed: true });
	}

	/** One database read of the rows that apply to a caller. Throws if the table is unavailable. */
	async readRows(customerId: string | undefined): Promise<FeatureFlagEntity[]> {
		const query = Connection.instance.dbConnection
			.getRepository(FeatureFlagEntity)
			.createQueryBuilder('flag')
			.where('flag.customerId IS NULL');
		if (customerId) query.orWhere('flag.customerId = :customerId', { customerId });
		return query.getMany();
	}

	async flagsFor(customerId: string | undefined): Promise<ResolvedFlags> {
		return resolveFlags(await this.rowsFor(customerId), customerId);
	}

	/**
	 * Changes a flag and writes the audit record in ONE transaction: either both are stored or neither. The
	 * audit row holds actor, action, the old and the new value and the reason. The cache is invalidated after the
	 * commit, so this instance serves the new value at once and the others within the TTL.
	 */
	async setFlag(write: FlagWrite, actorUserId: string): Promise<{ flag: FeatureFlagEntity; previous: unknown }> {
		const result = await Connection.instance.dbConnection.transaction(async (manager) => {
			const existing: { value: unknown }[] = await manager.query(
				`SELECT "value" FROM "featureFlag"
				 WHERE "flagKey" = $1 AND COALESCE("customerId"::text, '') = $2 AND COALESCE("route", '') = $3
				 FOR UPDATE`,
				[write.flagKey, write.customerId ?? '', write.route ?? '']
			);
			const previous = existing[0]?.value ?? null;
			const flag = await this.upsert(write, actorUserId, manager);
			await manager.getRepository(AdminAuditLogEntity).insert({
				actorUserId,
				action: 'flag.set',
				targetCustomerId: write.customerId ?? undefined,
				reason: write.reason,
				metadata: {
					flagKey: write.flagKey,
					route: write.route,
					oldValue: previous,
					newValue: write.value,
				} as never,
			});
			return { flag, previous };
		});
		this.cache.invalidate();
		// Visible in the logs with the old and new value (engine spec 4.2). No request body beyond the flag itself.
		console.info(
			JSON.stringify({
				event: 'flag-changed',
				actorUserId,
				flagKey: write.flagKey,
				route: write.route,
				customerId: write.customerId,
				oldValue: result.previous,
				newValue: write.value,
			})
		);
		return result;
	}

	/**
	 * Insert or update on (flagKey, customerId, route), counting NULLs as equal. Returns the stored row. Does not
	 * audit or invalidate the cache: callers go through `setFlag`.
	 */
	async upsert(
		write: FlagWrite,
		updatedBy: string,
		manager: { query(sql: string, parameters?: unknown[]): Promise<unknown> } = Connection.instance.dbConnection
	): Promise<FeatureFlagEntity> {
		const rows = (await manager.query(
			`INSERT INTO "featureFlag" ("flagKey", "customerId", "route", "value", "updatedBy", "updatedAt")
			 VALUES ($1, $2, $3, $4::jsonb, $5, now())
			 ON CONFLICT ("flagKey", COALESCE("customerId"::text, ''), COALESCE("route", ''))
			 DO UPDATE SET "value" = EXCLUDED."value", "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = now()
			 RETURNING *`,
			[write.flagKey, write.customerId, write.route, JSON.stringify(write.value), updatedBy]
		)) as FeatureFlagEntity[];
		return rows[0];
	}
}
