import type { DiffMode } from './diff.js';
import type { SideEffect } from './route-metadata.js';

/** Defaults are the public testnet fixtures already used by tests/e2e/constants.ts. */
export const DEFAULT_VARS = {
	network: 'testnet',
	knownDid: 'did:cheqd:testnet:5RpEg66jhhbmASWPXJRWrA',
	knownStatusListName: 'testingStatusList',
	resourceDid: 'did:cheqd:testnet:c69d7867-be90-4dea-8bbf-f4419d3599d8',
	resourceId: '3194b5a6-1b73-44a0-8ccf-27dc01509eb2',
	missingDid: 'did:cheqd:testnet:d4a13003-0bc5-4608-b23a-54ea90fe9f91',
	missingStatusListName: 'not-exist-status-list-name',
	subjectDid: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
} as const;

export interface ContractEnv {
	baseUrl?: string;
	apiKey?: string;
	engine: string;
	engineHeader?: string;
	fixturesDir: string;
	diffMode: DiffMode;
	allow: Set<SideEffect>;
	features: Set<string>;
	vars: Record<string, string>;
	/** Variable names pinned in fixtures as `<var:NAME>` so fixtures do not depend on the target's ids. */
	pin: string[];
	productionHosts: string[];
	tierFilter?: 1 | 2;
	stepIds?: string[];
}

const flag = (v: string | undefined) => v === 'true' || v === '1';

export function readEnv(env: Record<string, string | undefined>, defaultFixturesDir: string): ContractEnv {
	const allow = new Set<SideEffect>(['read-only']);
	if (flag(env.CONTRACT_ALLOW_MUTATIONS)) allow.add('state-database');
	if (flag(env.CONTRACT_ALLOW_LEDGER_WRITES)) allow.add('ledger-fee');
	if (flag(env.CONTRACT_ALLOW_FAUCET)) allow.add('faucet');

	const features = new Set<string>();
	if (flag(env.CONTRACT_FEATURE_STRIPE)) features.add('stripe');

	const vars: Record<string, string> = { ...DEFAULT_VARS };
	const overrides: Record<string, string | undefined> = {
		network: env.CONTRACT_NETWORK,
		knownDid: env.CONTRACT_KNOWN_DID,
		knownStatusListName: env.CONTRACT_KNOWN_STATUS_LIST_NAME,
		subjectDid: env.CONTRACT_SUBJECT_DID,
		faucetAddress: env.CONTRACT_FAUCET_ADDRESS,
		paymentAddress: env.CONTRACT_PAYMENT_ADDRESS,
	};
	for (const [k, v] of Object.entries(overrides)) if (v) vars[k] = v;
	vars.run = (env.CONTRACT_RUN_ID || Math.random().toString(16).slice(2, 10)).slice(0, 12);

	const tier = env.CONTRACT_TIER === '1' ? 1 : env.CONTRACT_TIER === '2' ? 2 : undefined;
	return {
		baseUrl: env.CONTRACT_BASE_URL,
		apiKey: env.CONTRACT_API_KEY,
		engine: env.ENGINE || 'veramo',
		engineHeader: env.CONTRACT_ENGINE_HEADER,
		fixturesDir: env.CONTRACT_FIXTURES_DIR || defaultFixturesDir,
		diffMode: env.CONTRACT_DIFF_MODE === 'additive' ? 'additive' : 'strict',
		allow,
		features,
		vars,
		pin: ['knownDid', 'resourceDid', 'missingDid', 'subjectDid', 'faucetAddress', 'paymentAddress', 'run'],
		productionHosts: (env.CONTRACT_PRODUCTION_HOSTS || 'studio-api.cheqd.net').split(',').map((h) => h.trim()),
		tierFilter: tier,
		stepIds: env.CONTRACT_STEPS ? env.CONTRACT_STEPS.split(',').map((s) => s.trim()) : undefined,
	};
}

/** Throws if the target looks like production or the network is not testnet. */
export function assertSafeTarget(cfg: ContractEnv): void {
	if (!cfg.baseUrl) throw new Error('CONTRACT_BASE_URL is not set');
	const host = new URL(cfg.baseUrl).hostname;
	if (cfg.productionHosts.includes(host)) {
		throw new Error(
			`Refusing to run against ${host}: it is listed in CONTRACT_PRODUCTION_HOSTS. Use staging or a local Studio.`
		);
	}
	if (cfg.vars.network !== 'testnet') throw new Error('CONTRACT_NETWORK must be testnet. Mainnet is never recorded.');
}
