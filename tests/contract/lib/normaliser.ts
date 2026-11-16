/**
 * Normaliser: turns a request or response into a deterministic form so that two runs against the
 * same behaviour compare equal even though ids, timestamps, hashes and signatures differ.
 *
 * The rules are deliberately few and documented in tests/contract/README.md. Every rule keeps the
 * *shape* of the value (a placeholder names what kind of value was there) so a field that changes
 * type or disappears is still a failure.
 *
 * Rules, applied in this order to every string (whole or embedded):
 *  1. Pinned values (`knownValues`, e.g. the testnet DID the scenario targets) become `<var:NAME>`.
 *  2. Compact JWTs are decoded: the signature is dropped and header and payload are normalised
 *     recursively, giving `{ "$jwt": { header, payload } }`. A JWT that cannot be decoded becomes
 *     `<jwt:undecodable>`.
 *  3. ISO 8601 timestamps become `<timestamp>`.
 *  4. UUIDs become `<uuid:N>`, N being the order of first appearance within one exchange, so two
 *     fields holding the same id still match each other and a field holding a different id does not.
 *  5. `did:cheqd:<network>:<non-uuid id>` ids become `did:cheqd:<network>:<did-id:N>`.
 *  6. 64-character hex strings (transaction and content hashes) become `<hash:N>`.
 *  7. cheqd bech32 account addresses become `<address:N>`.
 *  7a. Email addresses become `<email>` (no personal data in fixtures).
 * Then, by key name (case-insensitive) irrespective of value:
 *  - signature material (`proofValue`, `signature`, `signatureValue`, `jws`) becomes `<signature>`
 *    (`proofValue` keeps its multibase prefix character, e.g. `<signature:z>`);
 *  - `encodedList` keeps only its first character, e.g. `<encodedList:H>`, so an unsigned or
 *    differently prefixed list is still caught;
 *  - `txHash`, `transactionHash` become `<hash:N>`; `nonce`, `challenge`, `jti` become `<random>`;
 *  - numeric `iat`, `exp`, `nbf`, `timestamp`, `created*`, `updated*`, `*At` become `<epoch>`.
 * Finally per-step overrides: `ignorePaths` become `<ignored>`, `shapeOnlyPaths` keep only the type
 * (`<string>`, `<number>`, ...). Paths are dotted, `*` matches any key or array index, for example
 * `records.*.createdAt`.
 *
 * Object keys are sorted. Array order is preserved: an order change is a contract change.
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

export interface NormaliserOptions {
	/** Literal values to pin, by name, e.g. `{ KNOWN_DID: 'did:cheqd:testnet:...' }`. */
	knownValues?: Record<string, string>;
	ignorePaths?: string[];
	shapeOnlyPaths?: string[];
}

const ISO_TIMESTAMP = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g;
const UUID = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
const DID_CHEQD_SHORT = /did:cheqd:(testnet|mainnet):(?![0-9a-fA-F]{8}-)([A-Za-z0-9]{16,32})/g;
const HEX64 = /\b[0-9a-fA-F]{64}\b/g;
const CHEQD_ADDRESS = /\bcheqd1[a-z0-9]{38}\b/g;
// Personal data must never reach a committed fixture, so email addresses are replaced.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT = /^eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*$/;

const SIGNATURE_KEYS = new Set(['proofvalue', 'signature', 'signaturevalue', 'jws']);
const HASH_KEYS = new Set(['txhash', 'transactionhash']);
const RANDOM_KEYS = new Set(['nonce', 'challenge', 'jti']);
const EPOCH_KEYS = new Set(['iat', 'exp', 'nbf', 'timestamp']);
const EPOCH_KEY_PATTERN = /^(created|updated)|[a-z]At$/;

/** One context per exchange (request plus response) so numbering is consistent within it. */
export class Normaliser {
	private counters: Record<string, Map<string, number>> = {};
	private readonly known: [string, string][];
	private readonly ignore: string[][];
	private readonly shapeOnly: string[][];

	constructor(options: NormaliserOptions = {}) {
		this.known = Object.entries(options.knownValues ?? {})
			.filter(([, v]) => v)
			.map(([name, value]) => [name, value] as [string, string])
			.sort((a, b) => b[1].length - a[1].length);
		this.ignore = (options.ignorePaths ?? []).map((p) => p.split('.'));
		this.shapeOnly = (options.shapeOnlyPaths ?? []).map((p) => p.split('.'));
	}

	normalise(value: unknown): Json {
		return this.walk(value, [], '');
	}

	private ordinal(kind: string, raw: string): number {
		const map = (this.counters[kind] ??= new Map());
		if (!map.has(raw)) map.set(raw, map.size + 1);
		return map.get(raw) as number;
	}

	private matches(patterns: string[][], path: string[]): boolean {
		return patterns.some((p) => p.length === path.length && p.every((seg, i) => seg === '*' || seg === path[i]));
	}

	private walk(value: unknown, path: string[], key: string): Json {
		if (this.matches(this.ignore, path)) return '<ignored>';
		if (this.matches(this.shapeOnly, path)) return shapeOf(value);

		if (value === null || value === undefined) return null;
		if (Array.isArray(value)) return value.map((v, i) => this.walk(v, [...path, String(i)], key));

		const k = key.toLowerCase();
		if (typeof value === 'object') {
			const out: { [key: string]: Json } = {};
			for (const childKey of Object.keys(value as object).sort()) {
				out[childKey] = this.walk((value as Record<string, unknown>)[childKey], [...path, childKey], childKey);
			}
			return out;
		}

		if (typeof value === 'number') {
			return EPOCH_KEYS.has(k) || EPOCH_KEY_PATTERN.test(key) ? '<epoch>' : value;
		}
		if (typeof value === 'boolean') return value;

		const s = String(value);
		if (SIGNATURE_KEYS.has(k)) return k === 'proofvalue' ? `<signature:${s.charAt(0)}>` : '<signature>';
		if (k === 'encodedlist') return `<encodedList:${s.charAt(0)}>`;
		if (HASH_KEYS.has(k)) return `<hash:${this.ordinal('hash', s)}>`;
		if (RANDOM_KEYS.has(k)) return '<random>';
		return this.string(s);
	}

	private string(input: string): Json {
		let s = input;
		for (const [name, literal] of this.known) s = s.split(literal).join(`<var:${name}>`);

		if (JWT.test(s)) return this.jwt(s);

		s = s.replace(ISO_TIMESTAMP, '<timestamp>');
		s = s.replace(UUID, (m) => `<uuid:${this.ordinal('uuid', m.toLowerCase())}>`);
		s = s.replace(
			DID_CHEQD_SHORT,
			(_m, net: string, id: string) => `did:cheqd:${net}:<did-id:${this.ordinal('did', id)}>`
		);
		s = s.replace(HEX64, (m) => `<hash:${this.ordinal('hash', m.toLowerCase())}>`);
		s = s.replace(CHEQD_ADDRESS, (m) => `<address:${this.ordinal('address', m)}>`);
		s = s.replace(EMAIL, '<email>');
		return s;
	}

	private jwt(token: string): Json {
		const [h, p] = token.split('.');
		try {
			const decode = (part: string) => JSON.parse(Buffer.from(part, 'base64url').toString('utf-8')) as unknown;
			return { $jwt: { header: this.walk(decode(h), [], ''), payload: this.walk(decode(p), [], '') } };
		} catch {
			return '<jwt:undecodable>';
		}
	}
}

function shapeOf(value: unknown): string {
	if (value === null || value === undefined) return '<null>';
	if (Array.isArray(value)) return '<array>';
	return `<${typeof value}>`;
}

export function normalise(value: unknown, options: NormaliserOptions = {}): Json {
	return new Normaliser(options).normalise(value);
}
