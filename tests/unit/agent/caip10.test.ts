import { describe, expect, it } from '@jest/globals';
import { parseCaip10 } from '../../../src/services/agent/caip10.js';

const CHECKSUMMED = '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed'; // EIP-55 test vector

describe('parseCaip10', () => {
	it('lower-cases a valid EVM account and keeps the parts', () => {
		const result = parseCaip10(`eip155:8453:${CHECKSUMMED}`);
		expect(result).toEqual({
			ok: true,
			value: {
				account: `eip155:8453:${CHECKSUMMED.toLowerCase()}`,
				namespace: 'eip155',
				reference: '8453',
				address: CHECKSUMMED.toLowerCase(),
			},
		});
	});

	it('accepts all-lower and all-upper EVM addresses (no checksum to check)', () => {
		expect(parseCaip10(`eip155:1:${CHECKSUMMED.toLowerCase()}`).ok).toBe(true);
		expect(parseCaip10(`eip155:1:0x${CHECKSUMMED.slice(2).toUpperCase()}`).ok).toBe(true);
	});

	it('refuses a mixed-case EVM address with a wrong EIP-55 checksum', () => {
		const wrong = `0x${CHECKSUMMED.slice(2, -1)}D`;
		expect(parseCaip10(`eip155:1:${wrong}`)).toEqual({
			ok: false,
			error: 'eip155 address has an invalid EIP-55 checksum',
		});
	});

	it.each([
		['not a string', 42],
		['empty', ''],
		['two parts', 'eip155:0xabc'],
		['four parts', `eip155:1:${CHECKSUMMED}:x`],
		['upper-case namespace', `EIP155:1:${CHECKSUMMED}`],
		['namespace too short', `ab:1:${CHECKSUMMED}`],
		['namespace too long', `abcdefghi:1:${CHECKSUMMED}`],
		['reference with a space', `eip155:8 453:${CHECKSUMMED}`],
		['reference too long', `eip155:${'1'.repeat(33)}:${CHECKSUMMED}`],
		['leading whitespace', ` eip155:1:${CHECKSUMMED}`],
		['trailing newline', `eip155:1:${CHECKSUMMED}\n`],
		['address with a slash', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:abc/def'],
		['address too long', `other:1:${'a'.repeat(129)}`],
		['EVM chain id with a leading zero', `eip155:08453:${CHECKSUMMED}`],
		['EVM chain id zero', `eip155:0:${CHECKSUMMED}`],
		['EVM chain id not decimal', `eip155:mainnet:${CHECKSUMMED}`],
		['EVM address too short', 'eip155:1:0x1234'],
		['EVM address without 0x', `eip155:1:${CHECKSUMMED.slice(2)}`],
		['EVM address with non-hex', `eip155:1:0x${'g'.repeat(40)}`],
		['total length over the limit', `eip155:${'1'.repeat(32)}:0x${'a'.repeat(200)}`],
	])('refuses %s', (_label, input) => {
		expect(parseCaip10(input).ok).toBe(false);
	});

	it('keeps a non-EVM account exactly as given (case-sensitive chains)', () => {
		const account = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp:7S3P4HxJpyyigGzodYwHtCxZyUQe9JiBMHyRWXArAaKv';
		expect(parseCaip10(account)).toMatchObject({ ok: true, value: { account, namespace: 'solana' } });
	});
});
