/* Regenerates tests/contract/coverage.md from the inventory, the scenario and the fixtures on disk. */
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { computeCoverage, renderCoverage } from '../lib/coverage.js';
import { loadFixtures } from '../lib/engine.js';
import { buildInventory } from '../lib/inventory.js';
import { buildScenario } from '../lib/scenario.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
const contractDir = join(repoRoot, 'tests/contract');
const rows = computeCoverage(buildInventory(repoRoot), buildScenario(), loadFixtures(join(contractDir, 'fixtures')));
writeFileSync(join(contractDir, 'coverage.md'), renderCoverage(rows));
console.log(`coverage.md written (${rows.length} routes).`);
