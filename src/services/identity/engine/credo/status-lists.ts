import { randomUUID } from 'node:crypto';
import {
	createBitstring,
	decodeBitstring,
	expandLegacyStatusIndices,
	getBitstringStatus,
	getTokenStatusListUri,
	parseLegacyStatusListData,
	parseLegacyStatusListUri,
	parseTokenStatusListUri,
	setBitstringStatus,
	tokenStatusListResourceType,
} from '@credo-ts/cheqd';
import type { CustomerEntity } from '../../../../database/entities/customer.entity.js';
import type { SafeFetch } from '../../../../helpers/safe-fetch.js';
import { EngineGoneError } from '../errors.js';
import type {
	EngineResourcePayload,
	EngineSignedInput,
	EngineStatusListOptions,
	EngineStatusResult,
	EngineTokenStatusList,
	EngineTokenStatusListOptions,
	EngineTokenStatusReading,
	EngineTokenStatusUpdate,
	JsonObject,
} from '../types.js';
import { encodeLegacyBitstring as encodeBitstring } from './status-list-codec.js';
import { CredoOwnershipError, NotImplementedByEngineError } from './errors.js';
import type { CredoEngineStore, CredoRuntime } from './ports.js';
import type { LedgerResourceMetadata, TokenStatusListAlg } from './status-list-types.js';
import {
	decodeStatusListToken,
	findSigningMethod,
	publicKeyOf,
	readStatusList,
	statusAt,
	verifySignature,
} from './token-status-list.js';

const ENGINE = 'credo';
const NETWORKS = ['mainnet', 'testnet'];

// What the Veramo plugin writes and enforces. They differ from the fork's own defaults on purpose: existing
// customers' lists and credentials were made with these.
const STATUS_LIST_2021_MIN_LENGTH = 131072;
const BITSTRING_MIN_LENGTH = 131072;
const BITSTRING_DEFAULT_SIZE = 2;
const BITSTRING_CONTEXT_V1 = 'https://www.w3.org/2018/credentials/v1';
const VERAMO_BITSTRING_MESSAGES = [
	{ status: '0x0', message: 'issued' },
	{ status: '0x1', message: 'revoked' },
	{ status: '0x2', message: 'suspended' },
	{ status: '0x3', message: 'unknown' },
];
const SL2021_TYPES = { revocation: 'StatusList2021Revocation', suspension: 'StatusList2021Suspension' } as const;
const BITSTRING_TYPE = 'BitstringStatusListCredential';
const BITSTRING_PURPOSES = ['revocation', 'suspension', 'message', 'refresh'];
const DEFAULT_TSL_SIZE = 131072;
const DEFAULT_TSL_BITS = 2;
const GENERIC_TOKEN_ERROR = 'The status list is unavailable or could not be verified';

// Results carry per-index arrays and an Error, which the engine-neutral `EngineStatusResult` does not describe
type Loose = { [key: string]: any };
type Purpose = keyof typeof SL2021_TYPES;
type Action = 'revoke' | 'suspend' | 'reinstate';
const ACTION_VALUE: Record<Action, number> = { revoke: 1, suspend: 2, reinstate: 0 };

/** Existing encrypted lists are not read, checked or updated by this engine (decisions D2 and G6: no Lit). */
export class EncryptedStatusListNotSupportedError extends NotImplementedByEngineError {
	constructor(method: string) {
		super(ENGINE, method);
		this.message =
			`NotImplementedByEngine: the '${ENGINE}' engine does not support encrypted status lists ` +
			`(${method}). Existing encrypted lists are only readable and updatable on the Veramo engine until ` +
			'access-controlled lists are rebuilt without Lit.';
	}
}

/** Owner of status lists by registry row: counts, never the shape of a result. */
export interface StatusListOwnership {
	/** Number of `statusRegistry` rows for this issuer and list name that belong to a customer other than this one. */
	countClaimedByOthers(customerId: string, did: string, name: string): Promise<number>;
}

export interface StatusListDependencies {
	store: Pick<CredoEngineStore, 'isDidOwned' | 'findPayerAccount'>;
	runtime: CredoRuntime;
	ownership?: StatusListOwnership;
	withPayerLock: <T>(payerAddress: string, work: () => Promise<T>) => Promise<T>;
	ensureTenant: (customerId: string) => Promise<string>;
	safeFetch: SafeFetch;
	/** Base of the public resolver, ending in `/identifiers/`; builds the `uri` of a Token Status List. */
	resolverUrl: string;
	now?: () => Date;
}

interface ParsedList {
	format: 'StatusList2021' | 'BitstringStatusList';
	data: Record<string, any>;
	bits: Uint8Array;
	statusSize: number;
	purposes: string[];
	statusMessages?: { status: string; message: string }[];
	encoding: string;
}

const utf8 = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const resolverTimestamp = (created: LedgerResourceMetadata['created']): string => {
	let date: Date;
	if (created instanceof Date) date = created;
	else if (typeof created === 'string') date = new Date(created);
	else if (created && created.seconds !== undefined) date = new Date(Number(created.seconds) * 1000);
	else date = new Date(0);
	return `${date.toISOString().slice(0, 19)}Z`;
};

/** The resolver's `linkedResourceMetadata` shape, which is what `resourceMetadata` has always been on these routes. */
export function toResolverMetadata(did: string, meta: LedgerResourceMetadata): JsonObject {
	return {
		resourceURI: `${did}/resources/${meta.id}`,
		resourceCollectionId: meta.collectionId,
		resourceId: meta.id,
		resourceName: meta.name,
		resourceType: meta.resourceType,
		mediaType: meta.mediaType,
		resourceVersion: meta.version,
		created: resolverTimestamp(meta.created),
		checksum: meta.checksum ?? null,
		previousVersionId: meta.previousVersionId || null,
		nextVersionId: meta.nextVersionId || null,
		...(meta.alsoKnownAs?.length ? { alsoKnownAs: meta.alsoKnownAs as unknown as JsonObject[] } : {}),
	};
}

function toBase64Url(hexOrB64u: string, from: string): string {
	if (from === 'hex') return Buffer.from(hexOrB64u, 'hex').toString('base64url');
	return hexOrB64u;
}

function encodeList(bits: Uint8Array, encoding: string): string {
	const b64u = encodeBitstring(bits);
	return encoding === 'hex' ? Buffer.from(b64u, 'base64url').toString('hex') : b64u;
}

export class CredoStatusLists {
	private readonly now: () => Date;

	constructor(private readonly deps: StatusListDependencies) {
		this.now = deps.now ?? (() => new Date());
	}

	// ----------------------------------------------------------------------------------- guards

	private customerId(customer: CustomerEntity | undefined): string {
		if (!customer?.customerId) throw new Error('Customer not found');
		return customer.customerId;
	}

	private network(did: string): string {
		const parts = did.split(':');
		if (parts.length !== 4 || parts[0] !== 'did' || parts[1] !== 'cheqd' || !NETWORKS.includes(parts[2])) {
			throw new Error(`'${did}' is not a did:cheqd identifier on mainnet or testnet`);
		}
		return parts[2];
	}

	/** The customer owns the issuer DID, and no other customer has registered a list of that name under it. */
	private async assertOwnsList(customerId: string, did: string, name: string): Promise<void> {
		if (!(await this.deps.store.isDidOwned(customerId, did))) throw new CredoOwnershipError(did);
		if (this.deps.ownership && (await this.deps.ownership.countClaimedByOthers(customerId, did, name)) > 0) {
			throw new CredoOwnershipError(`Status list ${name}`);
		}
	}

	private async payerFor(customerId: string, network: string): Promise<string> {
		const account = await this.deps.store.findPayerAccount(customerId, network);
		if (!account) throw new Error(`No ${network} payment account for this customer, so there is no fee payer`);
		return account.address;
	}

	// ----------------------------------------------------------------------------- ledger reads

	private async readLatest(did: string, name: string, resourceType: string) {
		return this.readByUrl(did, `${did}?resourceName=${encodeURIComponent(name)}&resourceType=${resourceType}`);
	}

	private async readByUrl(did: string, didUrl: string) {
		if (!this.deps.runtime.readResource) throw new NotImplementedByEngineError(ENGINE, 'readResource');
		const result = await this.deps.runtime.readResource(didUrl);
		if (result.error !== undefined) return { found: false as const, error: result.error, message: result.message };
		return {
			found: true as const,
			resource: result.resource,
			meta: result.resourceMetadata,
			metadata: toResolverMetadata(did, result.resourceMetadata),
		};
	}

	/** Parses a stored list. Encrypted lists are refused; a `hex` list is transcoded for the fork's reader. */
	private parse(data: unknown, method: string): ParsedList {
		const record = JSON.parse(JSON.stringify(data)) as Record<string, any>;
		if (record?.metadata?.encrypted === true) throw new EncryptedStatusListNotSupportedError(method);
		const encoding: string = record?.metadata?.encoding ?? 'base64url';
		if (encoding === 'hex' && record.StatusList2021?.encodedList) {
			record.StatusList2021.encodedList = toBase64Url(record.StatusList2021.encodedList, 'hex');
		}
		const parsed = parseLegacyStatusListData(record);
		return {
			format: parsed.format,
			data: JSON.parse(JSON.stringify(data)),
			bits: parsed.bits,
			statusSize: parsed.statusSize,
			purposes: parsed.purposes,
			statusMessages: parsed.statusMessages,
			encoding,
		};
	}

	// ----------------------------------------------------------------------------------- create

	async createUnencryptedStatusList2021(
		did: string,
		resource: EngineResourcePayload,
		options: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult> {
		const customerId = this.customerId(customer);
		const network = this.network(did);
		if (!resource.name) throw new Error('[credo]: status list name is required');
		const purpose = (options.statusPurpose as Purpose | undefined) ?? 'revocation';
		if (!(purpose in SL2021_TYPES)) throw new Error('[credo]: statusPurpose must be one of revocation, suspension');
		const length = options.length as number | undefined;
		if (length !== undefined) {
			if (typeof length !== 'number') throw new Error('[credo]: statusListLength must be number');
			if (length < STATUS_LIST_2021_MIN_LENGTH) {
				throw new Error(
					`[credo]: statusListLength must be greater than or equal to ${STATUS_LIST_2021_MIN_LENGTH} number of entries`
				);
			}
		}
		const encoding = (options.encoding as string | undefined) ?? 'base64url';
		if (encoding !== 'base64url' && encoding !== 'hex') {
			throw new Error('[credo]: statusListEncoding must be base64url or hex');
		}
		await this.assertOwnsList(customerId, did, resource.name);

		const resourceType = SL2021_TYPES[purpose];
		const content = {
			StatusList2021: {
				statusPurpose: purpose,
				encodedList: encodeList(createBitstring(length ?? STATUS_LIST_2021_MIN_LENGTH, 1), encoding),
				validFrom: this.now().toISOString(),
			},
			metadata: { type: resourceType, encrypted: false, encoding },
		};
		const written = await this.write(customerId, did, network, resource, resourceType, content);
		return { created: true, resource: content, resourceMetadata: written, encrypted: false };
	}

	async createUnencryptedBitstringStatusList(
		did: string,
		resource: EngineResourcePayload,
		options: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult> {
		const customerId = this.customerId(customer);
		const network = this.network(did);
		if (!resource.name) throw new Error('[credo]: status list name is required');
		const rawPurpose = (options.statusPurpose as string | string[] | undefined) ?? 'message';
		const purposes = Array.isArray(rawPurpose) ? rawPurpose : [rawPurpose];
		if (purposes.length === 0 || !purposes.every((p) => BITSTRING_PURPOSES.includes(p))) {
			throw new Error(`[credo]: statusPurpose must be in ${BITSTRING_PURPOSES.join(', ')}`);
		}
		const length = options.length as number | undefined;
		if (length !== undefined && (typeof length !== 'number' || length < BITSTRING_MIN_LENGTH)) {
			throw new Error(
				`[credo]: statusListLength must be greater than or equal to ${BITSTRING_MIN_LENGTH} number of entries`
			);
		}
		if (options.encoding !== undefined && options.encoding !== 'base64url') {
			throw new Error('[credo]: statusListEncoding must be base64url');
		}
		const statusSize = (options.size as number | undefined) || 1;
		const entries = length ?? BITSTRING_MIN_LENGTH;
		await this.assertOwnsList(customerId, did, resource.name);

		const signerDidUrl = await this.signerFor(did);
		const tenantId = await this.deps.ensureTenant(customerId);
		const issuanceDate = this.now().toISOString();
		const ttl = options.ttl as number | undefined;
		const jwt = await this.deps.runtime.withTenant(tenantId, (session) => {
			if (!session.statusLists) throw new NotImplementedByEngineError(ENGINE, 'signBitstringProof');
			return session.statusLists.signBitstringProof({
				did,
				signerDidUrl,
				purposes,
				ttl,
				issuanceDate,
			});
		});
		const content = {
			bitstringStatusListCredential: {
				'@context': [BITSTRING_CONTEXT_V1],
				type: ['VerifiableCredential', BITSTRING_TYPE],
				issuer: { id: did },
				issuanceDate,
				credentialSubject: {
					type: 'BitstringStatusList',
					statusPurpose: rawPurpose,
					encodedList: encodeBitstring(createBitstring(entries, statusSize)),
					...(ttl !== undefined ? { ttl } : {}),
				},
				proof: { type: 'JwtProof2020', jwt },
			},
			metadata: {
				encrypted: false,
				encoding: 'base64url',
				length: entries,
				statusSize,
				statusMessages:
					(options.statusMessages as typeof VERAMO_BITSTRING_MESSAGES | undefined) ??
					VERAMO_BITSTRING_MESSAGES,
			},
		};
		const written = await this.write(customerId, did, network, resource, BITSTRING_TYPE, content);
		return { created: true, resource: content, resourceMetadata: written, encrypted: false };
	}

	/** Veramo-compatible and Ed25519 first (the plugin's own validator reads those), else the first usable key. */
	private async signerFor(did: string): Promise<string> {
		const { didDocument } = await this.deps.runtime.resolveDid(did);
		if (!didDocument) throw new Error(`${did} could not be resolved`);
		const doc = didDocument as unknown as Record<string, any>;
		const listed: (string | { id: string })[] = [...(doc.assertionMethod ?? []), ...(doc.authentication ?? [])];
		const ids = listed.map((entry) => (typeof entry === 'string' ? entry : entry.id));
		const methods: { id: string; type?: string; publicKeyJwk?: { crv?: string } }[] = doc.verificationMethod ?? [];
		const usable = ids
			.map((id) => methods.find((m) => m.id === (id.startsWith('#') ? `${did}${id}` : id)))
			.filter((m): m is NonNullable<typeof m> => !!m);
		const isEd = (m: (typeof usable)[number]) => m.type?.startsWith('Ed25519') || m.publicKeyJwk?.crv === 'Ed25519';
		const choice = usable.find(isEd) ?? usable[0];
		if (!choice) throw new Error(`${did} has no authentication or assertion key to sign the status list with`);
		return choice.id;
	}

	/** Publishes one version under the payer lock and returns the resolver-shaped metadata of what was written. */
	private async write(
		customerId: string,
		did: string,
		network: string,
		resource: Pick<EngineResourcePayload, 'name' | 'version' | 'alsoKnownAs'>,
		resourceType: string,
		content: unknown,
		alreadyLocked = false
	): Promise<JsonObject> {
		const id = randomUUID();
		const tenantId = await this.deps.ensureTenant(customerId);
		const publish = () =>
			this.deps.runtime.withTenant(tenantId, (session) =>
				session.createResource(did, {
					id,
					name: resource.name as string,
					resourceType,
					version: (resource.version as string | undefined) ?? this.now().toISOString(),
					alsoKnownAs: resource.alsoKnownAs as { uri: string; description: string }[] | undefined,
					data: utf8(content),
				})
			);
		const result = alreadyLocked
			? await publish()
			: await this.deps.withPayerLock(await this.payerFor(customerId, network), publish);
		if (result.state !== 'finished') {
			throw new Error(`Failed to publish the status list on ${did}: ${result.reason ?? result.state}`);
		}
		const back = await this.readByUrl(did, `${did}/resources/${id}`).catch(() => undefined);
		if (back?.found) return back.metadata;
		return toResolverMetadata(did, {
			id,
			collectionId: did.split(':')[3],
			name: resource.name as string,
			version: (resource.version as string | undefined) ?? this.now().toISOString(),
			resourceType,
			mediaType: 'application/json',
			created: this.now(),
		});
	}

	// ----------------------------------------------------------------------------------- encrypted

	async createEncryptedStatusList2021(): Promise<never> {
		throw new EngineGoneError('Encrypted status lists are no longer available (decision D2/G6)');
	}
	async createEncryptedBitstringStatusList(): Promise<never> {
		throw new EngineGoneError('Encrypted status lists are no longer available (decision D2/G6)');
	}
	async updateEncryptedStatusList(): Promise<never> {
		throw new EncryptedStatusListNotSupportedError('updateEncryptedStatusList');
	}

	// ------------------------------------------------------------------------------------ search

	async searchStatusList(
		did: string,
		name: string,
		listType: string,
		purpose?: 'revocation' | 'suspension'
	): Promise<EngineStatusResult> {
		let resourceType: string;
		if (listType === 'BitstringStatusList') resourceType = BITSTRING_TYPE;
		else {
			if (!purpose) throw new Error('Status Purpose is required');
			resourceType = SL2021_TYPES[purpose];
		}
		try {
			const found = await this.readLatest(did, name, resourceType);
			if (!found.found) return { found: false, error: 'notFound' };
			// The stored list as is. An encrypted list is returned as ciphertext so callers can say it is encrypted.
			return { found: true, resource: found.resource as JsonObject, resourceMetadata: found.metadata };
		} catch (error) {
			if (error instanceof NotImplementedByEngineError) throw error;
			return { found: false, error: String(error) };
		}
	}

	// ------------------------------------------------------------------------------------ update

	async updateUnencryptedStatusList(
		did: string,
		listType: string,
		options: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult> {
		const action = (['reinstate', 'revoke', 'suspend'] as const).find(
			(a) => ACTION_VALUE[a] === options.statusAction
		);
		const name = options.statusListName as string;
		const indices = options.indices as number[];
		if (!name) throw new Error('[credo]: updateOptions.statusListName is required');
		if (!Array.isArray(indices)) throw new Error('[credo]: statusListIndices is required and must be an array');

		if (listType === 'BitstringStatusList') {
			const value = options.statusAction as number;
			return this.updateBitstring(
				did,
				name,
				indices.map((index) => ({ index, value })),
				true,
				customer
			);
		}
		if (!action) throw new Error('Status Action not supported');
		const purpose: Purpose = action === 'revoke' ? 'revocation' : 'suspension';
		return this.updateStatusList2021(did, name, purpose, action, indices, true, customer);
	}

	private async updateStatusList2021(
		did: string,
		name: string,
		purpose: Purpose,
		action: Action,
		indices: number[],
		publish: boolean,
		customer: CustomerEntity
	): Promise<Loose> {
		const customerId = this.customerId(customer);
		const network = this.network(did);
		await this.assertOwnsList(customerId, did, name);
		const resourceType = SL2021_TYPES[purpose];
		const key = { revoke: 'revoked', suspend: 'suspended', reinstate: 'unsuspended' }[action];

		const run = async (): Promise<Loose> => {
			const found = await this.readLatest(did, name, resourceType);
			if (!found.found) return { [key]: [], error: new Error(`status list '${name}' not found`) };
			const list = this.parse(found.resource, 'updateUnencryptedStatusList');
			if (list.format !== 'StatusList2021') {
				return { [key]: [], error: new Error(`'${name}' is not a StatusList2021 list`) };
			}
			try {
				for (const index of indices) setBitstringStatus(list.bits, index, 1, action === 'reinstate' ? 0 : 1);
			} catch (error) {
				return { [key]: [], error: error as Error };
			}
			// Rebuilt in the order and with the fields the plugin writes on every update, so the bytes match its own
			const sl = list.data.StatusList2021;
			const content = {
				StatusList2021: {
					statusPurpose: sl.statusPurpose,
					encodedList: encodeList(list.bits, list.encoding),
					validFrom: sl.validFrom,
					validUntil: sl.validUntil,
				},
				metadata: { type: list.data.metadata?.type ?? resourceType, encoding: list.encoding, encrypted: false },
			};
			const result: Loose = { [key]: indices.map(() => true) };
			if (publish) {
				result.resourceMetadata = await this.write(
					customerId,
					did,
					network,
					{ name },
					resourceType,
					content,
					true
				);
				result.published = true;
			}
			result.statusList = JSON.parse(JSON.stringify(content));
			return result;
		};
		return publish ? this.deps.withPayerLock(await this.payerFor(customerId, network), run) : run();
	}

	private async updateBitstring(
		did: string,
		name: string,
		updates: { index: number; value: number }[],
		publish: boolean,
		customer: CustomerEntity
	): Promise<Loose> {
		const customerId = this.customerId(customer);
		const network = this.network(did);
		await this.assertOwnsList(customerId, did, name);

		const run = async (): Promise<Loose> => {
			const failed = (message: string, error?: Error) => ({
				updated: updates.map(() => false),
				statusValues: updates.map(() => 3),
				statusMessages: updates.map(() => message),
				error: error ?? new Error(message),
			});
			const found = await this.readLatest(did, name, BITSTRING_TYPE);
			if (!found.found) return failed('update failed', new Error(`status list '${name}' not found`));
			const list = this.parse(found.resource, 'updateUnencryptedStatusList');
			if (list.format !== 'BitstringStatusList') return failed('update failed');
			const meta = list.data.metadata ?? {};
			const statusSize: number = meta.statusSize || BITSTRING_DEFAULT_SIZE;
			const max = 2 ** statusSize - 1;
			for (const { value } of updates) {
				if (typeof value !== 'number' || value < 0 || value > max) {
					throw new Error(`[credo]: newStatus must be 0-${max} (valid/revoked/suspended/unknown)`);
				}
			}
			const messageOf = (value: number) =>
				meta.statusMessages?.find((m: { status: string }) => Number.parseInt(m.status, 16) === value)
					?.message ?? 'unknown';

			const results: {
				updated: boolean;
				statusValue: number;
				previousStatusValue?: number;
				statusMessage: string;
			}[] = [];
			try {
				for (const { index, value } of updates) {
					const current = getBitstringStatus(list.bits, index, statusSize);
					if (current === value) {
						results.push({ updated: false, statusValue: current, statusMessage: messageOf(current) });
					} else {
						setBitstringStatus(list.bits, index, statusSize, value);
						results.push({
							updated: true,
							statusValue: value,
							previousStatusValue: current,
							statusMessage: messageOf(value),
						});
					}
				}
			} catch (error) {
				return failed('update failed', error as Error);
			}
			const summary: Loose = {
				updated: results.map((r) => r.updated),
				statusValues: results.map((r) => r.statusValue),
				previousStatusValues: results.map((r) => r.previousStatusValue).filter((v) => v !== undefined),
				statusMessages: results.map((r) => r.statusMessage),
			};
			// Nothing changed: nothing is written, as the plugin does
			if (!results.some((r) => r.updated)) return summary;

			const subject = list.data.bitstringStatusListCredential;
			const content = {
				bitstringStatusListCredential: {
					...subject,
					credentialSubject: { ...subject.credentialSubject, encodedList: encodeBitstring(list.bits) },
				},
				metadata: list.data.metadata,
			};
			if (publish) {
				summary.resourceMetadata = await this.write(
					customerId,
					did,
					network,
					{ name },
					BITSTRING_TYPE,
					content,
					true
				);
				summary.published = true;
			}
			summary.statusList = JSON.parse(JSON.stringify(content));
			return summary;
		};
		return publish ? this.deps.withPayerLock(await this.payerFor(customerId, network), run) : run();
	}

	// -------------------------------------------------------------------------------------- check

	async checkStatusList2021(
		did: string,
		options: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult> {
		const customerId = this.customerId(customer);
		// As on the Veramo path: the DID must be the caller's
		if (!(await this.deps.store.isDidOwned(customerId, did))) throw new CredoOwnershipError(did);
		const purpose = options.statusPurpose as Purpose | undefined;
		if (!options.statusListName) throw new Error('[credo]: check status: statusListName is required');
		if (!purpose || !(purpose in SL2021_TYPES)) throw new Error('[credo]: check status: statusPurpose is required');
		if (
			options.statusListIndex === undefined ||
			options.statusListIndex === null ||
			options.statusListIndex === ''
		) {
			throw new Error('[credo]: check status: statusListIndex is required');
		}
		const found = await this.readLatest(did, options.statusListName as string, SL2021_TYPES[purpose]);
		if (!found.found) throw new Error(`[credo]: status list '${options.statusListName}' not found`);
		const list = this.parse(found.resource, 'checkStatusList2021');
		const set = getBitstringStatus(list.bits, Number(options.statusListIndex), 1) === 1;
		return purpose === 'revocation' ? { revoked: set } : { suspended: set };
	}

	async checkBitstringStatusList(
		_did: string,
		entry: EngineStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineStatusResult | EngineStatusResult[]> {
		this.customerId(customer);
		const url = entry.statusListCredential as string | undefined;
		if (!url) throw new Error('[credo]: STATUS_RETRIEVAL_ERROR');
		const list = await this.fetchBitstringList(url);

		const purpose = entry.statusPurpose as string;
		if (!list.purposes.includes(purpose)) {
			throw new Error(
				"[credo]: STATUS_VERIFICATION_ERROR 'statusPurpose' does not match Bitstring Status List 'statusPurpose'"
			);
		}
		const statusSize = (entry.statusSize as number | undefined) ?? list.statusSize;
		if (Math.floor((list.bits.length * 8) / statusSize) < BITSTRING_MIN_LENGTH) {
			throw new Error('[credo]: STATUS_LIST_LENGTH_ERROR');
		}
		const messages = entry.statusMessage as { status: string; message: string }[] | undefined;
		const read = (index: number) => {
			const status = getBitstringStatus(list.bits, index, statusSize);
			const result: Loose = { status, purpose, valid: status === 0 };
			if (purpose === 'message' && Array.isArray(messages)) {
				const found = messages.find((m) => m.status === `0x${status.toString(16)}`);
				if (found) result.message = found.message;
			}
			return result;
		};

		const indices = entry.statusListIndices as (string | number)[] | undefined;
		const hasMany =
			(Array.isArray(indices) && indices.length > 0) ||
			typeof entry.statusListRangeStart === 'number' ||
			typeof entry.statusListRangeEnd === 'number';
		if (hasMany) {
			const wanted = expandLegacyStatusIndices({
				statusListIndices: indices,
				statusListRangeStart: entry.statusListRangeStart as number | undefined,
				statusListRangeEnd: entry.statusListRangeEnd as number | undefined,
			}).sort((a, b) => a - b);
			return wanted.map((index) => {
				try {
					return { ...read(index), index };
				} catch {
					return {
						status: -1,
						purpose,
						valid: false,
						index,
						error: '[credo]: RANGE_ERROR - Index out of bounds',
					};
				}
			});
		}
		try {
			return read(Number.parseInt(String(entry.statusListIndex), 10));
		} catch {
			throw new Error('[credo]: RANGE_ERROR');
		}
	}

	/**
	 * A Bitstring list named by a credential: a did:cheqd list is read from the ledger, anything else is fetched through
	 * the shared internal-destination block (decision D20). Accepts Studio's envelope and a bare W3C list credential.
	 */
	private async fetchBitstringList(url: string): Promise<ParsedList> {
		const parsed = parseLegacyStatusListUri(url);
		if (parsed) {
			const found =
				'resourceId' in parsed
					? await this.readByUrl(parsed.did, `${parsed.did}/resources/${parsed.resourceId}`)
					: await this.readLatest(parsed.did, parsed.name, parsed.resourceType);
			if (!found.found) throw new Error('[credo]: STATUS_RETRIEVAL_ERROR');
			return this.parse(found.resource, 'checkBitstringStatusList');
		}
		let body: unknown;
		try {
			const response = await this.deps.safeFetch(url, { headers: { accept: 'application/json' } });
			body = JSON.parse(new TextDecoder().decode(response.body));
		} catch {
			throw new Error('[credo]: STATUS_RETRIEVAL_ERROR');
		}
		const record = body as Record<string, any>;
		if (record?.bitstringStatusListCredential) return this.parse(record, 'checkBitstringStatusList');
		const subject = record?.credentialSubject;
		if (subject?.encodedList) {
			const purposes = Array.isArray(subject.statusPurpose) ? subject.statusPurpose : [subject.statusPurpose];
			try {
				return {
					format: 'BitstringStatusList',
					data: record,
					bits: decodeBitstring(subject.encodedList),
					statusSize: 1,
					purposes,
					encoding: 'base64url',
				};
			} catch {
				throw new Error('[credo]: STATUS_RETRIEVAL_ERROR');
			}
		}
		throw new Error('[credo]: STATUS_RETRIEVAL_ERROR');
	}

	// ------------------------------------------------------------- revoke, suspend, reinstate

	revokeCredentials(
		credential: EngineSignedInput | EngineSignedInput[],
		listType: string,
		publish: boolean,
		customer: CustomerEntity,
		symmetricKey: string
	) {
		return this.byCredential('revoke', credential, listType, publish, customer, symmetricKey);
	}
	suspendCredentials(
		credential: EngineSignedInput | EngineSignedInput[],
		listType: string,
		publish: boolean,
		customer: CustomerEntity,
		symmetricKey: string
	) {
		return this.byCredential('suspend', credential, listType, publish, customer, symmetricKey);
	}
	reinstateCredentials(
		credential: EngineSignedInput | EngineSignedInput[],
		listType: string,
		publish: boolean,
		customer: CustomerEntity,
		symmetricKey: string
	) {
		return this.byCredential('reinstate', credential, listType, publish, customer, symmetricKey);
	}

	private decode(credential: EngineSignedInput): { issuer: string; entries: Record<string, any>[] } {
		let body: Record<string, any>;
		if (typeof credential === 'string') {
			const payload = decodeStatusListToken(credential).payload as Record<string, any>;
			if (!payload.vc) throw new Error('[credo]: decode jwt: payload.vc is required');
			body = { ...payload.vc, issuer: payload.iss };
		} else body = credential as Record<string, any>;
		const issuer = typeof body.issuer === 'string' ? body.issuer : body.issuer?.id;
		const status = body.credentialStatus;
		const entries = (Array.isArray(status) ? status : status ? [status] : []) as Record<string, any>[];
		return { issuer, entries };
	}

	private async byCredential(
		action: Action,
		input: EngineSignedInput | EngineSignedInput[],
		listType: string,
		publish: boolean,
		customer: CustomerEntity,
		symmetricKey: string
	): Promise<Loose> {
		const customerId = this.customerId(customer);
		if (symmetricKey) throw new EncryptedStatusListNotSupportedError(`${action}Credentials`);
		const many = Array.isArray(input);
		const credentials = (many ? input : [input]).map((c) => this.decode(c));
		if (credentials.length === 0) throw new Error('[credo]: No credentials provided');
		const issuer = credentials[0].issuer;
		if (!credentials.every((c) => c.issuer === issuer))
			throw new Error('[credo]: Credentials must be issued by the same issuer');
		// As on the Veramo path: the issuer DID must be the caller's, whatever the credential claims
		if (!(await this.deps.store.isDidOwned(customerId, issuer))) throw new CredoOwnershipError(issuer);

		const bitstring = listType === 'BitstringStatusList';
		const wantedType = bitstring ? 'BitstringStatusListEntry' : 'StatusList2021Entry';
		const wantedPurpose = action === 'revoke' ? 'revocation' : 'suspension';
		const picked = credentials.map(({ entries }) => {
			const entry = entries.find(
				(e) => e.type === wantedType && (bitstring || e.statusPurpose === wantedPurpose)
			);
			if (!entry)
				throw new Error(
					`[credo]: the credential has no ${wantedType}${bitstring ? '' : ` for ${wantedPurpose}`}`
				);
			return entry;
		});
		const urls = new Set(picked.map((e) => (e.statusListCredential ?? String(e.id).split('#')[0]) as string));
		if (urls.size !== 1) throw new Error('[credo]: Credentials must belong to the same status list');
		const target = parseLegacyStatusListUri([...urls][0]);
		if (!target) throw new Error('[credo]: only did:cheqd status lists can be updated');
		// Only the issuer can write to a list under its own DID; a list elsewhere is refused outright
		if (target.did !== issuer) throw new CredoOwnershipError(target.did);
		let name: string;
		let resourceType: string;
		if ('resourceId' in target) {
			const byId = await this.readByUrl(target.did, `${target.did}/resources/${target.resourceId}`);
			if (!byId.found) throw new Error('[credo]: status list not found');
			name = byId.meta.name;
			resourceType = byId.meta.resourceType;
		} else ({ name, resourceType } = target);

		const expectedType = bitstring ? BITSTRING_TYPE : SL2021_TYPES[wantedPurpose];
		if (resourceType !== expectedType)
			throw new Error('[credo]: the credential names a list of the wrong type for this action');

		const indices = picked.map((e) => Number.parseInt(String(e.statusListIndex), 10));
		if (new Set(indices).size !== indices.length)
			throw new Error('[credo]: Credentials must have unique status list index');

		if (bitstring) {
			const value = ACTION_VALUE[action];
			const result = await this.updateBitstring(
				issuer,
				name,
				indices.map((index) => ({ index, value })),
				publish,
				customer
			);
			if (many || result.error) return result;
			return {
				...result,
				updated: (result.updated as boolean[])[0],
				statusValue: (result.statusValues as number[])[0],
				previousStatusValue: (result.previousStatusValues as number[])[0],
				statusMessage: (result.statusMessages as string[])[0],
				statusValues: undefined,
				previousStatusValues: undefined,
				statusMessages: undefined,
			};
		}
		const purpose: Purpose = wantedPurpose;
		// The plugin publishes a bulk StatusList2021 revocation whatever `publish` says; kept for compatibility
		const result = await this.updateStatusList2021(
			issuer,
			name,
			purpose,
			action,
			indices,
			action === 'revoke' && many ? true : publish,
			customer
		);
		const key = { revoke: 'revoked', suspend: 'suspended', reinstate: 'unsuspended' }[action];
		return many || result.error ? result : { ...result, [key]: (result[key] as boolean[])[0] };
	}

	// ----------------------------------------------------------------------------- token status list

	async createTokenStatusList(
		did: string,
		options: EngineTokenStatusListOptions,
		customer: CustomerEntity
	): Promise<EngineTokenStatusList> {
		const customerId = this.customerId(customer);
		const network = this.network(did);
		if (!options.name) throw new Error('A Token Status List needs a name');
		const bits = options.bits ?? DEFAULT_TSL_BITS;
		const size = options.size ?? DEFAULT_TSL_SIZE;
		if (![1, 2, 4, 8].includes(bits)) throw new Error('bits must be 1, 2, 4 or 8');
		if (!Number.isInteger(size) || size <= 0) throw new Error('size must be a positive integer');
		await this.assertOwnsList(customerId, did, options.name);
		if (!this.deps.runtime.readTokenStatusList)
			throw new NotImplementedByEngineError(ENGINE, 'readTokenStatusList');
		// A second list of the same name would be a new version of the first and wipe its statuses
		if (await this.deps.runtime.readTokenStatusList(did, options.name).catch(() => null)) {
			throw new Error(`A Token Status List named '${options.name}' already exists under ${did}`);
		}

		const { didUrl, alg } = await this.tokenSigner(did);
		const uri = getTokenStatusListUri({ did, name: options.name, resolverUrl: this.deps.resolverUrl });
		const tenantId = await this.deps.ensureTenant(customerId);
		const payer = await this.payerFor(customerId, network);
		const resourceId = randomUUID();
		await this.deps.withPayerLock(payer, () =>
			this.deps.runtime.withTenant(tenantId, async (session) => {
				if (!session.statusLists) throw new NotImplementedByEngineError(ENGINE, 'createTokenStatusList');
				const jwt = await session.statusLists.createTokenStatusList({
					didUrl,
					alg,
					uri,
					bits,
					size,
					ttlSeconds: options.ttlSeconds,
				});
				// Bytes, not a string: a string is read as base64 by the resource registrar (spike finding 1)
				const result = await session.createResource(did, {
					id: resourceId,
					name: options.name,
					resourceType: tokenStatusListResourceType,
					version: this.now().toISOString(),
					data: new TextEncoder().encode(jwt),
				});
				if (result.state !== 'finished')
					throw new Error(`Failed to publish the Token Status List: ${result.reason ?? result.state}`);
			})
		);
		return { uri, name: options.name, bits, size, resourceId };
	}

	async setTokenStatus(
		did: string,
		listUri: string,
		updates: EngineTokenStatusUpdate[],
		customer: CustomerEntity
	): Promise<void> {
		const customerId = this.customerId(customer);
		const network = this.network(did);
		const parsed = parseTokenStatusListUri(listUri);
		if (!parsed || parsed.did !== did) throw new CredoOwnershipError(`Status list ${listUri}`);
		await this.assertOwnsList(customerId, did, parsed.name);
		if (!this.deps.runtime.readTokenStatusList)
			throw new NotImplementedByEngineError(ENGINE, 'readTokenStatusList');
		const { didUrl, alg } = await this.tokenSigner(did);
		const tenantId = await this.deps.ensureTenant(customerId);
		const payer = await this.payerFor(customerId, network);
		const read = this.deps.runtime.readTokenStatusList.bind(this.deps.runtime);

		// Read, change and write inside the payer lock, so two updates to one list cannot overwrite each other
		await this.deps.withPayerLock(payer, async () => {
			const current = await read(did, parsed.name);
			if (!current || current.format !== 'jwt') throw new Error(`Token Status List ${listUri} not found`);
			const token = current.statusList as string;
			const { bits } = readStatusList(decodeStatusListToken(token).payload);
			for (const { index, status } of updates) {
				if (!Number.isInteger(status) || status < 0 || status >= 2 ** bits)
					throw new Error(`Status ${status} does not fit in ${bits} bit(s)`);
				if (!Number.isInteger(index) || index < 0) throw new Error(`Invalid index ${index}`);
			}
			await this.deps.runtime.withTenant(tenantId, async (session) => {
				if (!session.statusLists) throw new NotImplementedByEngineError(ENGINE, 'updateTokenStatusList');
				const jwt = await session.statusLists.updateTokenStatusList({ didUrl, alg, token, updates });
				const result = await session.createResource(did, {
					id: randomUUID(),
					name: parsed.name,
					resourceType: tokenStatusListResourceType,
					version: this.now().toISOString(),
					data: new TextEncoder().encode(jwt),
				});
				if (result.state !== 'finished')
					throw new Error(`Failed to publish the Token Status List: ${result.reason ?? result.state}`);
			});
		});
	}

	/** Never throws: a list that cannot be fetched or verified is `verified: false` and the verifier must fail closed. */
	async getTokenStatus(listUri: string, index: number): Promise<EngineTokenStatusReading> {
		const unverified: EngineTokenStatusReading = { status: -1, verified: false, error: GENERIC_TOKEN_ERROR };
		try {
			const cheqd = parseTokenStatusListUri(listUri);
			let jwt: string;
			if (cheqd) {
				const raw = await this.deps.runtime.readTokenStatusList?.(cheqd.did, cheqd.name);
				if (!raw || raw.format !== 'jwt') return unverified;
				jwt = raw.statusList as string;
			} else {
				const response = await this.deps.safeFetch(listUri, {
					headers: { accept: 'application/statuslist+jwt' },
				});
				jwt = new TextDecoder().decode(response.body).trim();
			}

			const token = decodeStatusListToken(jwt);
			if (token.header.typ !== 'statuslist+jwt') return unverified;
			const issuer = token.payload.iss;
			// Only did:cheqd issuers can be checked here; other signers (x5c, did:web, jwk) fail closed
			if (!issuer?.startsWith('did:cheqd:')) return unverified;
			if (cheqd && issuer !== cheqd.did) return unverified;
			const subject = token.payload.sub;
			const subjectParsed = subject ? parseTokenStatusListUri(subject) : null;
			if (
				cheqd
					? !(subjectParsed && subjectParsed.did === cheqd.did && subjectParsed.name === cheqd.name)
					: subject !== listUri
			) {
				return unverified;
			}
			if (typeof token.payload.exp === 'number' && token.payload.exp * 1000 < this.now().getTime())
				return unverified;

			const { didDocument, didDocumentMetadata } = await this.deps.runtime.resolveDid(issuer);
			if (!didDocument || didDocumentMetadata?.deactivated) return unverified;
			const method = findSigningMethod(didDocument as never, issuer, token.header.kid);
			const key = method ? publicKeyOf(method) : null;
			if (!key || !verifySignature(token, key)) return unverified;

			return { status: statusAt(readStatusList(token.payload), index), verified: true };
		} catch {
			return unverified;
		}
	}

	/** The signing key of a DID for Token Status Lists: its first assertion or authentication key. */
	private async tokenSigner(did: string): Promise<{ didUrl: string; alg: TokenStatusListAlg }> {
		const { didDocument } = await this.deps.runtime.resolveDid(did);
		if (!didDocument) throw new Error(`${did} could not be resolved`);
		const doc = didDocument as unknown as Record<string, any>;
		const listed: (string | { id: string })[] = [...(doc.assertionMethod ?? []), ...(doc.authentication ?? [])];
		for (const entry of listed) {
			const id = typeof entry === 'string' ? entry : entry.id;
			const absoluteId = id.startsWith('#') ? `${did}${id}` : id;
			const method = (doc.verificationMethod ?? []).find((m: { id: string }) => m.id === absoluteId);
			const crv = method?.publicKeyJwk?.crv;
			if (crv === 'P-256') return { didUrl: absoluteId, alg: 'ES256' };
			if (crv === 'Ed25519' || method?.type?.startsWith('Ed25519')) return { didUrl: absoluteId, alg: 'EdDSA' };
		}
		throw new Error(`${did} has no P-256 or Ed25519 key to sign a Token Status List with`);
	}
}
