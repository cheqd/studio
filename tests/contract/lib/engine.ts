import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { diffJson, type Difference, type DiffMode } from './diff.js';
import { Normaliser, type Json, type NormaliserOptions } from './normaliser.js';
import type { SideEffect, Tier } from './route-metadata.js';

export interface Step {
	id: string;
	description: string;
	/** Inventory route id, `METHOD /express/path/:param`. */
	routeId: string;
	method: 'GET' | 'POST' | 'PUT' | 'DELETE';
	/** Path with `{variable}` placeholders. */
	path: string;
	query?: Record<string, string>;
	body?: unknown;
	/** Sent as given, after variable substitution. Auth headers are added by the runner. */
	headers?: Record<string, string>;
	/** `api-key` sends `x-api-key`; `none` sends no credential. */
	auth: 'api-key' | 'none';
	tier: Tier;
	effect: SideEffect;
	/** Variables captured from the JSON response: name to dotted path (e.g. `did: 'did'`). */
	capture?: Record<string, string>;
	/** Variables that must exist (from the environment or an earlier step) or the step is skipped. */
	requires?: string[];
	normalise?: Pick<NormaliserOptions, 'ignorePaths' | 'shapeOnlyPaths'>;
	/** Only run when this optional feature flag is on (e.g. `stripe`). */
	feature?: string;
}

export interface Exchange {
	request: { method: string; path: string; query?: Record<string, string>; body?: Json };
	response: { status: number; contentType: string | null; body: Json };
}

export interface Fixture {
	schema: 1;
	stepId: string;
	routeId: string;
	tier: Tier;
	effect: SideEffect;
	recorded: { at: string; engine: string; gitRef: string };
	exchange: Exchange;
}

export interface RunConfig {
	baseUrl: string;
	apiKey?: string;
	/** Variables available to `{placeholders}`. Also pinned in the normaliser as `<var:NAME>` for those listed in `pin`. */
	vars: Record<string, string>;
	pin?: string[];
	/** Which steps may run, by side effect. Read-only is always allowed. */
	allow: Set<SideEffect>;
	features?: Set<string>;
	stepFilter?: (step: Step) => boolean;
	/** Header name used to ask a target to use a given engine, if the target supports one. */
	engineHeader?: string;
	engine?: string;
	fetchImpl?: typeof fetch;
	timeoutMs?: number;
}

export type StepStatus = 'ran' | 'skipped';

export interface StepResult {
	step: Step;
	status: StepStatus;
	reason?: string;
	exchange?: Exchange;
}

function substitute(template: string, vars: Record<string, string>): string {
	return template.replace(/\{([A-Za-z0-9_]+)\}/g, (_m, name: string) => {
		if (!(name in vars)) throw new Error(`Unresolved variable {${name}}`);
		return vars[name];
	});
}

function substituteDeep(value: unknown, vars: Record<string, string>): unknown {
	if (typeof value === 'string') return substitute(value, vars);
	if (Array.isArray(value)) return value.map((v) => substituteDeep(v, vars));
	if (value && typeof value === 'object') {
		return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substituteDeep(v, vars)]));
	}
	return value;
}

function pick(body: unknown, dotted: string): unknown {
	return dotted.split('.').reduce<unknown>((acc, seg) => (acc as Record<string, unknown> | undefined)?.[seg], body);
}

export function placeholdersIn(step: Step): string[] {
	const text = JSON.stringify([step.path, step.query, step.body, step.headers]);
	return [...new Set([...text.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]))];
}

/** Runs the steps in order, sharing captured variables. Never throws for a failing HTTP status. */
export async function runScenario(steps: Step[], config: RunConfig): Promise<StepResult[]> {
	const doFetch = config.fetchImpl ?? fetch;
	const vars = { ...config.vars };
	const results: StepResult[] = [];
	const pinned = Object.fromEntries((config.pin ?? []).filter((n) => vars[n]).map((n) => [n, vars[n]]));

	for (const step of steps) {
		const skip = (reason: string) => results.push({ step, status: 'skipped', reason });
		if (config.stepFilter && !config.stepFilter(step)) {
			skip('filtered out');
			continue;
		}
		if (step.feature && !config.features?.has(step.feature)) {
			skip(`feature '${step.feature}' not enabled`);
			continue;
		}
		if (step.effect !== 'read-only' && !config.allow.has(step.effect)) {
			skip(`effect '${step.effect}' not allowed for this run`);
			continue;
		}
		if (step.auth === 'api-key' && !config.apiKey) {
			skip('no API key');
			continue;
		}
		const needed = [...new Set([...(step.requires ?? []), ...placeholdersIn(step)])];
		const missing = needed.filter((n) => !vars[n]);
		if (missing.length) {
			skip(`missing variable(s): ${missing.join(', ')}`);
			continue;
		}

		const path = substitute(step.path, vars);
		const query = step.query
			? (Object.fromEntries(Object.entries(step.query).map(([k, v]) => [k, substitute(v, vars)])) as Record<
					string,
					string
				>)
			: undefined;
		const body = step.body === undefined ? undefined : substituteDeep(step.body, vars);
		const url = new URL(path, config.baseUrl.replace(/\/?$/, '/'));
		for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);

		const headers: Record<string, string> = { accept: 'application/json', ...step.headers };
		if (body !== undefined) headers['content-type'] = 'application/json';
		if (step.auth === 'api-key' && config.apiKey) headers['x-api-key'] = config.apiKey;
		if (config.engineHeader && config.engine) headers[config.engineHeader] = config.engine;

		const res = await doFetch(url, {
			method: step.method,
			headers,
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: AbortSignal.timeout(config.timeoutMs ?? 120_000),
		});
		const contentType = res.headers.get('content-type');
		const text = await res.text();
		let parsed: unknown = text.length ? text : null;
		if (text.length && (contentType ?? '').includes('json')) {
			try {
				parsed = JSON.parse(text);
			} catch {
				/* keep raw text */
			}
		}

		for (const [name, dotted] of Object.entries(step.capture ?? {})) {
			const v = pick(parsed, dotted);
			if (typeof v === 'string' || typeof v === 'number') vars[name] = String(v);
		}

		// One normaliser per exchange so ids are numbered consistently across request and response.
		const n = new Normaliser({ knownValues: pinned, ...step.normalise });
		results.push({
			step,
			status: 'ran',
			exchange: {
				request: {
					method: step.method,
					path: n.normalise(path) as string,
					...(query ? { query: n.normalise(query) as Record<string, string> } : {}),
					...(body !== undefined ? { body: n.normalise(body) } : {}),
				},
				response: {
					status: res.status,
					contentType: contentType ? contentType.split(';')[0].trim().toLowerCase() : null,
					body: n.normalise(parsed),
				},
			},
		});
	}
	return results;
}

// Fixture storage ---------------------------------------------------------------------------

export function fixturePath(dir: string, stepId: string): string {
	return join(dir, `${stepId}.json`);
}

export function writeFixture(dir: string, fixture: Fixture): void {
	mkdirSync(dir, { recursive: true });
	writeFileSync(fixturePath(dir, fixture.stepId), JSON.stringify(fixture, null, '\t') + '\n');
}

export function loadFixtures(dir: string): Fixture[] {
	if (!existsSync(dir)) return [];
	return readdirSync(dir)
		.filter((f) => f.endsWith('.json'))
		.sort()
		.map((f) => JSON.parse(readFileSync(join(dir, f), 'utf-8')) as Fixture);
}

export function toFixture(result: StepResult, meta: { engine: string; gitRef: string; now?: Date }): Fixture {
	if (!result.exchange) throw new Error(`Step ${result.step.id} has no exchange`);
	return {
		schema: 1,
		stepId: result.step.id,
		routeId: result.step.routeId,
		tier: result.step.tier,
		effect: result.step.effect,
		recorded: { at: (meta.now ?? new Date()).toISOString(), engine: meta.engine, gitRef: meta.gitRef },
		exchange: result.exchange,
	};
}

// Comparison --------------------------------------------------------------------------------

export interface Comparison {
	stepId: string;
	routeId: string;
	tier: Tier;
	outcome: 'pass' | 'fail' | 'no-fixture' | 'skipped';
	reason?: string;
	differences: Difference[];
}

export function compare(results: StepResult[], fixtures: Fixture[], mode: DiffMode = 'strict'): Comparison[] {
	const byStep = new Map(fixtures.map((f) => [f.stepId, f]));
	return results.map((r) => {
		const base = { stepId: r.step.id, routeId: r.step.routeId, tier: r.step.tier, differences: [] as Difference[] };
		if (r.status === 'skipped' || !r.exchange) return { ...base, outcome: 'skipped' as const, reason: r.reason };
		const fx = byStep.get(r.step.id);
		if (!fx) return { ...base, outcome: 'no-fixture' as const };

		const diffs: Difference[] = [];
		if (fx.exchange.response.status !== r.exchange.response.status) {
			diffs.push({
				path: '$status',
				kind: 'changed',
				expected: fx.exchange.response.status,
				actual: r.exchange.response.status,
			});
		}
		if (fx.exchange.response.contentType !== r.exchange.response.contentType) {
			diffs.push({
				path: '$contentType',
				kind: 'changed',
				expected: fx.exchange.response.contentType,
				actual: r.exchange.response.contentType,
			});
		}
		diffs.push(...diffJson(fx.exchange.response.body, r.exchange.response.body, mode, '$body'));
		// A scenario edited after recording would silently compare the wrong thing: flag it.
		diffs.push(
			...diffJson(
				fx.exchange.request as unknown as Json,
				r.exchange.request as unknown as Json,
				'strict',
				'$request'
			).map((d) => ({ ...d, path: `[scenario-drift] ${d.path}` }))
		);
		return { ...base, outcome: diffs.length ? ('fail' as const) : ('pass' as const), differences: diffs };
	});
}
