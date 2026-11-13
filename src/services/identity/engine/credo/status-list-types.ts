/**
 * Types shared by the status-list engine (`status-lists.ts`) and the Credo-facing adapters
 * (`status-lists-session.ts`, `credo-runtime.ts`). Type-only, so the engine can be unit tested without Credo.
 */

/** Resource metadata as the ledger reports it (the cheqd SDK's `Metadata`), before it is shaped like the resolver's. */
export interface LedgerResourceMetadata {
	id: string;
	collectionId: string;
	name: string;
	version: string;
	resourceType: string;
	mediaType: string;
	created?: Date | string | { seconds?: number | string | bigint; nanos?: number } | null;
	checksum?: string;
	previousVersionId?: string | null;
	nextVersionId?: string | null;
	alsoKnownAs?: { uri: string; description: string }[];
}

export type LedgerResourceRead =
	| { resource: unknown; resourceMetadata: LedgerResourceMetadata; error?: undefined }
	| { error: string; message?: string; resource?: undefined; resourceMetadata?: undefined };

/** The stored bytes of a Token Status List, read from the ledger without any rendering (see spike finding 3). */
export interface RawTokenStatusList {
	format: 'jwt' | 'cwt';
	statusList: string | Uint8Array;
	resourceId: string;
	version: string;
}

export type TokenStatusListAlg = 'ES256' | 'EdDSA';

/** What the engine needs from a customer's Credo tenant beyond creating resources. Signing only; no ledger writes. */
export interface StatusListSession {
	/** The JwtProof2020 JWT a Bitstring list carries. Like the plugin's, it does not cover `encodedList` (#657). */
	signBitstringProof(input: {
		did: string;
		signerDidUrl: string;
		purposes: string[];
		ttl?: number;
		issuanceDate: string;
		expirationDate?: string;
	}): Promise<string>;
	/** A signed, empty Token Status List (`typ` `statuslist+jwt`, `kid` relative to the issuer DID). */
	createTokenStatusList(input: {
		didUrl: string;
		alg: TokenStatusListAlg;
		uri: string;
		bits: 1 | 2 | 4 | 8;
		size: number;
		ttlSeconds?: number;
	}): Promise<string>;
	/** The list `token` with `updates` applied, re-signed by `didUrl`. */
	updateTokenStatusList(input: {
		didUrl: string;
		alg: TokenStatusListAlg;
		token: string;
		updates: { index: number; status: number }[];
	}): Promise<string>;
}
