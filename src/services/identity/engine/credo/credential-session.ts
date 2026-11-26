import {
	ClaimFormat,
	JsonLdModuleConfig,
	JsonTransformer,
	RecordNotFoundError,
	W3cCredential,
	W3cCredentialRecord,
	W3cJsonLdVerifiableCredential,
	W3cJsonLdVerifiablePresentation,
	vcLibraries,
} from '@credo-ts/core';
import type { JsonObject } from '../types.js';
import type { CredentialSession, CredoVerification, CredoVerificationCheck } from './credential-ports.js';
import { CredoUndefinedTermsError } from './errors.js';

/**
 * The Credo side of credentials, presentations and signing: the one place these operations touch Credo's API. It is
 * a thin adapter; the rules (ownership, key choice, status, formats) are in `credentials.ts` and `signing.ts`.
 *
 * `agent` is a Credo tenant agent. Its API objects are generic over the module set, so they are typed loosely here,
 * as in `credo-runtime.ts`.
 */
// biome-ignore lint/suspicious/noExplicitAny: the Credo API objects are generic over the module set
type TenantAgent = { kms: any; w3cCredentials: any; modules: any; context?: any };

type DocumentLoader = (url: string) => Promise<unknown>;

/**
 * When JSON-LD signing failed because the document has a term no `@context` defines, returns `{ term }` with the
 * term jsonld reported (it stops at the first one). Returns undefined for any other failure. jsonld raises this as a
 * `jsonld.ValidationError` ("Safe mode validation error.") with an `invalid property` event; Credo wraps it.
 */
export function undefinedTermFailure(error: unknown): { term?: string } | undefined {
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current; depth++) {
		const candidate = current as {
			name?: unknown;
			details?: { event?: { code?: unknown; details?: { property?: unknown } } };
			cause?: unknown;
		};
		const event = candidate.details?.event;
		if (candidate.name === 'jsonld.ValidationError' && event?.code === 'invalid property') {
			const property = event.details?.property;
			return typeof property === 'string' ? { term: property } : {};
		}
		current = candidate.cause;
	}
	return undefined;
}

/**
 * Every term of the document that no `@context` defines, found by expanding it without jsonld's safe mode and
 * listening for the terms it drops (the same events Credo collects when verifying with `allowUndefinedTerms`).
 */
export async function collectUndefinedTerms(document: JsonObject, documentLoader: DocumentLoader): Promise<string[]> {
	const terms = new Set<string>();
	await vcLibraries.jsonld.expand(document, {
		documentLoader,
		safe: false,
		eventHandler: ({
			event,
			next,
		}: {
			event: { code?: string; details?: { property?: unknown } };
			next: () => void;
		}) => {
			if (event.code === 'invalid property' && typeof event.details?.property === 'string') {
				terms.add(event.details.property);
			}
			next();
		},
	});
	return [...terms];
}

/** The tenant's JSON-LD document loader (Studio's safe loader), or undefined when the agent does not expose it. */
function documentLoaderOf(agent: TenantAgent): DocumentLoader | undefined {
	try {
		const config = agent.context?.resolve?.(JsonLdModuleConfig) as JsonLdModuleConfig | undefined;
		return config ? (config.documentLoader(agent.context) as DocumentLoader) : undefined;
	} catch {
		return undefined;
	}
}

/** The error's message, with the messages of the errors it wraps (vc.js reports its failures in `errors`). */
function message(error: unknown): string {
	if (!(error instanceof Error)) return String(error);
	const inner = (error as { errors?: unknown }).errors;
	const details = Array.isArray(inner)
		? inner.map((entry) => (entry instanceof Error ? entry.message : String(entry))).filter(Boolean)
		: [];
	return details.length > 0 ? `${error.message} ${details.join('; ')}` : error.message;
}

/** Credo's validations, flattened to `{ name, isValid, error }` (arrays become `name[i]`, nested results `a.b`). */
function flatten(prefix: string, value: unknown, out: CredoVerificationCheck[]): void {
	if (Array.isArray(value)) {
		value.forEach((entry, index) => flatten(`${prefix}[${index}]`, entry, out));
		return;
	}
	if (typeof value !== 'object' || value === null) return;
	const { isValid, error, validations, ...rest } = value as Record<string, unknown>;
	if (typeof isValid === 'boolean' && !validations) {
		out.push({ name: prefix, isValid, ...(error ? { error: message(error) } : {}) });
	}
	if (validations) {
		for (const [name, entry] of Object.entries(validations as Record<string, unknown>)) {
			flatten(prefix ? `${prefix}.${name}` : name, entry, out);
		}
	}
	// Results with no `validations` of their own carry nothing more worth flattening
	void rest;
}

function toVerification(result: {
	isValid: boolean;
	validations?: Record<string, unknown>;
	error?: unknown;
}): CredoVerification {
	const checks: CredoVerificationCheck[] = [];
	for (const [name, entry] of Object.entries(result.validations ?? {})) flatten(name, entry, checks);
	const vcJs = (result.validations?.vcJs ?? {}) as { undefinedTerms?: string[] };
	return {
		isValid: result.isValid,
		checks,
		...(result.error ? { error: message(result.error) } : {}),
		...(vcJs.undefinedTerms?.length ? { undefinedTerms: vcJs.undefinedTerms } : {}),
	};
}

export function credentialSession(agent: TenantAgent): CredentialSession {
	return {
		async sign({ keyId, alg, data }) {
			const { signature } = await agent.kms.sign({ keyId, algorithm: alg, data });
			return signature as Uint8Array;
		},

		async signJsonLdCredential({ credential, verificationMethod, proofType }) {
			try {
				const signed = await agent.w3cCredentials.signCredential({
					format: ClaimFormat.LdpVc,
					credential: JsonTransformer.fromJSON(credential, W3cCredential),
					verificationMethod,
					proofType,
				});
				return JsonTransformer.toJSON(signed) as JsonObject;
			} catch (error) {
				const failure = undefinedTermFailure(error);
				if (!failure) throw error;
				// jsonld names only the first undefined term; expanding the document once more finds all of them
				const loader = documentLoaderOf(agent);
				const terms = loader ? await collectUndefinedTerms(credential, loader).catch(() => []) : [];
				throw new CredoUndefinedTermsError(terms.length > 0 ? terms : failure.term ? [failure.term] : []);
			}
		},

		async verifyCredential({ credential, allowUndefinedTerms }) {
			try {
				const result = await agent.w3cCredentials.verifyCredential(
					typeof credential === 'string'
						? { credential, verifyCredentialStatus: false }
						: {
								credential: JsonTransformer.fromJSON(credential, W3cJsonLdVerifiableCredential),
								verifyCredentialStatus: false,
								allowUndefinedTerms,
							}
				);
				return toVerification(result);
			} catch (error) {
				return { isValid: false, checks: [], error: message(error) };
			}
		},

		async verifyPresentation({ presentation, challenge, domain, allowUndefinedTerms }) {
			try {
				const result = await agent.w3cCredentials.verifyPresentation(
					typeof presentation === 'string'
						? { presentation, challenge, domain, verifyCredentialStatus: false }
						: {
								presentation: JsonTransformer.fromJSON(presentation, W3cJsonLdVerifiablePresentation),
								challenge,
								domain,
								verifyCredentialStatus: false,
								allowUndefinedTerms,
							}
				);
				return toVerification(result);
			} catch (error) {
				return { isValid: false, checks: [], error: message(error) };
			}
		},

		async checkLegacyCredentialStatus(credential) {
			return agent.modules.cheqd.checkLegacyCredentialStatus(credential);
		},

		async storeCredential(id, credential) {
			try {
				await agent.w3cCredentials.getById(id);
				return; // the id is the credential's hash, so a record that is already there is the same credential
			} catch (error) {
				if (!(error instanceof RecordNotFoundError)) throw error;
			}
			const record = new W3cCredentialRecord({
				id,
				credentialInstances: [{ credential: credential as string | JsonObject }],
			} as ConstructorParameters<typeof W3cCredentialRecord>[0]);
			await agent.w3cCredentials.store({ record });
		},

		async getStoredCredential(id) {
			try {
				const record = await agent.w3cCredentials.getById(id);
				return record.credentialInstances[0].credential as string | JsonObject;
			} catch (error) {
				if (error instanceof RecordNotFoundError) return null;
				throw error;
			}
		},

		async deleteStoredCredential(id) {
			try {
				await agent.w3cCredentials.getById(id);
			} catch (error) {
				if (error instanceof RecordNotFoundError) return false;
				throw error;
			}
			await agent.w3cCredentials.deleteById(id);
			return true;
		},
	};
}
