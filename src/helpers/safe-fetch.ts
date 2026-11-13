import { request as httpsRequest } from 'node:https';
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import type { IncomingMessage } from 'node:http';

/**
 * The one fetch wrapper for URLs that come from somebody else's credential (action A-062, migration plan 7.2 S10).
 *
 * A status list (or anything else a credential points at) may legitimately live on any public host, so there is no
 * host allow-list. What is blocked is where the request goes:
 *
 *   - HTTPS only; no credentials in the URL.
 *   - The host name is resolved here and EVERY address it resolves to must be public. Loopback, private (RFC 1918),
 *     link-local, unique-local IPv6, CGNAT, multicast, reserved and cloud metadata addresses (including
 *     169.254.169.254) are refused, whether they arrive as a name, as an IP literal in any notation, or inside an
 *     IPv4-mapped / NAT64 / 6to4 IPv6 address.
 *   - The connection is made to the address that was checked (DNS is not asked a second time), so a name that
 *     changes its answer between the check and the connect (DNS rebinding) cannot reach an internal address.
 *   - Redirects are followed by hand, up to a small limit, and every hop goes through the same checks.
 *   - The response is capped in size and the whole exchange (all hops, headers and body) in time.
 *
 * Every failure carries a generic message; the specific reason is on `code` for the server log only and must not be
 * echoed to a caller, because it would tell an attacker which internal addresses exist.
 */

export type SafeFetchErrorCode =
	| 'invalid-url'
	| 'not-https'
	| 'blocked-destination'
	| 'dns-failure'
	| 'too-many-redirects'
	| 'too-large'
	| 'timeout'
	| 'bad-status'
	| 'network';

export class SafeFetchError extends Error {
	readonly code: SafeFetchErrorCode;

	constructor(code: SafeFetchErrorCode) {
		super('The remote resource could not be fetched');
		this.name = 'SafeFetchError';
		this.code = code;
	}
}

export interface SafeFetchOptions {
	/** Largest response body accepted, in bytes. Default 4 MiB. */
	maxBytes?: number;
	/** Time allowed for the whole exchange across all hops, in milliseconds. Default 5000. */
	timeoutMs?: number;
	/** Redirect hops followed (each one re-checked). Default 3; 0 follows none. */
	maxRedirects?: number;
	headers?: Record<string, string>;
}

export interface SafeFetchResult {
	status: number;
	/** Lower-cased header names */
	headers: Record<string, string>;
	body: Uint8Array;
	/** The URL that answered, after redirects */
	url: string;
}

export type SafeFetch = (url: string, options?: SafeFetchOptions) => Promise<SafeFetchResult>;

export interface ResolvedAddress {
	address: string;
	family: number;
}

export interface TransportRequest {
	url: URL;
	/** The already-checked address to connect to. The TLS name stays the URL's host name. */
	address: ResolvedAddress;
	headers: Record<string, string>;
	signal: AbortSignal;
}

export interface TransportResponse {
	status: number;
	headers: Record<string, string>;
	body: AsyncIterable<Uint8Array>;
	destroy(): void;
}

export interface SafeFetchDependencies {
	resolve?: (hostname: string) => Promise<ResolvedAddress[]>;
	transport?: (request: TransportRequest) => Promise<TransportResponse>;
}

const DEFAULT_MAX_BYTES = 4 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

// ------------------------------------------------------------------------------------------ address classes

type Cidr4 = [number, number, number, number, number];

/** [a, b, c, d, prefix length]. Anything that is not globally routable unicast. */
const BLOCKED_V4: Cidr4[] = [
	[0, 0, 0, 0, 8], // "this" network
	[10, 0, 0, 0, 8], // RFC 1918
	[100, 64, 0, 0, 10], // CGNAT (RFC 6598); also Alibaba metadata 100.100.100.200
	[127, 0, 0, 0, 8], // loopback
	[169, 254, 0, 0, 16], // link-local; cloud metadata 169.254.169.254
	[172, 16, 0, 0, 12], // RFC 1918
	[192, 0, 0, 0, 24], // IETF protocol assignments
	[192, 0, 2, 0, 24], // TEST-NET-1
	[192, 88, 99, 0, 24], // 6to4 relay anycast
	[192, 168, 0, 0, 16], // RFC 1918
	[198, 18, 0, 0, 15], // benchmarking
	[198, 51, 100, 0, 24], // TEST-NET-2
	[203, 0, 113, 0, 24], // TEST-NET-3
	[224, 0, 0, 0, 4], // multicast
	[240, 0, 0, 0, 4], // reserved, incl. broadcast
];

function v4InRange(octets: number[], [a, b, c, d, prefix]: Cidr4): boolean {
	const toInt = (o: number[]) => ((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) >>> 0;
	const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
	return (toInt(octets) & mask) === (toInt([a, b, c, d]) & mask);
}

function parseV4(address: string): number[] | null {
	const parts = address.split('.');
	if (parts.length !== 4) return null;
	const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : Number.NaN));
	return octets.every((o) => o >= 0 && o <= 255) ? octets : null;
}

/** Expands an IPv6 text address to its 16 bytes. Handles `::` and a trailing dotted IPv4. */
function parseV6(address: string): number[] | null {
	let text = address.split('%')[0]; // drop a zone id
	if (text.startsWith('[') && text.endsWith(']')) text = text.slice(1, -1);
	let tail: number[] = [];
	const lastColon = text.lastIndexOf(':');
	if (lastColon !== -1 && text.includes('.', lastColon)) {
		const v4 = parseV4(text.slice(lastColon + 1));
		if (!v4) return null;
		tail = v4;
		text = `${text.slice(0, lastColon + 1)}0:0`;
	}
	const halves = text.split('::');
	if (halves.length > 2) return null;
	const groups = (part: string) => (part === '' ? [] : part.split(':'));
	const head = groups(halves[0]);
	const rest = halves.length === 2 ? groups(halves[1]) : [];
	const missing = 8 - head.length - rest.length;
	if (halves.length === 1 ? head.length !== 8 : missing < 1) return null;
	const all = halves.length === 1 ? head : [...head, ...Array(missing).fill('0'), ...rest];
	const bytes: number[] = [];
	for (const group of all) {
		if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
		const value = Number.parseInt(group, 16);
		bytes.push(value >> 8, value & 0xff);
	}
	if (tail.length === 4) {
		bytes[12] = tail[0];
		bytes[13] = tail[1];
		bytes[14] = tail[2];
		bytes[15] = tail[3];
	}
	return bytes.length === 16 ? bytes : null;
}

/**
 * True when the address is not a public unicast address (or cannot be read, which fails closed). Accepts IPv4 and
 * IPv6 text forms.
 */
export function isBlockedAddress(address: string): boolean {
	if (isIP(address.split('%')[0].replace(/^\[|\]$/g, '')) === 4) {
		const octets = parseV4(address);
		return !octets || BLOCKED_V4.some((range) => v4InRange(octets, range));
	}
	const bytes = parseV6(address);
	if (!bytes) return true;

	const allZero = (from: number, to: number) => bytes.slice(from, to).every((b) => b === 0);
	// :: and ::1
	if (allZero(0, 15) && (bytes[15] === 0 || bytes[15] === 1)) return true;
	// IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d): judged by the IPv4 address inside
	if (allZero(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) return isBlockedAddress(bytes.slice(12).join('.'));
	if (allZero(0, 12)) return isBlockedAddress(bytes.slice(12).join('.'));
	// NAT64 64:ff9b::/96: judged by the IPv4 address inside
	if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b && allZero(4, 12)) {
		return isBlockedAddress(bytes.slice(12).join('.'));
	}
	// 6to4 2002::/16: judged by the IPv4 address embedded after the prefix
	if (bytes[0] === 0x20 && bytes[1] === 0x02) return isBlockedAddress(bytes.slice(2, 6).join('.'));
	// Teredo 2001::/32 carries a client IPv4 in obfuscated form: refuse it outright
	if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0 && bytes[3] === 0) return true;
	// Unique-local fc00::/7, link-local fe80::/10, site-local fec0::/10, multicast ff00::/8
	if ((bytes[0] & 0xfe) === 0xfc) return true;
	if (bytes[0] === 0xfe && (bytes[1] & 0xc0) >= 0x80) return true;
	if (bytes[0] === 0xff) return true;
	// Documentation 2001:db8::/32 and discard-only 100::/64
	if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0x0d && bytes[3] === 0xb8) return true;
	if (bytes[0] === 0x01 && allZero(1, 8)) return true;
	// Anything outside global unicast 2000::/3 is not routable on the public internet
	if ((bytes[0] & 0xe0) !== 0x20) return true;
	return false;
}

// ----------------------------------------------------------------------------------------------- transport

const defaultResolve = async (hostname: string): Promise<ResolvedAddress[]> => {
	const answers = await dnsLookup(hostname, { all: true, verbatim: true });
	return answers.map(({ address, family }) => ({ address, family }));
};

const defaultTransport = ({ url, address, headers, signal }: TransportRequest): Promise<TransportResponse> =>
	new Promise((resolve, reject) => {
		const request = httpsRequest(
			{
				protocol: 'https:',
				hostname: url.hostname.replace(/^\[|\]$/g, ''),
				port: url.port || 443,
				path: `${url.pathname}${url.search}`,
				method: 'GET',
				headers,
				servername: isIP(url.hostname.replace(/^\[|\]$/g, '')) ? undefined : url.hostname,
				agent: false,
				signal,
				// The address was checked before this point: connect to it and never resolve the name again
				lookup: ((_host: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
					if (options?.all) callback(null, [{ address: address.address, family: address.family }]);
					else callback(null, address.address, address.family);
				}) as never,
			},
			(response: IncomingMessage) => {
				const responseHeaders: Record<string, string> = {};
				for (const [name, value] of Object.entries(response.headers)) {
					if (value !== undefined)
						responseHeaders[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
				}
				resolve({
					status: response.statusCode ?? 0,
					headers: responseHeaders,
					body: response,
					destroy: () => response.destroy(),
				});
			}
		);
		request.on('error', reject);
		request.end();
	});

// -------------------------------------------------------------------------------------------------- fetch

function parseTarget(raw: string): URL {
	let url: URL;
	try {
		url = new URL(raw);
	} catch {
		throw new SafeFetchError('invalid-url');
	}
	if (url.protocol !== 'https:') throw new SafeFetchError('not-https');
	if (url.username || url.password) throw new SafeFetchError('invalid-url');
	if (!url.hostname) throw new SafeFetchError('invalid-url');
	return url;
}

/** Resolves the host and returns an address to connect to, refusing when ANY answer is not public. */
async function checkedAddress(
	url: URL,
	resolve: NonNullable<SafeFetchDependencies['resolve']>
): Promise<ResolvedAddress> {
	const host = url.hostname.replace(/^\[|\]$/g, '');
	// `new URL` has already normalised exotic IPv4 notations (0x7f.1, 2130706433, 017700000001) to dotted decimal
	const literalFamily = isIP(host);
	if (literalFamily) {
		if (isBlockedAddress(host)) throw new SafeFetchError('blocked-destination');
		return { address: host, family: literalFamily };
	}
	let answers: ResolvedAddress[];
	try {
		answers = await resolve(host);
	} catch {
		throw new SafeFetchError('dns-failure');
	}
	if (answers.length === 0) throw new SafeFetchError('dns-failure');
	if (answers.some((answer) => isBlockedAddress(answer.address))) throw new SafeFetchError('blocked-destination');
	return answers[0];
}

export function createSafeFetch(dependencies: SafeFetchDependencies = {}): SafeFetch {
	const resolve = dependencies.resolve ?? defaultResolve;
	const transport = dependencies.transport ?? defaultTransport;

	return async function safeFetch(rawUrl, options = {}) {
		const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
		const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

		const controller = new AbortController();
		let timedOut = false;
		const timer = setTimeout(() => {
			timedOut = true;
			controller.abort();
		}, timeoutMs);

		let live: TransportResponse | undefined;
		try {
			let url = parseTarget(rawUrl);
			for (let hop = 0; ; hop++) {
				const address = await raceAbort(checkedAddress(url, resolve), controller.signal);
				live = await raceAbort(
					transport({
						url,
						address,
						signal: controller.signal,
						headers: { 'accept-encoding': 'identity', ...lower(options.headers) },
					}),
					controller.signal
				);

				if (REDIRECT_STATUSES.has(live.status)) {
					const location = live.headers.location;
					live.destroy();
					live = undefined;
					if (!location) throw new SafeFetchError('network');
					if (hop >= maxRedirects) throw new SafeFetchError('too-many-redirects');
					// The next hop is parsed and checked from scratch: https, no credentials, public address
					url = parseTarget(new URL(location, url).toString());
					continue;
				}

				if (live.status < 200 || live.status > 299) throw new SafeFetchError('bad-status');
				const declared = Number(live.headers['content-length']);
				if (Number.isFinite(declared) && declared > maxBytes) throw new SafeFetchError('too-large');

				const chunks: Uint8Array[] = [];
				let received = 0;
				const iterator = live.body[Symbol.asyncIterator]();
				while (true) {
					// Raced against the deadline: a server that stops sending must not hold the request open
					const next = await raceAbort(iterator.next(), controller.signal);
					if (next.done) break;
					received += next.value.byteLength;
					if (received > maxBytes) throw new SafeFetchError('too-large');
					chunks.push(next.value);
				}
				const body = new Uint8Array(received);
				let offset = 0;
				for (const chunk of chunks) {
					body.set(chunk, offset);
					offset += chunk.byteLength;
				}
				return { status: live.status, headers: live.headers, body, url: url.toString() };
			}
		} catch (error) {
			if (error instanceof SafeFetchError) throw error;
			throw new SafeFetchError(timedOut || controller.signal.aborted ? 'timeout' : 'network');
		} finally {
			clearTimeout(timer);
			live?.destroy();
		}
	};
}

function lower(headers: Record<string, string> | undefined): Record<string, string> {
	return Object.fromEntries(Object.entries(headers ?? {}).map(([name, value]) => [name.toLowerCase(), value]));
}

/** Rejects as soon as the signal aborts, so a stalled DNS answer or handshake cannot outlive the deadline. */
function raceAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
	if (signal.aborted) return Promise.reject(new SafeFetchError('timeout'));
	return new Promise<T>((resolve, reject) => {
		const onAbort = () => reject(new SafeFetchError('timeout'));
		signal.addEventListener('abort', onAbort, { once: true });
		work.then(
			(value) => {
				signal.removeEventListener('abort', onAbort);
				resolve(value);
			},
			(error) => {
				signal.removeEventListener('abort', onAbort);
				reject(error);
			}
		);
	});
}

/** The process-wide wrapper: real DNS, real HTTPS. Use this for every fetch of a URL taken from a credential. */
export const safeFetch: SafeFetch = createSafeFetch();
