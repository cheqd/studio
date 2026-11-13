import { describe, it, expect } from '@jest/globals';
import { normalise, Normaliser } from '../lib/normaliser';

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (payload: unknown, sig = 'c2ln') => `${b64({ alg: 'EdDSA', typ: 'JWT' })}.${b64(payload)}.${sig}`;

describe('normaliser: identifiers', () => {
	it('numbers UUIDs by first appearance and keeps equal ids equal', () => {
		const out = normalise({
			a: '11111111-1111-4111-8111-111111111111',
			b: '22222222-2222-4222-8222-222222222222',
			c: '11111111-1111-4111-8111-111111111111',
		});
		expect(out).toEqual({ a: '<uuid:1>', b: '<uuid:2>', c: '<uuid:1>' });
	});

	it('gives the same output for two runs with different random ids', () => {
		const run = (x: string, y: string) =>
			normalise({ did: `did:cheqd:testnet:${x}`, kid: `${y}`, ref: `did:cheqd:testnet:${x}#key-1` });
		expect(run('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).toEqual(
			run('99999999-9999-4999-8999-999999999999', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')
		);
	});

	it('still detects an id that appears where a different one is expected', () => {
		const a = normalise({ x: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', y: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' });
		const b = normalise({ x: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', y: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' });
		expect(a).not.toEqual(b);
	});

	it('normalises short (non-UUID) did:cheqd identifiers', () => {
		expect(normalise('did:cheqd:testnet:5RpEg66jhhbmASWPXJRWrA')).toBe('did:cheqd:testnet:<did-id:1>');
	});

	it('normalises transaction hashes, addresses and keyed hashes', () => {
		const hash = 'A'.repeat(64);
		const out = normalise({
			tx: `0x-prefixed ${hash}`,
			txHash: 'anything',
			addr: 'cheqd1' + 'q'.repeat(38),
		});
		expect(out).toEqual({ tx: '0x-prefixed <hash:1>', txHash: '<hash:2>', addr: '<address:1>' });
	});

	it('numbers per exchange when the same instance is reused, and restarts for a new instance', () => {
		const n = new Normaliser();
		n.normalise('11111111-1111-4111-8111-111111111111');
		expect(n.normalise('22222222-2222-4222-8222-222222222222')).toBe('<uuid:2>');
		expect(new Normaliser().normalise('22222222-2222-4222-8222-222222222222')).toBe('<uuid:1>');
	});
});

describe('normaliser: personal data', () => {
	it('replaces email addresses wherever they appear', () => {
		expect(normalise({ name: 'someone+tag@example.org', note: 'contact a.b@sub.example.com now' })).toEqual({
			name: '<email>',
			note: 'contact <email> now',
		});
	});
});

describe('normaliser: time', () => {
	it('replaces ISO timestamps wherever they appear', () => {
		expect(
			normalise({
				created: '2026-11-13T10:00:00Z',
				updated: '2026-11-13T10:00:00.123+00:00',
				msg: 'expired at 2030-01-01T00:00:00.000Z',
			})
		).toEqual({ created: '<timestamp>', updated: '<timestamp>', msg: 'expired at <timestamp>' });
	});

	it('replaces numeric epoch fields by key but leaves other numbers alone', () => {
		expect(normalise({ iat: 1, exp: 2, nbf: 3, createdAt: 4, updatedAt: 5, total: 6, statusListIndex: 7 })).toEqual(
			{
				iat: '<epoch>',
				exp: '<epoch>',
				nbf: '<epoch>',
				createdAt: '<epoch>',
				updatedAt: '<epoch>',
				total: 6,
				statusListIndex: 7,
			}
		);
	});
});

describe('normaliser: signatures and proofs', () => {
	it('drops signature material but keeps the multibase prefix of proofValue', () => {
		expect(normalise({ proofValue: 'zABC', signature: 'xyz', jws: 'h..s', signatureValue: 'q' })).toEqual({
			proofValue: '<signature:z>',
			signature: '<signature>',
			jws: '<signature>',
			signatureValue: '<signature>',
		});
	});

	it('keeps only the first character of encodedList so the encoding prefix is still checked', () => {
		expect(normalise({ encodedList: 'H4sIAAAA' })).toEqual({ encodedList: '<encodedList:H>' });
		expect(normalise({ encodedList: 'uH4sIAAAA' })).not.toEqual(normalise({ encodedList: 'H4sIAAAA' }));
	});

	it('decodes JWTs, drops the signature and normalises the payload', () => {
		const make = (id: string, sig: string) =>
			jwt({ iat: 1700000000, jti: id, vc: { id: `urn:uuid:${id}`, type: ['VerifiableCredential'] } }, sig);
		const a = normalise({ jwt: make('11111111-1111-4111-8111-111111111111', 'c2lnMQ') });
		const b = normalise({ jwt: make('22222222-2222-4222-8222-222222222222', 'c2lnMg') });
		expect(a).toEqual(b);
		expect(a).toEqual({
			jwt: {
				$jwt: {
					header: { alg: 'EdDSA', typ: 'JWT' },
					payload: {
						iat: '<epoch>',
						jti: '<random>',
						vc: { id: 'urn:uuid:<uuid:1>', type: ['VerifiableCredential'] },
					},
				},
			},
		});
	});

	it('detects a change inside a JWT payload', () => {
		const a = normalise(jwt({ vc: { type: ['A'] } }));
		const b = normalise(jwt({ vc: { type: ['B'] } }));
		expect(a).not.toEqual(b);
	});

	it('reports an undecodable JWT-looking string', () => {
		expect(normalise('eyJ!!.bad.sig')).toBe('eyJ!!.bad.sig'); // not matching the JWT pattern: left alone
		expect(normalise(`eyJhbGciOi.${Buffer.from('not json').toString('base64url')}.c2ln`)).toBe('<jwt:undecodable>');
	});

	it('replaces nonce, challenge and jti', () => {
		expect(normalise({ nonce: 'a', challenge: 'b', jti: 'c' })).toEqual({
			nonce: '<random>',
			challenge: '<random>',
			jti: '<random>',
		});
	});
});

describe('normaliser: pinned values and overrides', () => {
	it('pins known values, longest first', () => {
		const out = normalise(
			{ a: 'did:cheqd:testnet:abc', b: 'https://x/did:cheqd:testnet:abc#key-1' },
			{ knownValues: { DID: 'did:cheqd:testnet:abc' } }
		);
		expect(out).toEqual({ a: '<var:DID>', b: 'https://x/<var:DID>#key-1' });
	});

	it('ignores configured paths with wildcards', () => {
		const out = normalise(
			{
				records: [
					{ n: 1, createdAt: 5 },
					{ n: 2, createdAt: 6 },
				],
				total: 9,
			},
			{ ignorePaths: ['records.*.n', 'total'] }
		);
		expect(out).toEqual({
			records: [
				{ n: '<ignored>', createdAt: '<epoch>' },
				{ n: '<ignored>', createdAt: '<epoch>' },
			],
			total: '<ignored>',
		});
	});

	it('keeps only the type for shape-only paths, so a type change still fails', () => {
		const opts = { shapeOnlyPaths: ['balances'] };
		expect(normalise({ balances: [{ a: 1 }] }, opts)).toEqual({ balances: '<array>' });
		expect(normalise({ balances: 'x' }, opts)).toEqual({ balances: '<string>' });
		expect(normalise({ balances: null }, opts)).toEqual({ balances: '<null>' });
	});
});

describe('normaliser: structure', () => {
	it('sorts object keys but preserves array order', () => {
		expect(JSON.stringify(normalise({ b: 1, a: [3, 1, 2] }))).toBe('{"a":[3,1,2],"b":1}');
	});

	it('maps undefined to null and passes booleans and plain strings through', () => {
		expect(normalise({ a: undefined, b: true, c: 'plain' })).toEqual({ a: null, b: true, c: 'plain' });
	});

	it('is idempotent', () => {
		const once = normalise({ id: '11111111-1111-4111-8111-111111111111', at: '2026-01-01T00:00:00Z' });
		expect(normalise(once)).toEqual(once);
	});
});
