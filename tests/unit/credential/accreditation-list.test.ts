import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * `GET /trust-registry/accreditation/list` under a burst of concurrent calls, with a resolver that takes 100 ms per
 * resource. Each resource is resolved once (its content never changes), concurrent requests share the reads, and a
 * revocation shows at once because the status comes from Studio's table on every request.
 */

// Entities read this when they load; no database is used
process.env.ENABLE_EXTERNAL_DB ??= 'false';
process.env.EXTERNAL_DB_ENCRYPTION_KEY ??= '0'.repeat(64);

const RESOLVER_DELAY_MS = 100;
const resources = Array.from({ length: 20 }, (_, i) => ({
	resourceId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
	did: 'did:cheqd:testnet:5f3b3b2e-0000-4000-8000-000000000001',
}));
let resolverCalls = 0;
const statuses = new Map<string, string>();

jest.unstable_mockModule('../../../src/database/connection/connection.js', () => ({
	Connection: { instance: { dbConnection: { getRepository: () => ({}) } } },
}));
jest.unstable_mockModule('../../../src/services/identity/index.js', () => ({
	IdentityServiceStrategySetup: class {
		async engine() {
			return {
				async findLatestResourcesVersionsByType() {
					return { total: resources.length, resources };
				},
				async resolve(url: string) {
					resolverCalls++;
					await new Promise((resolve) => setTimeout(resolve, RESOLVER_DELAY_MS));
					const resourceId = url.split('/resources/')[1];
					return new Response(
						JSON.stringify({ contentStream: { id: `urn:${resourceId}` }, contentMetadata: { resourceId } })
					);
				},
			};
		}
	},
}));

const { AccreditationService } = await import('../../../src/services/api/accreditation.js');
const { Credentials } = await import('../../../src/services/api/credentials.js');
const { accreditationContentCache, setCachedAccreditation } =
	await import('../../../src/services/identity/engine/accreditation-cache.js');

jest.spyOn(Credentials.instance, 'list').mockImplementation(
	async () =>
		({
			credentials: resources.map((resource) => ({
				issuedCredentialId: `ic-${resource.resourceId}`,
				providerId: 'studio',
				providerCredentialId: resource.resourceId,
				status: statuses.get(resource.resourceId) ?? 'issued',
				statusUpdatedAt: null,
			})),
			total: resources.length,
		}) as never
);

const customer = { customerId: 'c-1' } as never;
const list = () =>
	AccreditationService.instance.list_accreditations(customer, 'authorize' as never, 'testnet') as Promise<{
		success: boolean;
		data: { total: number; accreditations: { id: string; metadata?: { status: string } }[] };
	}>;

async function burst(size: number) {
	const started = performance.now();
	const results = await Promise.all(Array.from({ length: size }, list));
	return { ms: performance.now() - started, results };
}

beforeEach(() => {
	resolverCalls = 0;
	statuses.clear();
	accreditationContentCache.clear();
});

describe('accreditation list', () => {
	it('answers a burst of 8 concurrent calls with one resolver read per resource, then from the cache', async () => {
		// As on a busy instance: the short-lived shared cache already holds its maximum number of entries
		for (let i = 0; i < 200; i++) setCachedAccreditation(`other::${i}`, { i });

		const first = await burst(8);
		expect(resolverCalls).toBe(resources.length);
		for (const result of first.results) {
			expect(result.success).toBe(true);
			expect(result.data.accreditations).toHaveLength(resources.length);
		}

		const second = await burst(8);
		expect(resolverCalls).toBe(resources.length);
		expect(second.results.every((result) => result.data.accreditations.length === resources.length)).toBe(true);
		// 20 resources at 100 ms, 8 at a time: three rounds the first time, none after
		expect(first.ms).toBeLessThan(1500);
		expect(second.ms).toBeLessThan(100);
		console.log(
			`accreditation list, burst of 8: first ${first.ms.toFixed(0)} ms, cached ${second.ms.toFixed(0)} ms`
		);
	});

	it('shows a status change at once although the credential comes from the cache', async () => {
		await list();
		statuses.set(resources[0].resourceId, 'revoked');
		const after = await list();
		expect(after.data.accreditations[0].metadata?.status).toBe('revoked');
		expect(resolverCalls).toBe(resources.length);
	});
});
