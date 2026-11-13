import {
	ClaimFormat,
	JsonTransformer,
	RecordNotFoundError,
	W3cCredential,
	W3cCredentialRecord,
	W3cJsonLdVerifiableCredential,
	W3cJsonLdVerifiablePresentation,
} from '@credo-ts/core';
import type { JsonObject } from '../types.js';
import type { CredentialSession, CredoVerification, CredoVerificationCheck } from './credential-ports.js';

/**
 * The Credo side of credentials, presentations and signing: the one place these operations touch Credo's API. It is
 * a thin adapter; the rules (ownership, key choice, status, formats) are in `credentials.ts` and `signing.ts`.
 *
 * `agent` is a Credo tenant agent. Its API objects are generic over the module set, so they are typed loosely here,
 * as in `credo-runtime.ts`.
 */
// biome-ignore lint/suspicious/noExplicitAny: the Credo API objects are generic over the module set
type TenantAgent = { kms: any; w3cCredentials: any; modules: any };

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

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
			const signed = await agent.w3cCredentials.signCredential({
				format: ClaimFormat.LdpVc,
				credential: JsonTransformer.fromJSON(credential, W3cCredential),
				verificationMethod,
				proofType,
			});
			return JsonTransformer.toJSON(signed) as JsonObject;
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
