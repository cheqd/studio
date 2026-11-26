/**
 * Which hosts a customer may point a credential provider's API endpoint at. Studio sends the customer's decrypted
 * provider key to that endpoint (activation and "test connection"), so it must be one of the providers' own hosts.
 */

/** The providers' public API hosts. */
export const DEFAULT_PROVIDER_HOSTS = [
	'api.creds.xyz',
	'api-testnet.truvera.io',
	'api.truvera.io',
	'api.hovi.id',
	'api.paradym.id',
] as const;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

type Env = Record<string, string | undefined>;

/** Loopback endpoints over plain HTTP are allowed only when NODE_ENV says this is a development or test run. */
function isDevelopmentOrTest(env: Env): boolean {
	return env.NODE_ENV === 'development' || env.NODE_ENV === 'test';
}

function hostOf(url: string | undefined): string | undefined {
	if (!url) return undefined;
	try {
		return new URL(url).hostname.toLowerCase();
	} catch {
		return undefined;
	}
}

/**
 * The allowed hosts: the providers' own, this Studio's own (the studio provider calls back into this deployment),
 * and any extra hosts listed in PROVIDER_ENDPOINT_ALLOWED_HOSTS (comma-separated host names).
 */
export function allowedProviderHosts(env: Env = process.env): Set<string> {
	const hosts = new Set<string>(DEFAULT_PROVIDER_HOSTS);
	const own = hostOf(env.APPLICATION_BASE_URL);
	if (own && !LOOPBACK_HOSTS.has(own)) hosts.add(own);
	for (const extra of (env.PROVIDER_ENDPOINT_ALLOWED_HOSTS ?? '').split(',')) {
		const host = extra.trim().toLowerCase();
		if (host) hosts.add(host);
	}
	return hosts;
}

export type EndpointCheck = { ok: true } | { ok: false; error: string };

/** Checks a provider API endpoint: an https URL on an allowed host, with no credentials in it. */
export function checkProviderEndpoint(endpoint: string, env: Env = process.env): EndpointCheck {
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		return { ok: false, error: 'API endpoint must be a valid HTTPS URL' };
	}
	if (url.username || url.password) {
		return { ok: false, error: 'API endpoint must not contain credentials' };
	}
	const host = url.hostname.toLowerCase();
	const loopbackInDevelopment = isDevelopmentOrTest(env) && LOOPBACK_HOSTS.has(host);
	if (url.protocol !== 'https:' && !(loopbackInDevelopment && url.protocol === 'http:')) {
		return { ok: false, error: 'API endpoint must be a valid HTTPS URL' };
	}
	if (!loopbackInDevelopment && !allowedProviderHosts(env).has(host)) {
		return { ok: false, error: 'API endpoint host is not an allowed provider host' };
	}
	return { ok: true };
}

/** Checks a webhook URL a customer gives for a provider: https, or loopback in development and test runs. */
export function checkProviderWebhookUrl(webhookUrl: string, env: Env = process.env): EndpointCheck {
	let url: URL;
	try {
		url = new URL(webhookUrl);
	} catch {
		return { ok: false, error: 'Webhook URL must be a valid HTTPS URL' };
	}
	const loopbackInDevelopment = isDevelopmentOrTest(env) && LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
	if (url.protocol !== 'https:' && !(loopbackInDevelopment && url.protocol === 'http:')) {
		return { ok: false, error: 'Webhook URL must be a valid HTTPS URL' };
	}
	return { ok: true };
}

/** Throws when a stored endpoint is no longer allowed, so no provider key is sent to it. */
export function assertProviderEndpoint(endpoint: string, env: Env = process.env): void {
	const check = checkProviderEndpoint(endpoint, env);
	if (!check.ok) throw new Error(check.error);
}
