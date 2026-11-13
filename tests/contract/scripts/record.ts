/**
 * RECORDER. Replays the scripted scenario against a running Studio and writes golden fixtures.
 *
 *   CONTRACT_BASE_URL=https://staging.example CONTRACT_API_KEY=... \
 *     npx tsx tests/contract/scripts/record.ts [--dry-run]
 *
 * Read-only steps always run. Steps that change state run only with the matching flag:
 *   CONTRACT_ALLOW_MUTATIONS=true      Studio database writes (keys, issued credentials)
 *   CONTRACT_ALLOW_LEDGER_WRITES=true  ledger writes that cost testnet fees
 *   CONTRACT_ALLOW_FAUCET=true         faucet requests (spend the monthly quota)
 * See tests/contract/README.md for the full list of variables.
 */
import { execSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { assertSafeTarget, readEnv } from '../lib/config.js';
import { runScenario, toFixture, writeFixture, type Step } from '../lib/engine.js';
import { buildScenario } from '../lib/scenario.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const cfg = readEnv(process.env, join(repoRoot, 'tests/contract/fixtures'));
const dryRun = process.argv.includes('--dry-run');

const stepFilter = (s: Step) =>
	(!cfg.tierFilter || s.tier === cfg.tierFilter) && (!cfg.stepIds || cfg.stepIds.includes(s.id));

async function main() {
	assertSafeTarget(cfg);
	if (!cfg.apiKey) console.warn('CONTRACT_API_KEY is not set: authenticated steps will be skipped.');
	let gitRef = 'unknown';
	try {
		gitRef = execSync('git rev-parse --short HEAD', { cwd: repoRoot }).toString().trim();
	} catch {
		/* ignore */
	}

	console.log(`Target ${cfg.baseUrl}, engine label '${cfg.engine}', allowed effects: ${[...cfg.allow].join(', ')}`);
	const results = await runScenario(buildScenario(), {
		baseUrl: cfg.baseUrl as string,
		apiKey: cfg.apiKey,
		vars: cfg.vars,
		pin: cfg.pin,
		allow: cfg.allow,
		features: cfg.features,
		stepFilter,
		engineHeader: cfg.engineHeader,
		engine: cfg.engine,
	});

	let written = 0;
	for (const r of results) {
		if (r.status === 'skipped' || !r.exchange) {
			console.log(`skip   ${r.step.id}: ${r.reason}`);
			continue;
		}
		const status = r.exchange.response.status;
		if (status >= 500) {
			console.warn(
				`REFUSE ${r.step.id}: HTTP ${status}. A server error is not a golden response; fix the cause and re-run.`
			);
			continue;
		}
		const fixture = toFixture(r, { engine: cfg.engine, gitRef });
		if (cfg.apiKey && JSON.stringify(fixture).includes(cfg.apiKey)) {
			throw new Error(`Fixture for ${r.step.id} contains the API key. Aborting; nothing further written.`);
		}
		console.log(`${dryRun ? 'dry   ' : 'record'} ${r.step.id}: HTTP ${status}`);
		if (!dryRun) {
			writeFixture(cfg.fixturesDir, fixture);
			written++;
		}
	}
	console.log(`${written} fixture(s) written to ${cfg.fixturesDir}. Review them with git diff before committing.`);
}

main().catch((e) => {
	console.error(e instanceof Error ? e.message : e);
	process.exit(1);
});
