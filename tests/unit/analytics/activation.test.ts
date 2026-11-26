import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { ActivationMilestone } from '../../../src/services/analytics/activation.js';

const query = jest.fn<(sql: string, parameters: unknown[]) => Promise<unknown>>();
jest.unstable_mockModule('../../../src/database/connection/connection.js', () => ({
	Connection: { instance: { dbConnection: { query } } },
}));

const capture = jest.fn();
const on = jest.fn();
const PostHogConstructor = jest.fn(() => ({ capture, on }));
jest.unstable_mockModule('posthog-node', () => ({ PostHog: PostHogConstructor }));

const { recordActivation, ACTIVATION_MILESTONES, activationMilestoneFor, resetActivationCacheForTests } =
	await import('../../../src/services/analytics/activation.js');
const posthog = await import('../../../src/services/analytics/posthog.js');
const { isValidSource, sourceOrUndefined } = await import('../../../src/helpers/source.js');

const customerId = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
	query.mockReset();
	capture.mockReset();
	on.mockReset();
	PostHogConstructor.mockClear();
	posthog.resetPostHogForTests();
	Reflect.deleteProperty(process.env, 'POSTHOG_API_KEY');
	Reflect.deleteProperty(process.env, 'POSTHOG_HOST');
	jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

describe('source validation (#868)', () => {
	it.each(['studio', 'sdk', 'agent-quickstart', 'agent', 'a', '0day', 'x'.repeat(32)])('accepts %s', (value) => {
		expect(isValidSource(value)).toBe(true);
	});
	it.each([
		'',
		'Studio',
		'-start',
		'has space',
		'under_score',
		'x'.repeat(33),
		'a@b.co',
		'<script>',
		"x'; DROP TABLE customer; --",
		'a\nb',
		42,
		null,
		undefined,
		{},
	])('rejects %j', (value) => {
		expect(isValidSource(value)).toBe(false);
	});
	it('sourceOrUndefined keeps a valid value and drops anything else', () => {
		expect(sourceOrUndefined('sdk')).toBe('sdk');
		expect(sourceOrUndefined('Bad Value')).toBeUndefined();
	});
});

describe('recordActivation', () => {
	it('stamps a milestone once: the statement only fills an empty column', async () => {
		query.mockResolvedValueOnce([{ customerId, source: 'sdk' }]);
		expect(await recordActivation(customerId, 'first_did_created')).toBe(true);
		const [sql, parameters] = query.mock.calls[0];
		expect(sql).toContain('ON CONFLICT ("customerId") DO UPDATE');
		expect(sql).toContain('WHERE "customerActivation"."firstDidCreatedAt" IS NULL');
		expect(parameters).toEqual([customerId]);
	});

	it('is a no-op the second time (no row returned) and sends no event', async () => {
		process.env.POSTHOG_API_KEY = 'phc_test';
		query.mockResolvedValueOnce([]);
		expect(await recordActivation(customerId, 'first_credential_issued')).toBe(false);
		expect(capture).not.toHaveBeenCalled();
	});

	it('never throws, whatever the database does', async () => {
		query.mockRejectedValueOnce(new Error('relation "customerActivation" does not exist'));
		await expect(recordActivation(customerId, 'first_agent_registered')).resolves.toBe(false);
		query.mockRejectedValueOnce(new Error('foreign key violation'));
		await expect(recordActivation(customerId, 'first_status_list_created')).resolves.toBe(false);
	});

	it('does nothing without a customer or for an unknown milestone', async () => {
		expect(await recordActivation(undefined, 'first_did_created')).toBe(false);
		expect(await recordActivation(customerId, 'first_payment' as never)).toBe(false);
		expect(query).not.toHaveBeenCalled();
	});

	it('maps each milestone to its own column', () => {
		expect(ACTIVATION_MILESTONES).toEqual({
			first_did_created: 'firstDidCreatedAt',
			first_credential_issued: 'firstCredentialIssuedAt',
			first_agent_registered: 'firstAgentRegisteredAt',
			first_status_list_created: 'firstStatusListCreatedAt',
			first_api_key_created: 'firstApiKeyCreatedAt',
			first_faucet_request: 'firstFaucetRequestAt',
			first_api_call: 'firstApiCallAt',
		});
	});

	describe('U-35 milestones', () => {
		beforeEach(() => resetActivationCacheForTests());

		it.each([
			['first_api_key_created', 'firstApiKeyCreatedAt'],
			['first_faucet_request', 'firstFaucetRequestAt'],
			['first_api_call', 'firstApiCallAt'],
		] as Array<[ActivationMilestone, string]>)('%s only fills an empty %s column', async (milestone, column) => {
			query.mockResolvedValueOnce([{ customerId, source: null }]);
			expect(await recordActivation(customerId, milestone)).toBe(true);
			const [sql] = query.mock.calls[0];
			expect(sql).toContain(`INSERT INTO "customerActivation" ("customerId", "${column}")`);
			expect(sql).toContain(`WHERE "customerActivation"."${column}" IS NULL`);
		});

		it('first_api_call runs one statement per customer per process, then none', async () => {
			query.mockResolvedValueOnce([{ customerId, source: null }]);
			expect(await recordActivation(customerId, 'first_api_call')).toBe(true);
			expect(await recordActivation(customerId, 'first_api_call')).toBe(false);
			expect(await recordActivation(customerId, 'first_api_call')).toBe(false);
			expect(query).toHaveBeenCalledTimes(1);
			// an already-stamped customer is remembered too
			const other = '22222222-2222-4222-8222-222222222222';
			query.mockResolvedValueOnce([]);
			expect(await recordActivation(other, 'first_api_call')).toBe(false);
			expect(await recordActivation(other, 'first_api_call')).toBe(false);
			expect(query).toHaveBeenCalledTimes(2);
		});

		it('first_api_call is not remembered after a database failure, so the next call retries', async () => {
			query.mockRejectedValueOnce(new Error('connection reset'));
			expect(await recordActivation(customerId, 'first_api_call')).toBe(false);
			query.mockResolvedValueOnce([{ customerId, source: null }]);
			expect(await recordActivation(customerId, 'first_api_call')).toBe(true);
			expect(query).toHaveBeenCalledTimes(2);
		});

		it('other milestones are not cached: each call asks the database', async () => {
			query.mockResolvedValue([]);
			await recordActivation(customerId, 'first_api_key_created');
			await recordActivation(customerId, 'first_api_key_created');
			expect(query).toHaveBeenCalledTimes(2);
		});

		it('the new milestones never reach PostHog (not on the allow-list)', async () => {
			process.env.POSTHOG_API_KEY = 'phc_test';
			query.mockResolvedValue([{ customerId, source: 'sdk' }]);
			await recordActivation(customerId, 'first_api_key_created');
			await recordActivation(customerId, 'first_faucet_request');
			await recordActivation(customerId, 'first_api_call');
			expect(capture).not.toHaveBeenCalled();
		});
	});

	it('is driven by tracked operations: DID create, credential issue and status list create', () => {
		expect(activationMilestoneFor('did-create')).toBe('first_did_created');
		expect(activationMilestoneFor('credential-issue')).toBe('first_credential_issued');
		expect(activationMilestoneFor('credential-status-create-encrypted')).toBe('first_status_list_created');
		expect(activationMilestoneFor('credential-status-create-unencrypted')).toBe('first_status_list_created');
		expect(activationMilestoneFor('did-search')).toBeUndefined();
		expect(activationMilestoneFor('credential-verify')).toBeUndefined();
	});
});

describe('PostHog capture', () => {
	it('does nothing at all unless POSTHOG_API_KEY is set', async () => {
		query.mockResolvedValueOnce([{ customerId, source: 'sdk' }]);
		await recordActivation(customerId, 'first_did_created');
		posthog.captureActivationEvent(customerId, 'first_did_created');
		expect(PostHogConstructor).not.toHaveBeenCalled();
		expect(capture).not.toHaveBeenCalled();
	});

	it('sends the milestone with the customer id as distinct id and only the source property', async () => {
		process.env.POSTHOG_API_KEY = 'phc_test';
		query.mockResolvedValueOnce([{ customerId, source: 'agent-quickstart' }]);
		await recordActivation(customerId, 'first_did_created');
		expect(PostHogConstructor).toHaveBeenCalledWith(
			'phc_test',
			expect.objectContaining({ host: 'https://eu.i.posthog.com', flushAt: 1, fetchRetryCount: 0 })
		);
		expect(capture).toHaveBeenCalledWith({
			distinctId: customerId,
			event: 'first_did_created',
			properties: { source: 'agent-quickstart' },
		});
	});

	it('uses POSTHOG_HOST when given', () => {
		process.env.POSTHOG_API_KEY = 'phc_test';
		process.env.POSTHOG_HOST = 'https://eu.example.test';
		posthog.captureActivationEvent(customerId, 'first_agent_registered');
		expect(PostHogConstructor).toHaveBeenCalledWith(
			'phc_test',
			expect.objectContaining({ host: 'https://eu.example.test' })
		);
	});

	it('drops events and properties outside the allow-lists', () => {
		process.env.POSTHOG_API_KEY = 'phc_test';
		posthog.captureActivationEvent(customerId, 'page_view');
		posthog.captureActivationEvent(customerId, 'did_created_for did:cheqd:testnet:abc');
		expect(capture).not.toHaveBeenCalled();
		posthog.captureActivationEvent(customerId, 'first_credential_issued', {
			source: 'sdk',
			email: 'a@b.co',
			name: 'A',
			did: 'did:cheqd:testnet:abc',
			key: 'k',
			claim: { x: 1 },
		});
		expect(capture).toHaveBeenCalledWith({
			distinctId: customerId,
			event: 'first_credential_issued',
			properties: { source: 'sdk' },
		});
	});

	it('never throws, even if the client does', () => {
		process.env.POSTHOG_API_KEY = 'phc_test';
		capture.mockImplementation(() => {
			throw new Error('network down');
		});
		expect(() => posthog.captureActivationEvent(customerId, 'first_did_created')).not.toThrow();
		posthog.resetPostHogForTests();
		PostHogConstructor.mockImplementationOnce(() => {
			throw new Error('bad config');
		});
		expect(() => posthog.captureActivationEvent(customerId, 'first_did_created')).not.toThrow();
	});

	it('returns at once: capture is synchronous queueing, not awaited', () => {
		process.env.POSTHOG_API_KEY = 'phc_test';
		capture.mockImplementation(() => new Promise(() => undefined));
		expect(posthog.captureActivationEvent(customerId, 'first_did_created')).toBeUndefined();
	});
});
