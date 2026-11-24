import { describe, expect, it } from '@jest/globals';
import { sanitiseEventDetail } from '../../../src/services/agent/agent-event-detail.js';

const DID = 'did:cheqd:testnet:8c3a1f5e-2b7d-4a9e-9c11-5d6f7a8b9c0d';

// Short token-like strings that the first version of the allowlist let through
const secrets: Array<[string, string]> = [
	['a Stripe secret key', 'sk_' + 'live_' + 'x'.repeat(24)],
	['a Stripe test key', 'sk_test_abc12345'],
	['a Stripe publishable key', 'pk_live_51HxyzABCdef'],
	['a GitHub token', 'ghp_16C7e42F292c6912E7710c838347Ae178B4a'],
	['a GitHub fine-grained token', 'github_pat_11ABCDEFG0abcdef'],
	['a Slack token', 'xoxb-123456789012-abcdefABCDEF'],
	['a bearer value', 'Bearer abc.def.ghi'],
	['a bare bearer word', 'bearer'],
	['a basic authorisation value', 'Basic dXNlcjpwYXNz'],
	['a scheme and a token', 'Token 9f8e7d6c'],
	['32 hex characters', 'a3f5c9d17b2e4a6f8c0d1e2f3a4b5c6d'],
	['64 hex characters', 'a3f5c9d17b2e4a6f8c0d1e2f3a4b5c6da3f5c9d17b2e4a6f8c0d1e2f3a4b5c6d'],
	['40 base64 characters', 'dGhpcyBpcyBhIHNlY3JldCB2YWx1ZSBmb3IgdGVzdA=='],
	['base64url of 40 characters', 'dGhpcyBpcyBhIHNlY3JldC12YWx1ZV9mb3J0ZXN0'],
	['a URL with credentials', 'https://user:hunter2@example.com/x'],
	['an email address', 'someone@example.com'],
];

describe('sanitiseEventDetail', () => {
	it.each(secrets)('drops %s', (_name, value) => {
		for (const [type, key] of [
			['key-added', 'keyId'],
			['authority-granted', 'grantType'],
			['card-published', 'version'],
			['authority-expiry-changed', 'to'],
		] as const) {
			expect(sanitiseEventDetail(type, { [key]: value })).toEqual({});
		}
	});

	it('keeps the legitimate values of every allowed field', () => {
		expect(sanitiseEventDetail('key-added', { keyId: 'key-2', keyType: 'Ed25519' })).toEqual({
			keyId: 'key-2',
			keyType: 'Ed25519',
		});
		expect(
			sanitiseEventDetail('key-rotated', { oldKeyId: `${DID}#key-1`, newKeyId: `${DID}#key-3`, keyType: 'ES256' })
		).toEqual({
			oldKeyId: `${DID}#key-1`,
			newKeyId: `${DID}#key-3`,
			keyType: 'ES256',
		});
		expect(
			sanitiseEventDetail('authority-granted', {
				grantId: '5b0d6f0e-8e6b-4f41-9c3c-0d2f6a1b7e11',
				grantType: 'tool-scope',
			})
		).toEqual({ grantId: '5b0d6f0e-8e6b-4f41-9c3c-0d2f6a1b7e11', grantType: 'tool-scope' });
		expect(
			sanitiseEventDetail('authority-expiry-changed', {
				grantId: '5b0d6f0e-8e6b-4f41-9c3c-0d2f6a1b7e11',
				grantType: 'acts-for',
				from: null,
				to: '2027-01-01T00:00:00.000Z',
			})
		).toMatchObject({ grantType: 'acts-for', from: null, to: '2027-01-01T00:00:00.000Z' });
		expect(sanitiseEventDetail('card-updated', { version: 3, published: false })).toEqual({
			version: 3,
			published: false,
		});
		expect(sanitiseEventDetail('card-published', { version: '1.2.0', published: true })).toEqual({
			version: '1.2.0',
			published: true,
		});
	});

	it('keeps a long did:key key id, which is a DID URL and not a secret', () => {
		const didKey =
			'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK#z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
		expect(sanitiseEventDetail('key-added', { keyId: didKey })).toEqual({ keyId: didKey });
	});

	it('still drops fields outside the allowlist, nested values and long tokens', () => {
		expect(sanitiseEventDetail('key-added', { keyId: 'key-2', secret: 'x', keyType: { a: 1 } })).toEqual({
			keyId: 'key-2',
		});
		expect(sanitiseEventDetail('key-added', { keyId: `eyJhbGciOiJFUzI1NiJ9.${'a'.repeat(30)}.sig` })).toEqual({});
	});
});
