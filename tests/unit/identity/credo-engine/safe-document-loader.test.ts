import { createServer, type Server } from 'node:net';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import type { AgentContext } from '@credo-ts/core';
import { createSafeFetch, safeFetch, type TransportRequest } from '../../../../src/helpers/safe-fetch.js';
import { createSafeDocumentLoader } from '../../../../src/services/identity/engine/credo/safe-document-loader.js';

const unusedFetch = jest.fn(async () => {
	throw new Error('the agent fetch must not be used');
});

/** The slice of an agent context the loader reads: a DID resolver and a config whose own fetch must stay unused. */
const agentContext = {
	dependencyManager: { resolve: () => ({ resolve: async () => ({ didResolutionMetadata: { error: 'notFound' } }) }) },
	resolve: () => ({ maxDocumentBytes: undefined }),
	config: { allowInsecureHttpUrls: true, fetch: unusedFetch },
} as unknown as AgentContext;

async function* body(text: string) {
	yield new TextEncoder().encode(text);
}

describe('Credo JSON-LD document loader', () => {
	let listener: Server;
	let connections = 0;
	let port = 0;

	beforeAll(async () => {
		listener = createServer((socket) => {
			connections++;
			socket.destroy();
		});
		await new Promise<void>((resolve) => listener.listen(0, '127.0.0.1', resolve));
		port = (listener.address() as AddressInfo).port;
	});
	afterAll(() => new Promise<void>((resolve) => listener.close(() => resolve())));

	it('refuses a context on a loopback address without connecting', async () => {
		const loader = createSafeDocumentLoader(safeFetch)(agentContext);
		await expect(loader(`https://127.0.0.1:${port}/context.jsonld`)).rejects.toMatchObject({
			code: 'blocked-destination',
		});
		expect(connections).toBe(0);
		expect(unusedFetch).not.toHaveBeenCalled();
	});

	it('refuses plain http and metadata addresses', async () => {
		const loader = createSafeDocumentLoader(safeFetch)(agentContext);
		await expect(loader('http://example.com/context.jsonld')).rejects.toThrow();
		await expect(loader('https://169.254.169.254/latest')).rejects.toMatchObject({ code: 'blocked-destination' });
	});

	it('refuses a public name that resolves to a private address', async () => {
		const fetcher = createSafeFetch({ resolve: async () => [{ address: '10.0.0.5', family: 4 }] });
		const loader = createSafeDocumentLoader(fetcher)(agentContext);
		await expect(loader('https://contexts.example.org/c.jsonld')).rejects.toMatchObject({
			code: 'blocked-destination',
		});
	});

	it('still loads a normal public context', async () => {
		const requests: TransportRequest[] = [];
		const fetcher = createSafeFetch({
			resolve: async () => [{ address: '93.184.216.34', family: 4 }],
			transport: async (request) => {
				requests.push(request);
				return {
					status: 200,
					headers: { 'content-type': 'application/ld+json' },
					body: body(JSON.stringify({ '@context': { name: 'https://schema.org/name' } })),
					destroy: () => undefined,
				};
			},
		});
		const loader = createSafeDocumentLoader(fetcher)(agentContext);
		const loaded = await loader('https://contexts.example.org/c.jsonld');
		expect(loaded.document).toEqual({ '@context': { name: 'https://schema.org/name' } });
		expect(requests).toHaveLength(1);
		expect(requests[0].address.address).toBe('93.184.216.34');
		expect(unusedFetch).not.toHaveBeenCalled();
	});

	it('serves built-in contexts without any network access', async () => {
		const fetcher = jest.fn(async () => {
			throw new Error('no network expected');
		});
		const loader = createSafeDocumentLoader(fetcher as never)(agentContext);
		const loaded = await loader('https://www.w3.org/2018/credentials/v1');
		expect(loaded.document).toBeTruthy();
		expect(fetcher).not.toHaveBeenCalled();
	});
});
