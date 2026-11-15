import { describe, expect, it } from '@jest/globals';
import {
	createSafeFetch,
	isBlockedAddress,
	SafeFetchError,
	type ResolvedAddress,
	type TransportRequest,
	type TransportResponse,
} from '../../../src/helpers/safe-fetch.js';

const text = (value: string) => new TextEncoder().encode(value);

async function* chunksOf(...parts: Uint8Array[]) {
	for (const part of parts) yield part;
}

interface Script {
	/** host name -> answers */
	dns?: Record<string, ResolvedAddress[]>;
	/** url -> response */
	responses?: Record<string, Partial<TransportResponse> & { status: number }>;
}

function harness(script: Script) {
	const connections: { url: string; address: string }[] = [];
	const lookups: string[] = [];
	const fetch = createSafeFetch({
		resolve: async (hostname) => {
			lookups.push(hostname);
			const answers = script.dns?.[hostname];
			if (!answers) throw new Error('ENOTFOUND');
			return answers;
		},
		transport: async ({ url, address }: TransportRequest) => {
			connections.push({ url: url.toString(), address: address.address });
			const response = script.responses?.[url.toString()];
			if (!response) throw new Error('no route');
			return {
				headers: {},
				body: chunksOf(),
				destroy: () => undefined,
				...response,
			} as TransportResponse;
		},
	});
	return { fetch, connections, lookups };
}

const pub = (address = '93.184.216.34'): ResolvedAddress[] => [{ address, family: 4 }];

describe('isBlockedAddress', () => {
	it.each([
		['0.0.0.0'],
		['0.1.2.3'],
		['10.0.0.1'],
		['10.255.255.255'],
		['100.64.0.1'],
		['100.100.100.200'],
		['100.127.255.255'],
		['127.0.0.1'],
		['127.255.255.254'],
		['169.254.169.254'],
		['169.254.0.1'],
		['172.16.0.1'],
		['172.31.255.255'],
		['192.168.1.1'],
		['192.0.2.1'],
		['198.18.0.1'],
		['198.19.255.255'],
		['203.0.113.9'],
		['224.0.0.1'],
		['239.255.255.255'],
		['240.0.0.1'],
		['255.255.255.255'],
		['::'],
		['::1'],
		['fc00::1'],
		['fd12:3456:789a::1'],
		['fd00:ec2::254'],
		['fe80::1'],
		['fe80::1%eth0'],
		['fec0::1'],
		['ff02::1'],
		['2001:db8::1'],
		['::ffff:127.0.0.1'],
		['::ffff:7f00:1'],
		['::ffff:10.0.0.1'],
		['::ffff:169.254.169.254'],
		['::ffff:a9fe:a9fe'],
		['64:ff9b::7f00:1'],
		['64:ff9b::a9fe:a9fe'],
		['2002:7f00:1::'],
		['2002:a9fe:a9fe::1'],
		['::127.0.0.1'],
		['2001:0:4136:e378:8000:63bf:3fff:fdd2'],
		['not-an-address'],
		['999.1.1.1'],
	])('refuses %s', (address) => {
		expect(isBlockedAddress(address)).toBe(true);
	});

	it.each([
		['8.8.8.8'],
		['93.184.216.34'],
		['1.1.1.1'],
		['100.63.255.255'],
		['100.128.0.1'],
		['172.15.255.255'],
		['172.32.0.1'],
		['169.253.1.1'],
		['198.17.255.255'],
		['198.20.0.1'],
		['2606:4700:4700::1111'],
		['2a00:1450:4009:81f::200e'],
		['::ffff:8.8.8.8'],
		['2002:0808:0808::1'],
	])('allows %s', (address) => {
		expect(isBlockedAddress(address)).toBe(false);
	});
});

describe('safeFetch destinations', () => {
	it('fetches a public https URL, connecting to the checked address', async () => {
		const { fetch, connections } = harness({
			dns: { 'lists.example': pub('93.184.216.34') },
			responses: {
				'https://lists.example/list.json': {
					status: 200,
					headers: { 'content-type': 'application/json' },
					body: chunksOf(text('{"a":'), text('1}')),
				},
			},
		});
		const result = await fetch('https://lists.example/list.json');
		expect(Buffer.from(result.body).toString()).toBe('{"a":1}');
		expect(result.status).toBe(200);
		expect(connections).toEqual([{ url: 'https://lists.example/list.json', address: '93.184.216.34' }]);
	});

	it.each([
		['http://lists.example/list'],
		['ftp://lists.example/list'],
		['file:///etc/passwd'],
		['gopher://lists.example/'],
		['//lists.example/list'],
		['https://user:pass@lists.example/list'],
		['not a url'],
		[''],
	])('refuses %s without any lookup or connection', async (url) => {
		const { fetch, connections, lookups } = harness({ dns: { 'lists.example': pub() } });
		await expect(fetch(url)).rejects.toBeInstanceOf(SafeFetchError);
		expect(connections).toEqual([]);
		expect(lookups).toEqual([]);
	});

	it.each([
		['https://127.0.0.1/x'],
		['https://127.1/x'],
		['https://0x7f.0.0.1/x'],
		['https://2130706433/x'],
		['https://017700000001/x'],
		['https://10.1.2.3/x'],
		['https://192.168.0.10/x'],
		['https://172.20.0.1/x'],
		['https://169.254.169.254/latest/meta-data/'],
		['https://100.64.1.1/x'],
		['https://100.100.100.200/x'],
		['https://[::1]/x'],
		['https://[::ffff:127.0.0.1]/x'],
		['https://[fd00:ec2::254]/x'],
		['https://[fe80::1]/x'],
		['https://0.0.0.0/x'],
	])('refuses the IP literal %s', async (url) => {
		const { fetch, connections, lookups } = harness({});
		await expect(fetch(url)).rejects.toMatchObject({ code: 'blocked-destination' });
		expect(connections).toEqual([]);
		expect(lookups).toEqual([]);
	});

	it.each([
		['loopback', '127.0.0.1'],
		['RFC 1918', '10.0.0.5'],
		['link-local metadata', '169.254.169.254'],
		['CGNAT', '100.64.0.9'],
		['unique-local IPv6', 'fd00::1'],
		['IPv4-mapped IPv6 loopback', '::ffff:127.0.0.1'],
	])('refuses a host name that resolves to %s', async (_label, address) => {
		const { fetch, connections } = harness({
			dns: { 'evil.example': [{ address, family: address.includes(':') ? 6 : 4 }] },
			responses: { 'https://evil.example/x': { status: 200 } },
		});
		await expect(fetch('https://evil.example/x')).rejects.toMatchObject({ code: 'blocked-destination' });
		expect(connections).toEqual([]);
	});

	it('refuses when ANY answer for the name is internal (a public answer first does not help)', async () => {
		const { fetch, connections } = harness({
			dns: {
				'split.example': [
					{ address: '93.184.216.34', family: 4 },
					{ address: '169.254.169.254', family: 4 },
				],
			},
			responses: { 'https://split.example/x': { status: 200 } },
		});
		await expect(fetch('https://split.example/x')).rejects.toMatchObject({ code: 'blocked-destination' });
		expect(connections).toEqual([]);
	});

	it('reports a name that does not resolve as a generic failure', async () => {
		const { fetch } = harness({});
		await expect(fetch('https://nowhere.example/x')).rejects.toMatchObject({ code: 'dns-failure' });
	});

	it('never puts the reason, the host or the address in the message', async () => {
		const { fetch } = harness({ dns: { 'evil.example': [{ address: '10.9.8.7', family: 4 }] } });
		const error = (await fetch('https://evil.example/secret-path').catch((e) => e)) as SafeFetchError;
		expect(error.message).toBe('The remote resource could not be fetched');
		expect(error.message).not.toMatch(/10\.9\.8\.7|evil|secret/);
	});
});

describe('safeFetch redirects', () => {
	it('follows a redirect to another public host and re-checks it', async () => {
		const { fetch, connections, lookups } = harness({
			dns: { 'a.example': pub('93.184.216.34'), 'b.example': pub('8.8.8.8') },
			responses: {
				'https://a.example/start': { status: 302, headers: { location: 'https://b.example/final' } },
				'https://b.example/final': { status: 200, body: chunksOf(text('ok')) },
			},
		});
		const result = await fetch('https://a.example/start');
		expect(Buffer.from(result.body).toString()).toBe('ok');
		expect(result.url).toBe('https://b.example/final');
		expect(lookups).toEqual(['a.example', 'b.example']);
		expect(connections.map((c) => c.address)).toEqual(['93.184.216.34', '8.8.8.8']);
	});

	it.each([
		['an IP literal', 'https://169.254.169.254/latest/meta-data/'],
		['loopback by name', 'https://internal.example/x'],
		['a relative path that resolves publicly is fine, so use a protocol downgrade', 'http://b.example/x'],
		['a file URL', 'file:///etc/passwd'],
		['credentials', 'https://user:pw@b.example/x'],
	])('refuses a redirect to %s', async (_label, location) => {
		const { fetch, connections } = harness({
			dns: {
				'a.example': pub(),
				'b.example': pub('8.8.8.8'),
				'internal.example': [{ address: '127.0.0.1', family: 4 }],
			},
			responses: { 'https://a.example/start': { status: 307, headers: { location } } },
		});
		await expect(fetch('https://a.example/start')).rejects.toBeInstanceOf(SafeFetchError);
		// Only the first hop was ever connected to
		expect(connections.map((c) => c.url)).toEqual(['https://a.example/start']);
	});

	it('stops after the redirect limit, and follows none at 0', async () => {
		const responses: Record<string, { status: number; headers: Record<string, string> }> = {};
		for (let i = 0; i < 10; i++) {
			responses[`https://a.example/${i}`] = { status: 302, headers: { location: `https://a.example/${i + 1}` } };
		}
		const { fetch, connections } = harness({ dns: { 'a.example': pub() }, responses });
		await expect(fetch('https://a.example/0')).rejects.toMatchObject({ code: 'too-many-redirects' });
		expect(connections).toHaveLength(4); // the first request and three hops

		const none = harness({ dns: { 'a.example': pub() }, responses });
		await expect(none.fetch('https://a.example/0', { maxRedirects: 0 })).rejects.toMatchObject({
			code: 'too-many-redirects',
		});
		expect(none.connections).toHaveLength(1);
	});

	it('resolves a relative Location against the current URL and checks it too', async () => {
		const { fetch, connections } = harness({
			dns: { 'a.example': pub() },
			responses: {
				'https://a.example/dir/start': { status: 301, headers: { location: '../moved' } },
				'https://a.example/moved': { status: 200, body: chunksOf(text('x')) },
			},
		});
		await fetch('https://a.example/dir/start');
		expect(connections.map((c) => c.url)).toEqual(['https://a.example/dir/start', 'https://a.example/moved']);
	});

	it('treats a redirect without a Location as a failure', async () => {
		const { fetch } = harness({
			dns: { 'a.example': pub() },
			responses: { 'https://a.example/x': { status: 302 } },
		});
		await expect(fetch('https://a.example/x')).rejects.toBeInstanceOf(SafeFetchError);
	});
});

describe('safeFetch limits', () => {
	it('refuses a body that declares more than the cap, before reading it', async () => {
		let read = false;
		const { fetch } = harness({
			dns: { 'a.example': pub() },
			responses: {
				'https://a.example/big': {
					status: 200,
					headers: { 'content-length': '5000000' },
					body: (async function* () {
						read = true;
						yield text('x');
					})(),
				},
			},
		});
		await expect(fetch('https://a.example/big', { maxBytes: 1024 })).rejects.toMatchObject({ code: 'too-large' });
		expect(read).toBe(false);
	});

	it('refuses a body that overruns the cap while streaming, whatever it declared', async () => {
		let destroyed = false;
		const { fetch } = harness({
			dns: { 'a.example': pub() },
			responses: {
				'https://a.example/big': {
					status: 200,
					headers: { 'content-length': '10' },
					body: (async function* () {
						for (let i = 0; i < 1000; i++) yield new Uint8Array(100);
					})(),
					destroy: () => {
						destroyed = true;
					},
				},
			},
		});
		await expect(fetch('https://a.example/big', { maxBytes: 1000 })).rejects.toMatchObject({ code: 'too-large' });
		expect(destroyed).toBe(true);
	});

	it('accepts exactly the cap', async () => {
		const { fetch } = harness({
			dns: { 'a.example': pub() },
			responses: { 'https://a.example/x': { status: 200, body: chunksOf(new Uint8Array(1000)) } },
		});
		const result = await fetch('https://a.example/x', { maxBytes: 1000 });
		expect(result.body.byteLength).toBe(1000);
	});

	it('gives up on a response that never finishes (slow body)', async () => {
		const { fetch } = harness({
			dns: { 'a.example': pub() },
			responses: {
				'https://a.example/slow': {
					status: 200,
					body: (async function* () {
						yield text('first');
						await new Promise(() => undefined); // never yields again
					})(),
				},
			},
		});
		const started = Date.now();
		await expect(fetch('https://a.example/slow', { timeoutMs: 100 })).rejects.toMatchObject({ code: 'timeout' });
		expect(Date.now() - started).toBeLessThan(2000);
	});

	it('gives up on a connection that never answers (slow headers)', async () => {
		const slow = createSafeFetch({
			resolve: async () => pub(),
			transport: () => new Promise(() => undefined),
		});
		await expect(slow('https://a.example/x', { timeoutMs: 100 })).rejects.toMatchObject({ code: 'timeout' });
	});

	it('gives up on a DNS lookup that never answers', async () => {
		const slow = createSafeFetch({ resolve: () => new Promise(() => undefined) });
		await expect(slow('https://a.example/x', { timeoutMs: 100 })).rejects.toMatchObject({ code: 'timeout' });
	});

	it('counts all hops against one deadline', async () => {
		let hop = 0;
		const slow = createSafeFetch({
			resolve: async () => pub(),
			transport: async ({ url }) => {
				await new Promise((resolve) => setTimeout(resolve, 60));
				hop++;
				return {
					status: 302,
					headers: { location: `https://a.example/${hop}` },
					body: chunksOf(),
					destroy: () => undefined,
				} as TransportResponse;
			},
		});
		await expect(slow('https://a.example/0', { timeoutMs: 150, maxRedirects: 10 })).rejects.toMatchObject({
			code: 'timeout',
		});
	});

	it('refuses a non-2xx answer', async () => {
		const { fetch } = harness({
			dns: { 'a.example': pub() },
			responses: { 'https://a.example/x': { status: 404 }, 'https://a.example/y': { status: 500 } },
		});
		await expect(fetch('https://a.example/x')).rejects.toMatchObject({ code: 'bad-status' });
		await expect(fetch('https://a.example/y')).rejects.toMatchObject({ code: 'bad-status' });
	});
});
