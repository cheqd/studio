/**
 * Gas limit for deactivating a cheqd DID, shared by both engines (U-62).
 *
 * The cheqd SDK sends every deactivation with a fixed gas limit of 360,000 (`DIDModule.gasLimits` and the
 * fixed-fee path of `DIDModule.generateDeactivateDidDocFees`). The ledger's deactivate handler rewrites every stored
 * version of the DID document to mark it deactivated, so the gas it uses grows with the number of versions and with
 * the size of the document. A DID with a few updates and a growing document runs out of gas ("out of gas in location:
 * WriteFlat / ReadPerByte; gasWanted: 360000, gasUsed: 360155").
 *
 * The limit here keeps 360,000 for a DID with one version, which the ledger has always accepted, and adds the cost of
 * reading and rewriting each further version, with a safety multiplier. Only the gas limit changes: the fee amount is
 * still the one the SDK computes for a deactivation, so the fee paid is unchanged. The limit is capped so that the fixed
 * fee still covers it at the fee market's gas price (a deactivation fee of 10 CHEQ covers 1,300,000 gas up to
 * 7,692 ncheq per unit; the SDK's "average" tier is 7,500).
 */

/** The SDK's fixed limit, `DIDModule.gasLimits.DeactivateDidDocGasLimit`. */
export const DEFAULT_DEACTIVATE_GAS_LIMIT = 360_000;
/** Upper bound, so that the unchanged fee still covers the limit at the fee market's gas price. */
export const MAX_DEACTIVATE_GAS_LIMIT = 1_300_000;
/** Headroom over the estimate: the per-version cost below is a model, not a measurement. */
export const DEACTIVATE_GAS_SAFETY_MULTIPLIER = 2;
/** Versions assumed when the ledger cannot say how many there are: errs towards a higher limit. */
export const ASSUMED_VERSIONS_WHEN_UNKNOWN = 8;

// Cosmos SDK default KV store gas costs (store/types/gas.go, KVGasConfig)
const READ_COST_FLAT = 1_000;
const READ_COST_PER_BYTE = 3;
const WRITE_COST_FLAT = 2_000;
const WRITE_COST_PER_BYTE = 30;
const ITER_NEXT_COST_FLAT = 30;
/** Store key, version metadata and protobuf framing around each stored document version. */
const VERSION_OVERHEAD_BYTES = 256;

export interface DeactivationGasInput {
	/** The current DID document. Its JSON size stands in for every version's size (a growing document's latest is the largest). */
	didDocument: unknown;
	/** How many versions the ledger holds for the DID, when known. */
	versionCount?: number;
}

/** The gas limit to send with a deactivation, as the decimal string the SDK's fee options take. */
export function deactivationGasLimit({ didDocument, versionCount }: DeactivationGasInput): string {
	const versions =
		typeof versionCount === 'number' && Number.isInteger(versionCount) && versionCount > 0
			? versionCount
			: ASSUMED_VERSIONS_WHEN_UNKNOWN;
	const bytes = Buffer.byteLength(JSON.stringify(didDocument ?? {}), 'utf8') + VERSION_OVERHEAD_BYTES;
	const perVersion =
		ITER_NEXT_COST_FLAT + READ_COST_FLAT + WRITE_COST_FLAT + (READ_COST_PER_BYTE + WRITE_COST_PER_BYTE) * bytes;
	const estimate = DEFAULT_DEACTIVATE_GAS_LIMIT + (versions - 1) * perVersion * DEACTIVATE_GAS_SAFETY_MULTIPLIER;
	return String(Math.min(MAX_DEACTIVATE_GAS_LIMIT, Math.ceil(estimate)));
}

/**
 * The number of versions in a `<did>/versions` answer, from either the cheqd DID resolver (`contentStream.versions`)
 * or Credo's resolver (`didDocumentMetadata` is the list). Undefined when the answer has neither.
 */
export function countDidVersions(answer: unknown): number | undefined {
	if (!answer || typeof answer !== 'object') return undefined;
	const body = answer as {
		contentStream?: { versions?: unknown };
		versions?: unknown;
		didDocumentMetadata?: unknown;
	};
	const list = body.contentStream?.versions ?? body.versions ?? body.didDocumentMetadata;
	return Array.isArray(list) && list.length > 0 ? list.length : undefined;
}
