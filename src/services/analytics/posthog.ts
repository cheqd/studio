import { PostHog } from 'posthog-node';

/**
 * Optional server-side PostHog capture of the activation milestones (EU cloud, free plan, no session replay).
 *
 * It does nothing unless `POSTHOG_API_KEY` is set. When it is set:
 * - the distinct id is the customer id (a UUID), never an email or a name;
 * - only event names in `ALLOWED_EVENTS` are sent, and only properties in `ALLOWED_PROPERTIES`, so no email, DID,
 *   key or claim can leave through it, whatever a caller passes;
 * - it is fire-and-forget: `captureActivationEvent` returns at once, has a short network timeout, and never throws.
 */
export const ALLOWED_EVENTS = [
	'first_did_created',
	'first_credential_issued',
	'first_agent_registered',
	'first_status_list_created',
] as const;
export type ActivationEventName = (typeof ALLOWED_EVENTS)[number];

export const ALLOWED_PROPERTIES = ['source'] as const;

const DEFAULT_HOST = 'https://eu.i.posthog.com';
const REQUEST_TIMEOUT_MS = 3000;

let client: PostHog | null | undefined;

function getClient(): PostHog | null {
	if (client !== undefined) return client;
	const apiKey = process.env.POSTHOG_API_KEY;
	if (!apiKey) {
		client = null;
		return client;
	}
	try {
		client = new PostHog(apiKey, {
			host: process.env.POSTHOG_HOST || DEFAULT_HOST,
			flushAt: 1,
			flushInterval: 0,
			requestTimeout: REQUEST_TIMEOUT_MS,
			fetchRetryCount: 0,
			disableGeoip: true,
		});
		// A failed delivery must not surface anywhere but the log
		client.on('error', () => undefined);
	} catch {
		client = null;
	}
	return client;
}

/** Keeps only allow-listed properties with short string values. */
export function pickAllowedProperties(properties: Record<string, unknown> | undefined): Record<string, string> {
	const picked: Record<string, string> = {};
	for (const key of ALLOWED_PROPERTIES) {
		const value = properties?.[key];
		if (typeof value === 'string' && value.length > 0 && value.length <= 32) picked[key] = value;
	}
	return picked;
}

export function captureActivationEvent(customerId: string, event: string, properties?: Record<string, unknown>): void {
	try {
		if (!(ALLOWED_EVENTS as readonly string[]).includes(event)) return;
		const posthog = getClient();
		if (!posthog) return;
		posthog.capture({ distinctId: customerId, event, properties: pickAllowedProperties(properties) });
	} catch {
		// Analytics never fails a request
	}
}

/** For tests: forget the cached client so the environment is read again. */
export function resetPostHogForTests(): void {
	client = undefined;
}
