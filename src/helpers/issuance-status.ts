import { StatusListType } from '../types/credential-status.js';

/**
 * The status list type and purpose combinations a credential can be issued with. A Bitstring Status List is issued
 * against with the `refresh` or `message` purposes (as the Veramo plugin and the Credo engine build the entry);
 * `revocation` and `suspension` are StatusList2021 purposes.
 */
const ISSUABLE_PURPOSES: Record<string, readonly string[]> = {
	[StatusListType.Bitstring]: ['refresh', 'message'],
	[StatusListType.StatusList2021]: ['revocation', 'suspension'],
};

/** A message naming why the requested `credentialStatus` cannot be issued with, or undefined when it can. */
export function unsupportedIssuanceStatus(credentialStatus: unknown): string | undefined {
	if (credentialStatus === undefined || credentialStatus === null) return undefined;
	if (typeof credentialStatus !== 'object') return 'credentialStatus must be an object';
	const { statusListType, statusPurpose } = credentialStatus as { statusListType?: unknown; statusPurpose?: unknown };
	if (typeof statusListType !== 'string' || !(statusListType in ISSUABLE_PURPOSES)) return undefined;
	const allowed = ISSUABLE_PURPOSES[statusListType];
	if (typeof statusPurpose === 'string' && allowed.includes(statusPurpose)) return undefined;
	return `credentialStatus: statusPurpose '${String(statusPurpose)}' is not supported for statusListType ${statusListType} at issuance; use one of ${allowed.join(', ')}`;
}
