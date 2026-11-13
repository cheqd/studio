/**
 * LIVE REPLAYER. Replays the committed fixtures against a running Studio and diffs the normalised
 * responses. Skips cleanly (one visible skipped test) unless CONTRACT_BASE_URL is set and at least
 * one fixture exists. Set ENGINE to label the run (veramo or credo).
 *
 *   CONTRACT_BASE_URL=... CONTRACT_API_KEY=... ENGINE=veramo \
 *     NODE_OPTIONS=--experimental-vm-modules npx jest -c tests/contract/jest.config.cjs replay
 *
 * Only steps allowed by the CONTRACT_ALLOW_* flags run; by default that is the read-only subset.
 */
import { describe, expect, it } from '@jest/globals';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { assertSafeTarget, readEnv } from '../lib/config';
import { formatDifferences } from '../lib/diff';
import { compare, loadFixtures, runScenario, type Step } from '../lib/engine';
import { buildScenario } from '../lib/scenario';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const cfg = readEnv(process.env, join(HERE, '../fixtures'));
const fixtures = loadFixtures(cfg.fixturesDir);
const enabled = Boolean(cfg.baseUrl) && fixtures.length > 0;
const stepFilter = (s: Step) =>
	(!cfg.tierFilter || s.tier === cfg.tierFilter) && (!cfg.stepIds || cfg.stepIds.includes(s.id));

if (!enabled) {
	describe('contract replay', () => {
		it.skip(`skipped: ${cfg.baseUrl ? 'no fixtures recorded yet in ' + cfg.fixturesDir : 'CONTRACT_BASE_URL is not set'}`, () =>
			undefined);
	});
} else {
	describe(`contract replay against ${cfg.baseUrl} (ENGINE=${cfg.engine}, ${cfg.diffMode})`, () => {
		const recorded = new Set(fixtures.map((f) => f.stepId));
		const scenario = buildScenario().filter((s) => recorded.has(s.id));
		let comparisons: ReturnType<typeof compare> = [];

		it('runs the recorded steps', async () => {
			assertSafeTarget(cfg);
			const results = await runScenario(scenario, {
				baseUrl: cfg.baseUrl as string,
				apiKey: cfg.apiKey,
				vars: cfg.vars,
				pin: cfg.pin,
				allow: cfg.allow,
				features: cfg.features,
				stepFilter,
				engine: cfg.engine,
				engineHeader: cfg.engineHeader,
			});
			comparisons = compare(results, fixtures, cfg.diffMode);
			expect(comparisons.length).toBeGreaterThan(0);
		});

		for (const step of scenario) {
			it(`[tier ${step.tier}] ${step.id}: ${step.description}`, () => {
				const c = comparisons.find((x) => x.stepId === step.id);
				if (!c || c.outcome === 'skipped') return; // not allowed or not configured for this run
				expect({ outcome: c.outcome, diff: formatDifferences(c.differences) }).toEqual({
					outcome: 'pass',
					diff: '',
				});
			});
		}
	});
}
