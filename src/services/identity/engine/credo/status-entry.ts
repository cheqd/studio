import type { EngineStatusOptions, EngineStatusResult, JsonObject, JsonValue } from '../types.js';

/**
 * The `credentialStatus` entry for a credential issued with a status list, built the way the Veramo plugin builds it
 * (`IssueCredentialWithBitstringStatusList`, `IssueRevocableCredentialWithStatusList2021`,
 * `IssueSuspendableCredentialWithStatusList2021`), so a credential issued by either engine carries the same entry and
 * either engine can revoke it.
 *
 * The index is not chosen here. Studio reserves it before issuing (`reserveStatusIndex`) and passes it in
 * `statusListIndex`; allocating a second one in the engine would hand out an index twice.
 */

const CREDENTIALS_V1 = 'https://www.w3.org/2018/credentials/v1';
const STATUS_LIST_2021_CONTEXT = 'https://w3id.org/vc/status-list/2021/v1';
const BITSTRING_CONTEXT = 'https://www.w3.org/ns/credentials/status/v1';
const BITSTRING_TYPE = 'BitstringStatusListCredential';
const SL2021_TYPES = { revocation: 'StatusList2021Revocation', suspension: 'StatusList2021Suspension' } as const;
const BITSTRING_ISSUING_PURPOSES = ['refresh', 'message'];
const DEFAULT_BITSTRING_STATUS_SIZE = 2;
const DEFAULT_BITSTRING_STATUS_MESSAGES = [
	{ status: '0x0', message: 'valid' },
	{ status: '0x1', message: 'revoked' },
	{ status: '0x2', message: 'suspended' },
	{ status: '0x3', message: 'unknown' },
];

export type ReadStatusList = (
	did: string,
	name: string,
	listType: string,
	purpose?: 'revocation' | 'suspension'
) => Promise<EngineStatusResult>;

export interface StatusEntryDependencies {
	/** Base of the public resolver, ending in `/identifiers/`. */
	resolverUrl: string;
	readStatusList: ReadStatusList;
}

export interface StatusEntry {
	entry: JsonObject;
	/** Contexts the entry needs in the credential. */
	contexts: string[];
}

export async function buildStatusEntry(
	options: EngineStatusOptions,
	issuer: string,
	dependencies: StatusEntryDependencies
): Promise<StatusEntry> {
	const name = options.statusListName;
	if (typeof name !== 'string' || !name) throw new Error('credentialStatus.statusListName is required');
	const index = Number(options.statusListIndex);
	if (options.statusListIndex === undefined || !Number.isInteger(index) || index < 0) {
		throw new Error('credentialStatus.statusListIndex is required: Studio reserves the index before issuing');
	}

	if (options.statusListType === 'BitstringStatusList') {
		const purpose = String(options.statusPurpose);
		if (!BITSTRING_ISSUING_PURPOSES.includes(purpose)) {
			throw new Error(`statusPurpose while issuance must be one of ${BITSTRING_ISSUING_PURPOSES.join(', ')}`);
		}
		const found = await dependencies.readStatusList(issuer, name, 'BitstringStatusList');
		if (!found.found) throw new Error(`Status list ${name} was not found under ${issuer}`);
		const stored = found.resource as JsonObject | undefined;
		const subject = (stored?.bitstringStatusListCredential as JsonObject | undefined)?.credentialSubject as
			| JsonObject
			| undefined;
		const purposes = ([] as JsonValue[]).concat(subject?.statusPurpose ?? []);
		if (!purposes.includes(purpose)) {
			throw new Error(`statusPurpose must be one of ${purposes.join(', ')}`);
		}
		const metadata = (stored?.metadata ?? {}) as JsonObject;
		if (purpose === 'message' && (!metadata.statusSize || !metadata.statusMessages)) {
			throw new Error('statusMessages and statusSize must be present for statusPurpose="message"');
		}
		const statusListCredential = `${dependencies.resolverUrl}${issuer}?resourceName=${name}&resourceType=${BITSTRING_TYPE}`;
		return {
			entry: {
				id: `${statusListCredential}#${index}`,
				type: 'BitstringStatusListEntry',
				statusPurpose: purpose,
				statusListIndex: `${index}`,
				statusListCredential,
				statusSize: (metadata.statusSize as number | undefined) || DEFAULT_BITSTRING_STATUS_SIZE,
				statusMessage: (metadata.statusMessages as JsonValue | undefined) || DEFAULT_BITSTRING_STATUS_MESSAGES,
			},
			contexts: [CREDENTIALS_V1, BITSTRING_CONTEXT],
		};
	}

	if (options.statusListType === 'StatusList2021') {
		const purpose = options.statusPurpose;
		if (purpose !== 'revocation' && purpose !== 'suspension') {
			throw new Error('statusPurpose must be revocation or suspension for a StatusList2021 credential');
		}
		const statusListCredential = `${dependencies.resolverUrl}${issuer}?resourceName=${name}&resourceType=${SL2021_TYPES[purpose]}`;
		return {
			entry: {
				id: `${statusListCredential}#${index}`,
				type: 'StatusList2021Entry',
				statusPurpose: purpose,
				statusListIndex: `${index}`,
			},
			contexts: [CREDENTIALS_V1, STATUS_LIST_2021_CONTEXT],
		};
	}

	throw new Error(`Unsupported statusListType: ${String(options.statusListType)}`);
}
