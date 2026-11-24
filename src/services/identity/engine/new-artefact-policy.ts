import type { EngineName } from './types.js';

/**
 * Veramo is being retired (decision of 15 November 2026): existing artefacts stay on Veramo and keep working, but
 * no NEW artefact is created on it. New artefacts go to Credo for every route family.
 *
 * The one way back is a TEMPORARY ESCAPE HATCH, off by default and for one release only. It needs BOTH:
 *   1. the environment variable `VERAMO_NEW_ARTEFACT_OVERRIDE=true` on the instance, and
 *   2. a `featureFlag` engine row of `veramo` for that customer and route (or a global one).
 * Without the variable a `veramo` flag row is ignored for new artefacts, so a stale row cannot put new work on
 * Veramo by accident. Every new artefact that the override sends to Veramo writes a `veramo-new-artefact-override`
 * warning to the log. Remove the variable and this file once no customer needs it.
 */
export const VERAMO_OVERRIDE_ENV = 'VERAMO_NEW_ARTEFACT_OVERRIDE';

export function veramoOverrideEnabled(): boolean {
	return process.env[VERAMO_OVERRIDE_ENV] === 'true';
}

/**
 * The engine that a flag value selects for a NEW artefact. `veramo` is honoured only while the override is on;
 * anything else (no flag, `credo`, an unreadable value) is Credo.
 */
export function engineForNewArtefact(flagged: unknown): EngineName {
	return flagged === 'veramo' && veramoOverrideEnabled() ? 'veramo' : 'credo';
}
