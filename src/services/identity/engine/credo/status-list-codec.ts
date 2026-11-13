// @ts-ignore pako 2 ships no type declarations; only `gzip` is used
import { gzip } from 'pako';

/**
 * gzip, then base64url (no multibase prefix): the `encodedList` of the legacy StatusList2021 and Bitstring lists.
 *
 * Deliberately NOT Credo's own `encodeBitstring`. That one deflates with pako 3, and pako 3 does not produce the
 * same bytes as pako 2.1.0, which is what the Veramo plugin (through `@digitalbazaar/bitstring` and
 * `@digitalbazaar/vc-status-list`) uses. The two decode to the same bits, but for any list with entries set the
 * encoded strings differ (measured: a 140,000 entry list with 2,500 entries set is 4,532 characters from pako 2.1.0
 * and 4,406 from pako 3). Gate T4 asks for the next version of an existing list to be byte-identical to what Veramo
 * writes, so the legacy lists are encoded with the same pako, pinned in package.json.
 */
export function encodeLegacyBitstring(bits: Uint8Array): string {
	return Buffer.from(gzip(bits)).toString('base64url');
}
