import type { AgentEventType } from '../../types/agent.js';

/**
 * What an activity event's `detail` may carry. The activity feed is shown to customers, so `detail` is an
 * allowlist per event type, applied when an event is written and again when it is read (so a row written by an
 * older build, a backfill or a hand edit cannot leak anything). Only short scalars survive: no nested values, no
 * email addresses, and nothing that looks like a token or key (including short ones: vendor-prefixed tokens, bearer or other
 * authorisation values, long hex and long base64).
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
// Short secrets too: a hex digest or key of 32+ characters, base64 or base64url of 40+ characters, and the usual
// vendor prefixes (Stripe `sk_`/`pk_`/`rk_`, GitHub `ghp_`/`github_pat_`, Slack `xox*-`) or an `Authorization` scheme.
// None of the allowed fields legitimately holds any of these: ids are UUIDs (hyphenated, 36 characters), key ids
// are DID URLs or `key-N`, and the rest are enums, versions, booleans and ISO dates.
const LONG_HEX = /[A-Fa-f0-9]{32,}/;
const LONG_BASE64 = /[A-Za-z0-9+/_-]{40,}={0,2}/;
const VENDOR_TOKEN =
	/\b(?:[spr]k_(?:live_|test_)?[A-Za-z0-9]{4,}|gh[pousr]_[A-Za-z0-9]{4,}|github_pat_[A-Za-z0-9_]{4,}|xox[a-z]?-[A-Za-z0-9-]{4,})/i;
const BEARER = /\bbearer\b/i;
// Whitespace after a leading word: `Basic dXNlcjpwYXNz`, `Token abc`, `ApiKey abc`, a sentence. Never a legitimate value.
const SCHEME_AND_SPACE = /^\s*[A-Za-z][\w.-]*\s+\S/;
// A URL carrying credentials: `https://user:pass@host`
const URL_CREDENTIALS = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@]*:[^\s/@]*@/i;
// A DID URL may legitimately contain a long method-specific id (`did:key:z6Mk...`): only the older, longer limit applies to it
const DID_URL = /^did:[a-z0-9]+:[^\s]+$/;

function looksSecret(value: string): boolean {
	if (EMAIL.test(value) || TOKEN.test(value) || VENDOR_TOKEN.test(value) || BEARER.test(value)) return true;
	if (SCHEME_AND_SPACE.test(value) || URL_CREDENTIALS.test(value)) return true;
	return !DID_URL.test(value) && (LONG_HEX.test(value) || LONG_BASE64.test(value));
}

function safeScalar(value: unknown): string | number | boolean | null | undefined {
	if (value === null || typeof value === 'boolean') return value;
	if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
	if (typeof value !== 'string' || value.length > MAX_VALUE) return undefined;
	return looksSecret(value) ? undefined : value;
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
