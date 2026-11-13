export type RuleInfo = { route: string; method: string; scope: string; allowUnauthorized: boolean };

/** Every auth rule, read from the real rule providers so tests and stubs never drift from them. */
let cached: Promise<RuleInfo[]> | undefined;
export function allAuthRules(): Promise<RuleInfo[]> {
	cached ??= loadAuthRules();
	return cached;
}

async function loadAuthRules(): Promise<RuleInfo[]> {
	const base = '../../../src/middleware/auth/routes';
	// Sequential on purpose: jest's ESM linker can trip over parallel dynamic imports that share dependencies.
	const files = [
		'api/did-auth.js',
		'api/key-auth.js',
		'api/account-auth.js',
		'api/resource-auth.js',
		'api/credential-auth.js',
		'api/credential-status-auth.js',
		'api/presentation-auth.js',
		'api/accreditation-auth.js',
		'api/event-auth.js',
		'api/provider-auth.js',
		'admin/admin-auth.js',
	];
	const modules = [];
	for (const file of files) modules.push(await import(`${base}/${file}`));
	const rules: RuleInfo[] = [];
	for (const mod of modules) {
		for (const Provider of Object.values(mod) as Array<new () => any>) {
			const provider = new Provider();
			for (const rule of provider.rules ?? []) {
				rules.push({
					route: rule.route,
					method: rule.method,
					scope: rule.scope,
					allowUnauthorized: rule.isAllowedUnauthorized(),
				});
			}
		}
	}
	return rules;
}

/** Every scope any auth rule asks for. */
export async function allRuleScopes(): Promise<string[]> {
	return [...new Set((await allAuthRules()).map((r) => r.scope).filter(Boolean))];
}
