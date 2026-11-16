/* Regenerates tests/contract/inventory/routes.json from src/app.ts, the auth rules and the OpenAPI specs. */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { buildInventory, serialiseInventory } from '../lib/inventory.js';

const repoRoot = resolve(import.meta.dirname, '../../..');
let ref = 'unknown';
try {
	ref = execSync('git rev-parse --short HEAD', { cwd: repoRoot }).toString().trim();
} catch {
	/* not a git checkout */
}
const routes = buildInventory(repoRoot);
writeFileSync(join(repoRoot, 'tests/contract/inventory/routes.json'), serialiseInventory(routes, ref));
console.log(`Wrote ${routes.length} routes (tier 1: ${routes.filter((r) => r.tier === 1).length}).`);
