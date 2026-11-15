import type { CustomerEntity } from '../../../../database/entities/customer.entity.js';
import type { EngineDidDocument, EngineSignRequest, EngineSigningAlg } from '../types.js';
import { CredoOwnershipError } from './errors.js';
import { publicKeyHexFromVerificationMethod } from './key-material.js';
import type { CredoEngineStore, CredoRuntime } from './ports.js';

/**
 * Signing with a customer's DID keys, shared by `signWithDidKey` and by credential and presentation issuance.
 *
 * No key handling of its own: the private key stays in Studio's key store, behind the Credo KMS adapter
 * (`VeramoKeyManagementStorage`). This file decides *which* key may sign, and refuses unless the customer owns the
 * DID and the key. The adapter reads keys by id with no customer check, so every id passed to `session.sign` must
 * come from `store.findOwnedKey`, which filters on the customer.
 */

/** The JWS algorithm for each Studio key type the agent endpoints sign with. */
const ALG_FOR_KEY_TYPE: Record<string, EngineSigningAlg> = { Secp256r1: 'ES256', Ed25519: 'EdDSA' };
const KEY_TYPE_FOR_ALG: Record<EngineSigningAlg, string> = { ES256: 'Secp256r1', EdDSA: 'Ed25519' };

/** P-256 first: it is the default signing key (keys-and-formats decision D1). */
const ALG_PREFERENCE: EngineSigningAlg[] = ['ES256', 'EdDSA'];

export type VerificationPurpose = 'assertionMethod' | 'authentication';

export interface OwnedSigningKey {
	/** Absolute verification method id, `did#fragment` */
	verificationMethod: string;
	/** The verification method's `type`, for example `JsonWebKey2020` or `Ed25519VerificationKey2020` */
	methodType: string;
	/** The KMS key id: the `kid` of the customer's `key` row */
	kmsKeyId: string;
	alg: EngineSigningAlg;
}

type MethodObject = Record<string, unknown> & { id: string };

function methodsOf(document: EngineDidDocument, purpose?: VerificationPurpose): MethodObject[] {
	const did = document.id;
	const absolute = (id: string) => (id.startsWith('#') ? `${did}${id}` : id);
	const all = ((document.verificationMethod as Record<string, unknown>[] | undefined) ?? []).map((method) => ({
		...method,
		id: absolute(String(method.id)),
	}));
	if (!purpose) return all;

	const entries = (document[purpose] as (string | Record<string, unknown>)[] | undefined) ?? [];
	const found: MethodObject[] = [];
	for (const entry of entries) {
		const id = absolute(typeof entry === 'string' ? entry : String(entry.id));
		const method = typeof entry === 'string' ? all.find((candidate) => candidate.id === id) : { ...entry, id };
		if (method) found.push(method as MethodObject);
	}
	return found;
}

/**
 * The keys of a DID document, for one purpose, that this customer owns and can sign with, best first (ES256, then
 * EdDSA). A method whose key the customer does not hold is simply absent: the caller sees "no key", never whose it is.
 */
export async function ownedSigningKeys(
	store: Pick<CredoEngineStore, 'findOwnedKey'>,
	customerId: string,
	document: EngineDidDocument,
	purpose: VerificationPurpose
): Promise<OwnedSigningKey[]> {
	const keys: OwnedSigningKey[] = [];
	for (const method of methodsOf(document, purpose)) {
		const publicKeyHex = publicKeyHexFromVerificationMethod(method);
		if (!publicKeyHex) continue;
		const owned = await store.findOwnedKey(customerId, { publicKeyHex });
		const alg = owned ? ALG_FOR_KEY_TYPE[owned.type] : undefined;
		if (owned && alg)
			keys.push({ verificationMethod: method.id, methodType: String(method.type), kmsKeyId: owned.kid, alg });
	}
	return keys.sort((a, b) => ALG_PREFERENCE.indexOf(a.alg) - ALG_PREFERENCE.indexOf(b.alg));
}

export class CredoSigner {
	constructor(
		private readonly store: CredoEngineStore,
		private readonly runtime: CredoRuntime,
		private readonly ensureTenant: (customerId: string) => Promise<string>
	) {}

	/** The DID's current document, or an error when it cannot be resolved or is deactivated. */
	async resolveActiveDocument(did: string): Promise<EngineDidDocument> {
		const resolution = await this.runtime.resolveDid(did);
		if (!resolution.didDocument) throw new Error(`Could not resolve ${did}`);
		if (resolution.didDocumentMetadata?.deactivated) throw new Error(`${did} is deactivated and cannot sign`);
		return resolution.didDocument;
	}

	/** Signs `data` with the key behind `kmsKeyId`, which the caller has already proved is the customer's. */
	async signWith(customerId: string, key: Pick<OwnedSigningKey, 'kmsKeyId' | 'alg'>, data: Uint8Array) {
		const tenantId = await this.ensureTenant(customerId);
		return this.runtime.withTenant(tenantId, (session) =>
			session.sign({ keyId: key.kmsKeyId, alg: key.alg, data })
		);
	}

	/**
	 * The raw JWS signature of `request.data` with the key behind `request.kid`: ES256 as 64 bytes `r || s`, EdDSA as
	 * the 64-byte Ed25519 signature. The customer must own the DID and hold the key. A DID that is not theirs, one that
	 * does not exist and a key that is not theirs all fail with the same "not found in wallet" error.
	 */
	async signWithDidKey(request: EngineSignRequest, customer: CustomerEntity): Promise<Uint8Array> {
		const customerId = customer?.customerId;
		if (!customerId) throw new Error('Customer not found');
		if (!(request.alg in KEY_TYPE_FOR_ALG)) throw new Error(`Unsupported signing algorithm '${request.alg}'`);
		if (!request.kid.startsWith(`${request.did}#`)) {
			throw new Error('The key id must be a verification method of the DID that signs');
		}
		if (!(await this.store.isDidOwned(customerId, request.did))) throw new CredoOwnershipError(request.did);

		const document = await this.resolveActiveDocument(request.did);
		const method = methodsOf(document).find((candidate) => candidate.id === request.kid);
		const publicKeyHex = method ? publicKeyHexFromVerificationMethod(method) : null;
		const owned = publicKeyHex ? await this.store.findOwnedKey(customerId, { publicKeyHex }) : null;
		if (!owned) throw new CredoOwnershipError(`Key ${request.kid}`);
		if (owned.type !== KEY_TYPE_FOR_ALG[request.alg]) {
			throw new Error(`The key ${request.kid} is a ${owned.type} key and cannot sign with ${request.alg}`);
		}
		return this.signWith(customerId, { kmsKeyId: owned.kid, alg: request.alg }, request.data);
	}
}
