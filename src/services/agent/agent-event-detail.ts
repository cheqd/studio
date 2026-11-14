import type { AgentEventType } from '../../types/agent.js';

/**
 * What an activity event's `detail` may carry. The activity feed is shown to customers, so `detail` is an
 * allowlist per event type, applied when an event is written and again when it is read (so a row written by an
 * older build, a backfill or a hand edit cannot leak anything). Only short scalars survive: no nested values, no
 * email addresses, and nothing that looks like a token or key.
 */
const ALLOWED: Record<AgentEventType, readonly string[]> = {
	registered: [],
	'authority-granted': ['grantId', 'grantType'],
	'authority-revoked': ['grantId', 'grantType'],
	'authority-expiry-changed': ['grantId', 'grantType', 'from', 'to'],
	'key-added': ['keyId', 'keyType'],
	'key-rotated': ['oldKeyId', 'newKeyId', 'keyType'],
	'card-published': ['version', 'published'],
	'card-updated': ['version', 'published'],
};

const MAX_VALUE = 256;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
// A compact JWT or SD-JWT (three base64url parts, the first a JSON header), or long unbroken key-like material
const TOKEN = /eyJ[\w-]{6,}\.[\w-]+|[A-Fa-f0-9]{64,}|[A-Za-z0-9+/_-]{80,}={0,2}/;

function safeScalar(value: unknown): string | number | boolean | null | undefined {
	if (value === null || typeof value === 'boolean') return value;
	if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
	if (typeof value !== 'string' || value.length > MAX_VALUE) return undefined;
	return EMAIL.test(value) || TOKEN.test(value) ? undefined : value;
}

export function sanitiseEventDetail(type: string, detail: unknown): Record<string, unknown> {
	const allowed = ALLOWED[type as AgentEventType] ?? [];
	if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return {};
	const out: Record<string, unknown> = {};
	for (const key of allowed) {
		const value = safeScalar((detail as Record<string, unknown>)[key]);
		if (value !== undefined) out[key] = value;
	}
	return out;
}
