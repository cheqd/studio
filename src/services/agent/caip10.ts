import jsSha3 from 'js-sha3';

/**
 * CAIP-10 account identifiers: `namespace:reference:address` (for example `eip155:8453:0xAb...`).
 *
 * Syntax is the CAIP-10 grammar, applied strictly (no whitespace, no case folding of the grammar):
 *   namespace  [-a-z0-9]{3,8}
 *   reference  [-_a-zA-Z0-9]{1,32}
 *   address    [-.%a-zA-Z0-9]{1,128}
 * The address is then normalised by the chain's own rules where this module knows them:
 *   - `eip155`: the chain id is a decimal integer without leading zeros, and the address is `0x` and 40 hex
 *     characters. It is stored lower case. An address with mixed case must carry a valid EIP-55 checksum,
 *     otherwise it is refused (a wrong checksum is the usual sign of a mistyped address). All-lower and
 *     all-upper addresses carry no checksum and are accepted.
 *   - other namespaces: kept exactly as given (Solana and others are case-sensitive).
 */

const CAIP10 = /^([-a-z0-9]{3,8}):([-_a-zA-Z0-9]{1,32}):([-.%a-zA-Z0-9]{1,128})$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const DECIMAL = /^(0|[1-9][0-9]*)$/;
/** The longest chain id EIP-155 and CAIP-2 allow in practice; keeps the value inside a safe integer. */
const MAX_EVM_CHAIN_ID = Number.MAX_SAFE_INTEGER;

export interface Caip10Account {
	/** The normalised CAIP-10 string, which is what is stored and signed. */
	account: string;
	namespace: string;
	reference: string;
	address: string;
}

export type Caip10Result = { ok: true; value: Caip10Account } | { ok: false; error: string };

/** EIP-55 mixed-case checksum of a 40-character lower case hex address (without `0x`). */
export function eip55Checksum(lowerHexAddress: string): string {
	const hash = jsSha3.keccak256(lowerHexAddress);
	let out = '';
	for (let i = 0; i < lowerHexAddress.length; i++) {
		const c = lowerHexAddress[i] as string;
		out += parseInt(hash[i] as string, 16) >= 8 ? c.toUpperCase() : c;
	}
	return out;
}

export function parseCaip10(input: unknown): Caip10Result {
	if (typeof input !== 'string' || input.length === 0 || input.length > 175) {
		return { ok: false, error: 'account must be a CAIP-10 string such as eip155:8453:0x...' };
	}
	const match = CAIP10.exec(input);
	if (!match) {
		return { ok: false, error: 'account is not a valid CAIP-10 identifier (namespace:reference:address)' };
	}
	const [, namespace, reference, address] = match as unknown as [string, string, string, string];

	if (namespace === 'eip155') {
		if (!DECIMAL.test(reference) || reference === '0' || Number(reference) > MAX_EVM_CHAIN_ID) {
			return { ok: false, error: 'eip155 chain id must be a positive decimal integer without leading zeros' };
		}
		if (!EVM_ADDRESS.test(address)) {
			return { ok: false, error: 'eip155 address must be 0x followed by 40 hexadecimal characters' };
		}
		const body = address.slice(2);
		const mixed = body !== body.toLowerCase() && body !== body.toUpperCase();
		if (mixed && eip55Checksum(body.toLowerCase()) !== body) {
			return { ok: false, error: 'eip155 address has an invalid EIP-55 checksum' };
		}
		const normalised = `0x${body.toLowerCase()}`;
		return {
			ok: true,
			value: { account: `eip155:${reference}:${normalised}`, namespace, reference, address: normalised },
		};
	}
	return { ok: true, value: { account: input, namespace, reference, address } };
}
