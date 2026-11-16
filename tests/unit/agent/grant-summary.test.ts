import { describe, expect, it } from '@jest/globals';
import { summariseGrant } from '../../../src/services/agent/grant-summary.js';
import type { MandatePolicySummary } from '../../../src/types/agent.js';

const mandate = (change: Partial<MandatePolicySummary> = {}): MandatePolicySummary => ({
	mandateType: 'payment',
	amountRange: null,
	budget: null,
	recurrence: null,
	payees: null,
	executionWindow: null,
	...change,
});

describe('summariseGrant', () => {
	it('summarises acts-for with the DID it acts for', () => {
		expect(summariseGrant({ grantType: 'acts-for', issuerDid: 'did:cheqd:testnet:abc' })).toBe(
			'Acts for did:cheqd:testnet:abc'
		);
		expect(summariseGrant({ grantType: 'acts-for' })).toBe('Acts for your organisation');
	});

	it('lists tools, and says so when there are none on record', () => {
		expect(summariseGrant({ grantType: 'tool-scope', claims: { tools: ['search', 'fetch'] } })).toBe(
			'Tools: search, fetch'
		);
		expect(summariseGrant({ grantType: 'tool-scope' })).toBe('Tool scope');
		expect(summariseGrant({ grantType: 'tool-scope', claims: { tools: [] } })).toBe('Tool scope');
	});

	it('shortens a long tool list', () => {
		const tools = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
		expect(summariseGrant({ grantType: 'tool-scope', claims: { tools } })).toBe('Tools: a, b, c, d, e and 2 more');
	});

	it('states a delegation as single hop', () => {
		expect(summariseGrant({ grantType: 'delegation', claims: { scopes: ['x'] } })).toBe(
			'Delegation (KYA-OS), depth 1'
		);
	});

	it('summarises a mandate: cap in major units, recurrence, payees', () => {
		expect(
			summariseGrant({
				grantType: 'mandate',
				policySummary: mandate({
					amountRange: { currency: 'USD', max: 5000 },
					recurrence: { frequency: 'WEEKLY', maxOccurrences: null },
					payees: ['supplies'],
				}),
			})
		).toBe('Up to 50 USD per week, supplies');
	});

	it('keeps minor-unit remainders, and leaves zero-decimal currencies alone', () => {
		expect(
			summariseGrant({
				grantType: 'mandate',
				policySummary: mandate({ amountRange: { currency: 'USD', max: 1250 } }),
			})
		).toBe('Up to 12.50 USD');
		expect(
			summariseGrant({
				grantType: 'mandate',
				policySummary: mandate({ amountRange: { currency: 'JPY', max: 5000 } }),
			})
		).toBe('Up to 5000 JPY');
	});

	it('uses the budget when there is no per-payment cap, and adds it beside a cap', () => {
		expect(
			summariseGrant({ grantType: 'mandate', policySummary: mandate({ budget: { currency: 'EUR', max: 300 } }) })
		).toBe('Budget 300 EUR');
		expect(
			summariseGrant({
				grantType: 'mandate',
				policySummary: mandate({
					amountRange: { currency: 'USD', max: 2500 },
					budget: { currency: 'USD', max: 120 },
					recurrence: { frequency: 'MONTHLY', maxOccurrences: 6 },
					payees: ['Acme Travel', 'Globex'],
					executionWindow: { notBefore: null, notAfter: '2027-06-01T00:00:00Z' },
				}),
			})
		).toBe('Up to 25 USD per month, budget 120 USD, Acme Travel, Globex, until 2027-06-01T00:00:00Z');
	});

	it('falls back to a plain label for a mandate with no summary', () => {
		expect(summariseGrant({ grantType: 'mandate' })).toBe('Payment mandate');
		expect(summariseGrant({ grantType: 'mandate', policySummary: mandate() })).toBe('Payment mandate');
	});

	it('strips control characters and bounds caller-supplied text', () => {
		const line = summariseGrant({
			grantType: 'tool-scope',
			claims: { tools: ['bad\nname\u0000', 'x'.repeat(500)] },
		});
		expect(line).not.toMatch(/[\u0000-\u001f]/);
		expect(line.length).toBeLessThan(240);
	});

	it('never includes credential material, even if the claims carry it', () => {
		const line = summariseGrant({
			grantType: 'tool-scope',
			claims: { tools: ['search'], cnf: { jwk: { d: 'secret' } }, credential: 'eyJhbGciOi' } as never,
		});
		expect(line).toBe('Tools: search');
	});

	it('answers a generic line for an unknown type', () => {
		expect(summariseGrant({ grantType: 'something-new' })).toBe('Authority grant');
	});
});
