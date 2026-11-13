import validator from 'validator';
import { Connection } from '../../database/connection/connection.js';
import { FeatureFlagEntity } from '../../database/entities/feature-flag.entity.js';
import { DEFAULT_ENGINE, ENGINE_NAMES, ENGINE_ROUTES, isEngineName } from '../identity/engine/types.js';
import type { EngineName, EngineRoute } from '../identity/engine/types.js';

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

/** The flags that apply to one caller: global defaults with that caller's overrides on top. */
export function resolveFlags(rows: readonly FlagRow[], customerId: string | undefined): ResolvedFlags {
	const ui = pickFlagRow(rows, 'ui', customerId, null)?.value?.ui;
	const routes = {} as Record<EngineRoute, EngineName>;
	for (const route of ENGINE_ROUTES) {
		routes[route] = pickEngine(rows, customerId, route) ?? DEFAULT_ENGINE;
	}
	return {
		ui: UI_VARIANTS.includes(ui as UiVariant) ? (ui as UiVariant) : DEFAULT_UI,
		engine: { default: pickEngine(rows, customerId, null) ?? DEFAULT_ENGINE, routes },
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

	/** Global rows plus the caller's own. Throws if the table is unavailable; callers that must not fail catch it. */
	async rowsFor(customerId: string | undefined): Promise<FeatureFlagEntity[]> {
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

	/** Insert or update on (flagKey, customerId, route), counting NULLs as equal. Returns the stored row. */
	async upsert(write: FlagWrite, updatedBy: string): Promise<FeatureFlagEntity> {
		const repository = Connection.instance.dbConnection.getRepository(FeatureFlagEntity);
		const rows = await repository.query(
			`INSERT INTO "featureFlag" ("flagKey", "customerId", "route", "value", "updatedBy", "updatedAt")
			 VALUES ($1, $2, $3, $4::jsonb, $5, now())
			 ON CONFLICT ("flagKey", COALESCE("customerId"::text, ''), COALESCE("route", ''))
			 DO UPDATE SET "value" = EXCLUDED."value", "updatedBy" = EXCLUDED."updatedBy", "updatedAt" = now()
			 RETURNING *`,
			[write.flagKey, write.customerId, write.route, JSON.stringify(write.value), updatedBy]
		);
		return rows[0] as FeatureFlagEntity;
	}
}
