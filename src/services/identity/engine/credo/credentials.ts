import { createHash } from 'node:crypto';
import type { CustomerEntity } from '../../../../database/entities/customer.entity.js';
import type {
	CredentialRequest,
	ListCredentialRequestOptions,
	ListCredentialResponse,
} from '../../../../types/credential.js';
import type {
	EngineCredential,
	EngineCredentialPayload,
	EnginePresentation,
	EnginePresentationPayload,
	EngineSignedInput,
	EngineStatusOptions,
	EngineVerificationOptions,
	EngineVerificationResult,
	JsonObject,
	JsonValue,
} from '../types.js';
import type { CredoVerification, LegacyStatusOutcome } from './credential-ports.js';
import { CredoNotSupportedError, CredoOwnershipError, NotImplementedByEngineError } from './errors.js';
import {
	assembleJwt,
	compactJwtOf,
	credentialToJwtPayload,
	decodeJwt,
	issuerId,
	JWT_PROOF_TYPE,
	jwtHeader,
	jwtToCredential,
	jwtToPresentation,
	normaliseCredentialPayload,
	presentationToJwtPayload,
	signingInput,
} from './jwt-vc.js';
import type { CredoEngineStore, CredoRuntime } from './ports.js';
import { type CredoSigner, ownedSigningKeys, type OwnedSigningKey } from './signing.js';

/**
 * Credentials, presentations and stored credentials for the Credo engine.
 *
 * Formats: JWT credentials (`jwt`, with P-256 / ES256 or Ed25519 / EdDSA keys) and JSON-LD credentials (`jsonld`,
 * for DIDs the Credo engine created). `sd-jwt-vc` and `anoncreds` answer NotSupported by name: SD-JWT VCs are issued
 * by the agent endpoints through `signWithDidKey`, not through this method.
 *
 * Where each rule lives:
 * - Ownership: issuing needs the issuer DID, presenting needs the holder DID, signing needs the key, each checked
 *   against the customer's rows by count or filtered single row. A DID that is another customer's and one that does
 *   not exist fail identically (`<did> not found in wallet`).
 * - Keys: signing goes through the KMS adapter over Studio's key store (`session.sign`). Credo's own JWT signer is not
 *   used, because it only signs for DIDs in the tenant's own DID records; this way a DID Veramo created signs too.
 *
 * CREDENTIAL PERSISTENCE (data model DM-3, tenancy CT-3): Studio keeps its own `issuedCredential` index and nothing
 * else about an issued credential. Issuing here signs and returns; it writes nothing to Credo (no Askar record,
 * nothing in a Credo credential repository), so there is no issued-credential copy in Credo to lose, leak or migrate.
 * The caller records the `issuedCredential` row. `saveCredential`, `retrieveCredential` and `deleteCredential` are the
 * separate, explicit holder store: a credential a customer chooses to keep goes into that customer's own Credo tenant
 * (Askar profile), under its content hash, and nowhere else.
 *
 * Status: `verifyStatus` runs the two-step check the fork needs for JWT credentials with a status entry. Credo's own
 * verification throws for them, so it runs with `verifyCredentialStatus: false` and the entries of StatusList2021 and
 * Bitstring credentials are read separately. A status that cannot be read fails verification (it never passes
 * silently); a status type this engine cannot read verifies the credential and says so in `warnings`.
 */

const LEGACY_STATUS_TYPES = ['StatusList2021Entry', 'BitstringStatusListEntry'];

/** Linked-resource types Studio lists as credentials (the values of `DIDAccreditationTypes`, plus plain credentials). */
const CREDENTIAL_RESOURCE_TYPES = [
	'VerifiableCredential',
	'VerifiableAccreditationToAccredit',
	'VerifiableAccreditationToAttest',
];

const PROOF_TYPE_FOR_METHOD: Record<string, string> = {
	Ed25519VerificationKey2018: 'Ed25519Signature2018',
	Ed25519VerificationKey2020: 'Ed25519Signature2020',
	Multikey: 'Ed25519Signature2020',
	JsonWebKey2020: 'JsonWebSignature2020',
	JsonWebKey: 'JsonWebSignature2020',
};

const isObject = (value: unknown): value is JsonObject =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

function requireCustomerId(customer: CustomerEntity | undefined): string {
	if (!customer?.customerId) throw new Error('Customer not found');
	return customer.customerId;
}

export interface CredoCredentialsDependencies {
	store: CredoEngineStore;
	runtime: CredoRuntime;
	signer: CredoSigner;
	ensureTenant: (customerId: string) => Promise<string>;
	/** Dereferences a DID URL through the resolver, as the engine's `resolve` does. */
	resolveUrl: (didUrl: string) => Promise<Response>;
}

export class CredoCredentials {
	private readonly store: CredoEngineStore;
	private readonly runtime: CredoRuntime;
	private readonly signer: CredoSigner;
	private readonly ensureTenant: CredoCredentialsDependencies['ensureTenant'];
	private readonly resolveUrl: CredoCredentialsDependencies['resolveUrl'];

	constructor(dependencies: CredoCredentialsDependencies) {
		this.store = dependencies.store;
		this.runtime = dependencies.runtime;
		this.signer = dependencies.signer;
		this.ensureTenant = dependencies.ensureTenant;
		this.resolveUrl = dependencies.resolveUrl;
	}

	// ------------------------------------------------------------------ issuing

	async createCredential(
		credential: EngineCredentialPayload,
		format: CredentialRequest['format'],
		statusOptions: EngineStatusOptions | null,
		customer: CustomerEntity
	): Promise<EngineCredential> {
		const customerId = requireCustomerId(customer);
		if (format === 'sd-jwt-vc') {
			throw new CredoNotSupportedError(
				"issuing a credential in the 'sd-jwt-vc' format through createCredential (SD-JWT VCs are issued through the agent endpoints, with signWithDidKey)"
			);
		}
		if (format !== 'jwt' && format !== 'jsonld') {
			throw new CredoNotSupportedError(`issuing a credential in the '${format}' format`);
		}
		// A status entry means allocating an index in a status list and publishing it: the status list module's job
		if (statusOptions) throw new NotImplementedByEngineError('credo', 'createCredential with credentialStatus');

		const did = issuerId(credential.issuer);
		if (!did) throw new Error('The credential has no issuer');
		if (!(await this.store.isDidOwned(customerId, did))) throw new CredoOwnershipError(did);

		const payload = normaliseCredentialPayload(credential);
		const document = await this.signer.resolveActiveDocument(did);
		const keys = await ownedSigningKeys(this.store, customerId, document, 'assertionMethod');

		if (format === 'jsonld') return this.signJsonLd(customerId, did, payload, keys);

		const key = keys[0];
		if (!key) throw new Error(`${did} has no assertion key that this customer can sign with`);
		const parts = { header: jwtHeader(key.alg, key.verificationMethod), payload: credentialToJwtPayload(payload) };
		const signature = await this.signer.signWith(customerId, key, signingInput(parts));
		const issued = jwtToCredential(assembleJwt(parts, signature));
		if (!issued) throw new Error('Could not encode the credential');
		return issued;
	}

	private async signJsonLd(
		customerId: string,
		did: string,
		credential: JsonObject,
		keys: OwnedSigningKey[]
	): Promise<EngineCredential> {
		// Data Integrity suites are Ed25519 first (Veramo's default); P-256 signs as JsonWebSignature2020
		const key = [...keys].sort((a, b) => Number(b.alg === 'EdDSA') - Number(a.alg === 'EdDSA'))[0];
		const proofType = key ? PROOF_TYPE_FOR_METHOD[key.methodType] : undefined;
		if (!key || !proofType) throw new Error(`${did} has no assertion key that this customer can sign JSON-LD with`);

		const tenantId = await this.ensureTenant(customerId);
		return this.runtime.withTenant(tenantId, async (session) => {
			// Credo finds the key in its own record of the DID, so only a DID this tenant created can sign JSON-LD
			if ((await session.recordedKeyIds(did)) === null) {
				throw new CredoNotSupportedError(
					`issuing a 'jsonld' credential from ${did}, which was not created through the Credo engine (use the 'jwt' format)`
				);
			}
			return session.signJsonLdCredential({ credential, verificationMethod: key.verificationMethod, proofType });
		});
	}

	// ------------------------------------------------------------ presentations

	async createPresentation(
		presentation: EnginePresentationPayload,
		options: EngineVerificationOptions,
		customer: CustomerEntity
	): Promise<EnginePresentation> {
		const customerId = requireCustomerId(customer);
		const holder = issuerId(presentation.holder);
		if (!holder) throw new Error('The presentation has no holder');
		// The holder DID must be the caller's. Same error as a DID that does not exist, so nothing is disclosed.
		if (!(await this.store.isDidOwned(customerId, holder))) throw new CredoOwnershipError(holder);

		const document = await this.signer.resolveActiveDocument(holder);
		const key = (await ownedSigningKeys(this.store, customerId, document, 'authentication'))[0];
		if (!key) throw new Error(`${holder} has no authentication key that this customer can sign with`);

		const credentials = (
			Array.isArray(presentation.verifiableCredential)
				? presentation.verifiableCredential
				: presentation.verifiableCredential
					? [presentation.verifiableCredential]
					: []
		).map((credential) => compactJwtOf(credential) ?? (credential as JsonValue));
		const challenge = (options as { challenge?: string }).challenge;

		const parts = {
			header: jwtHeader(key.alg, key.verificationMethod),
			payload: presentationToJwtPayload(
				{
					...presentation,
					'@context': Array.isArray(presentation['@context'])
						? presentation['@context']
						: ['https://www.w3.org/2018/credentials/v1'],
					type: Array.isArray(presentation.type) ? presentation.type : ['VerifiablePresentation'],
					verifiableCredential: credentials,
				},
				{ holder, domain: options.domain, challenge }
			),
		};
		const signature = await this.signer.signWith(customerId, key, signingInput(parts));
		const issued = jwtToPresentation(assembleJwt(parts, signature));
		if (!issued) throw new Error('Could not encode the presentation');
		return issued;
	}

	// ------------------------------------------------------------- verification

	async verifyCredential(
		credential: EngineSignedInput,
		options: EngineVerificationOptions,
		customer: CustomerEntity
	): Promise<EngineVerificationResult> {
		const customerId = requireCustomerId(customer);
		const jwt = compactJwtOf(credential);
		if (!jwt && !isObject(credential)) throw new Error('The credential is neither a JWT nor a JSON-LD document');
		const input = jwt ?? (credential as JsonObject);

		const tenantId = await this.ensureTenant(customerId);
		const outcome = await this.runtime.withTenant(tenantId, (session) =>
			session.verifyCredential({ credential: input, allowUndefinedTerms: !jwt })
		);

		const warnings: string[] = [];
		const issuer = jwt ? issuerFromJwt(jwt) : issuerId((credential as JsonObject).issuer);
		const result = this.baseResult(outcome, { issuer }, warnings);

		let statusChecked = false;
		if (options.verifyStatus && outcome.isValid) {
			const status = this.statusSubject(input);
			if (status) {
				statusChecked = true;
				const failure = await this.checkStatus([status], tenantId, warnings);
				if (failure) return this.failed(result, failure, warnings, statusChecked);
			}
		}
		return this.finish(result, warnings, statusChecked);
	}

	async verifyPresentation(
		presentation: EngineSignedInput,
		options: EngineVerificationOptions,
		customer: CustomerEntity
	): Promise<EngineVerificationResult> {
		const customerId = requireCustomerId(customer);
		const jwt = compactJwtOf(presentation);
		if (!jwt && !isObject(presentation)) {
			throw new Error('The presentation is neither a JWT nor a JSON-LD document');
		}
		const input = jwt ?? (presentation as JsonObject);
		const challenge =
			(options as { challenge?: string }).challenge ??
			(!jwt && isObject((input as JsonObject).proof)
				? ((input as JsonObject).proof as JsonObject).challenge
				: undefined);

		const tenantId = await this.ensureTenant(customerId);
		const outcome = await this.runtime.withTenant(tenantId, (session) =>
			session.verifyPresentation({
				presentation: input,
				challenge: typeof challenge === 'string' ? challenge : undefined,
				domain: options.domain,
				allowUndefinedTerms: !jwt,
			})
		);

		const warnings: string[] = [];
		const holder = jwt ? issuerFromJwt(jwt) : issuerId((input as JsonObject).holder);
		const result = this.baseResult(outcome, { holder }, warnings);

		let statusChecked = false;
		if (options.verifyStatus && outcome.isValid) {
			const subjects = this.presentationCredentials(input)
				.map((credential) => this.statusSubject(credential))
				.filter((subject): subject is StatusSubject => subject !== null);
			if (subjects.length > 0) {
				statusChecked = true;
				const failure = await this.checkStatus(subjects, tenantId, warnings);
				if (failure) return this.failed(result, failure, warnings, statusChecked);
			}
		}
		return this.finish(result, warnings, statusChecked);
	}

	private baseResult(outcome: CredoVerification, extra: JsonObject, warnings: string[]): EngineVerificationResult {
		if (outcome.undefinedTerms?.length) {
			warnings.push(
				`These terms are not defined by any @context, so their values are not covered by the signature: ${outcome.undefinedTerms.join(', ')}`
			);
		}
		const result: EngineVerificationResult = { verified: outcome.isValid, ...extra };
		if (outcome.signer) result.signer = outcome.signer;
		if (!outcome.isValid) {
			const failed = outcome.checks.find((check) => !check.isValid);
			result.error = {
				message: failed?.error ?? outcome.error ?? 'Verification failed',
				errorCode: failed?.name ?? 'invalid_credential',
			};
		}
		return result;
	}

	private failed(
		result: EngineVerificationResult,
		failure: { message: string; errorCode: string },
		warnings: string[],
		statusChecked: boolean
	): EngineVerificationResult {
		return this.finish({ ...result, verified: false, error: failure }, warnings, statusChecked);
	}

	private finish(result: EngineVerificationResult, warnings: string[], statusChecked: boolean) {
		const out: EngineVerificationResult = { ...result, policies: { credentialStatus: statusChecked } };
		if (warnings.length > 0) out.warnings = warnings;
		return out;
	}

	/** The status entries of a credential and who issued it, as the status check wants them. */
	private statusSubject(credential: string | JsonObject): StatusSubject | null {
		const compact = typeof credential === 'string' ? credential : compactJwtOf(credential);
		let issuer: string | undefined;
		let entries: JsonValue | undefined;
		if (compact) {
			const decoded = decodeJwt(compact);
			if (!decoded) return null;
			issuer = typeof decoded.payload.iss === 'string' ? decoded.payload.iss : undefined;
			entries = isObject(decoded.payload.vc) ? decoded.payload.vc.credentialStatus : undefined;
		} else if (isObject(credential)) {
			issuer = issuerId(credential.issuer);
			entries = credential.credentialStatus;
		}
		if (!issuer || !entries) return null;
		return { issuer, entries: (Array.isArray(entries) ? entries : [entries]).filter(isObject) };
	}

	private presentationCredentials(presentation: string | JsonObject): (string | JsonObject)[] {
		const compact = typeof presentation === 'string' ? presentation : compactJwtOf(presentation);
		const body = compact ? decodeJwt(compact)?.payload.vp : (presentation as JsonObject).verifiableCredential;
		const list = compact ? (isObject(body) ? body.verifiableCredential : undefined) : body;
		return (Array.isArray(list) ? list : list ? [list] : []).filter(
			(credential): credential is string | JsonObject => typeof credential === 'string' || isObject(credential)
		);
	}

	/**
	 * Step two of the two-step check. Returns a failure (revoked, suspended, or a list that cannot be read) or null
	 * when every entry that this engine can read is valid. Unreadable status types become warnings.
	 */
	private async checkStatus(
		subjects: StatusSubject[],
		tenantId: string,
		warnings: string[]
	): Promise<{ message: string; errorCode: string } | null> {
		for (const subject of subjects) {
			const legacy = subject.entries.filter((entry) => LEGACY_STATUS_TYPES.includes(String(entry.type)));
			for (const entry of subject.entries) {
				if (!LEGACY_STATUS_TYPES.includes(String(entry.type))) {
					warnings.push(`credentialStatus of type ${String(entry.type)} was not checked`);
				}
			}
			if (legacy.length === 0) continue;

			let outcomes: LegacyStatusOutcome[];
			try {
				outcomes = await this.runtime.withTenant(tenantId, (session) =>
					session.checkLegacyCredentialStatus({ issuer: subject.issuer, credentialStatus: legacy })
				);
			} catch (error) {
				return {
					message: `The credential status could not be read: ${error instanceof Error ? error.message : 'unknown error'}`,
					errorCode: 'status_unavailable',
				};
			}
			const revoked = outcomes.find((outcome) => outcome.revoked);
			if (revoked) return { message: 'The credential has been revoked', errorCode: 'revoked' };
			const suspended = outcomes.find((outcome) => outcome.suspended);
			if (suspended) return { message: 'The credential has been suspended', errorCode: 'suspended' };
			if (outcomes.some((outcome) => !outcome.valid)) {
				return { message: 'The credential status is not valid', errorCode: 'status_invalid' };
			}
		}
		return null;
	}

	// ----------------------------------------------------- issued credentials list

	async listCredentials(
		options: ListCredentialRequestOptions,
		customer: CustomerEntity
	): Promise<ListCredentialResponse> {
		const customerId = requireCustomerId(customer);
		const page = await this.store.listCredentialResources(customerId, {
			issuerId: options.issuerId,
			page: options.page,
			limit: options.limit,
			resourceTypes: CREDENTIAL_RESOURCE_TYPES,
		});

		const documents: JsonObject[] = await Promise.all(
			page.resources.map(async (resource): Promise<JsonObject> => {
				const didUrl = `${resource.did}/resources/${resource.resourceId}`;
				const response = await this.resolveUrl(didUrl);
				return { id: didUrl, ...((await response.json()) as JsonObject) };
			})
		);
		return {
			total: page.total,
			credentials: documents
				.filter((credential) => credential.credentialSubject)
				.map((credential) => {
					const proof = isObject(credential.proof) ? credential.proof : {};
					const subject = credential.credentialSubject as JsonObject;
					return {
						status: 'issued',
						providerId: 'studio',
						id: String(credential.id),
						issuerDid: issuerId(credential.issuer) as string,
						subjectDid: subject.id as string,
						type: (credential.type as string[] | undefined) || 'VerifiableCredential',
						format: proof.type === JWT_PROOF_TYPE ? 'jwt' : 'jsonld',
						createdAt: credential.issuanceDate as string,
						expirationDate: credential.expirationDate,
						credentialStatus: credential.credentialStatus,
					};
				}),
		};
	}

	/**
	 * A credential published as a linked resource, by DID URL (`did:cheqd:...:id/resources/rid`) or by resource id.
	 * Either way the resource must be the customer's: a resource that is someone else's and one that does not exist
	 * both give null. (The Veramo engine looks a bare resource id up without the customer; this one does not.)
	 */
	async getCredential(credentialId: string, customer: CustomerEntity): Promise<EngineCredential | null> {
		const customerId = requireCustomerId(customer);

		let didUrl: string;
		if (credentialId.includes('/resources/')) {
			const [did, resourceId] = credentialId.split('/resources/');
			if (!(await this.store.isDidOwned(customerId, did))) return null;
			didUrl = `${did}/resources/${resourceId}`;
		} else {
			const resource = await this.store.findOwnedResource(customerId, credentialId);
			if (!resource) return null;
			didUrl = `${resource.did}/resources/${resource.resourceId}`;
		}

		try {
			const response = await this.resolveUrl(didUrl);
			if (!response.ok) return null;
			return (await response.json()) as EngineCredential;
		} catch {
			return null;
		}
	}

	// ------------------------------------------------------------ holder storage

	/** Keeps a credential in the customer's own Credo tenant. Returns its hash, which is how it is found again. */
	async saveCredential(credential: EngineCredential, customer: CustomerEntity): Promise<string> {
		const customerId = requireCustomerId(customer);
		const jwt = compactJwtOf(credential);
		const stored = jwt ?? credential;
		const hash = createHash('sha256')
			.update(jwt ?? stableStringify(credential))
			.digest('hex');
		const tenantId = await this.ensureTenant(customerId);
		await this.runtime.withTenant(tenantId, (session) => session.storeCredential(hash, stored));
		return hash;
	}

	async retrieveCredential(hash: string, customer: CustomerEntity): Promise<EngineCredential | null> {
		const customerId = requireCustomerId(customer);
		const tenantId = await this.ensureTenant(customerId);
		const stored = await this.runtime.withTenant(tenantId, (session) => session.getStoredCredential(hash));
		if (stored === null) return null;
		return typeof stored === 'string' ? jwtToCredential(stored) : stored;
	}

	async deleteCredential(hash: string, customer: CustomerEntity): Promise<boolean> {
		const customerId = requireCustomerId(customer);
		const tenantId = await this.ensureTenant(customerId);
		return this.runtime.withTenant(tenantId, (session) => session.deleteStoredCredential(hash));
	}
}

interface StatusSubject {
	issuer: string;
	entries: JsonObject[];
}

function issuerFromJwt(compact: string): string | undefined {
	const iss = decodeJwt(compact)?.payload.iss;
	return typeof iss === 'string' ? iss : undefined;
}

/** JSON with sorted keys, so the same credential always hashes the same. */
function stableStringify(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
	if (isObject(value)) {
		return `{${Object.keys(value)
			.sort()
			.filter((key) => value[key] !== undefined)
			.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
			.join(',')}}`;
	}
	return JSON.stringify(value);
}
