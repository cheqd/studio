import { type AgentContext, defaultDocumentLoader } from '@credo-ts/core';
import { type SafeFetch, safeFetch as defaultSafeFetch } from '../../../../helpers/safe-fetch.js';

/**
 * JSON-LD document loader for the Credo engine.
 *
 * Credo's default loader serves its built-in contexts from memory and resolves DIDs through the agent, but any other
 * URL is fetched with the agent's own fetch. Contexts come from credentials supplied by callers, so every one of those
 * outbound requests goes through `safeFetch` instead: HTTPS only, public addresses only (checked on every redirect
 * hop), with response size, redirect and time limits.
 */

/** Largest JSON-LD document accepted from a remote host, in bytes. */
export const MAX_JSON_LD_DOCUMENT_BYTES = 1024 * 1024;
/** Time allowed for fetching one remote JSON-LD document, in milliseconds. */
export const JSON_LD_FETCH_TIMEOUT_MS = 5000;

interface FetchLikeResponse {
	url: string;
	ok: boolean;
	status: number;
	headers: { get(name: string): string | null };
	json(): Promise<unknown>;
}

/** Adapts `safeFetch` to the small part of the fetch interface that Credo's loader reads. */
function adaptFetch(fetcher: SafeFetch) {
	return async (url: string): Promise<FetchLikeResponse> => {
		const result = await fetcher(url, {
			maxBytes: MAX_JSON_LD_DOCUMENT_BYTES,
			timeoutMs: JSON_LD_FETCH_TIMEOUT_MS,
			headers: { accept: 'application/ld+json, application/json' },
		});
		return {
			url: result.url,
			ok: result.status >= 200 && result.status < 300,
			status: result.status,
			headers: { get: (name: string) => result.headers[name.toLowerCase()] ?? null },
			json: async () => JSON.parse(new TextDecoder().decode(result.body)),
		};
	};
}

/**
 * Returns a `documentLoader` factory for `JsonLdModule`. The returned loader behaves like Credo's default one, except
 * that the agent context it sees carries a fetch that is routed through `safeFetch` and plain http is never allowed.
 */
export function createSafeDocumentLoader(fetcher: SafeFetch = defaultSafeFetch) {
	const guardedFetch = adaptFetch(fetcher);
	return (agentContext: AgentContext) => {
		const guarded = Object.create(agentContext, {
			config: { value: { allowInsecureHttpUrls: false, fetch: guardedFetch } },
		}) as AgentContext;
		return defaultDocumentLoader(guarded);
	};
}
