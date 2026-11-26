import { sign } from 'node:crypto';
import type {
	CredentialSession,
	CredoVerification,
	LegacyStatusOutcome,
} from '../../../../src/services/identity/engine/credo/credential-ports.js';
import type { PrivateJwk } from '../../../../src/services/identity/engine/credo/key-material.js';
import type { EngineDidResolution, JsonObject } from '../../../../src/services/identity/engine/types.js';

/**
 * What the fake Credo runtime does for credentials and signing. Signatures are real (Node's crypto, with the private
 * key the engine imported), so a test can verify them against the public key. Verification and status answers are
 * scripted, because they belong to Credo.
 */
export class CredentialFakeState {
	/** DID documents by DID; a DID with no entry gets the runtime's default resolution */
	resolutions = new Map<string, EngineDidResolution>();
	signCalls: { tenantId: string; keyId: string; alg: string }[] = [];
	jsonLdSigns: { tenantId: string; verificationMethod: string; proofType: string }[] = [];
	verifyCredentialCalls: { tenantId: string; credential: string | JsonObject; allowUndefinedTerms: boolean }[] = [];
	verifyPresentationCalls: {
		tenantId: string;
		presentation: string | JsonObject;
		challenge?: string;
		domain?: string;
	}[] = [];
	statusCalls: { tenantId: string; credential: unknown }[] = [];
	verification: CredoVerification = { isValid: true, checks: [{ name: 'signature', isValid: true }] };
	status: LegacyStatusOutcome[] | Error = [];
	/** Holder records by tenant, then id */
	stored = new Map<string, Map<string, string | JsonObject>>();
	storeCalls = 0;
}

const validStatus = (statusListCredential: string): LegacyStatusOutcome => ({
	type: 'BitstringStatusListEntry',
	statusPurpose: 'revocation',
	statusListIndex: 1,
	status: 0,
	valid: true,
	revoked: false,
	suspended: false,
	statusListCredential,
});
export { validStatus };

export function credentialFakeSession(
	state: CredentialFakeState,
	imported: { keyId: string; privateJwk: PrivateJwk }[],
	tenantId: string
): CredentialSession {
	const holder = () => {
		let records = state.stored.get(tenantId);
		if (!records) state.stored.set(tenantId, (records = new Map()));
		return records;
	};
	return {
		async sign({ keyId, alg, data }) {
			state.signCalls.push({ tenantId, keyId, alg });
			const key = imported.find((candidate) => candidate.keyId === keyId);
			if (!key) throw new Error(`Key ${keyId} not found`);
			const { kid: _kid, ...jwk } = key.privateJwk;
			const signature =
				alg === 'ES256'
					? sign('sha256', new Uint8Array(data), { key: jwk, format: 'jwk', dsaEncoding: 'ieee-p1363' })
					: sign(null, new Uint8Array(data), { key: jwk, format: 'jwk' });
			return new Uint8Array(signature);
		},
		async signJsonLdCredential(input) {
			state.jsonLdSigns.push({ tenantId, ...input });
			return {
				...input.credential,
				proof: { type: input.proofType, verificationMethod: input.verificationMethod },
			};
		},
		async verifyCredential(input) {
			state.verifyCredentialCalls.push({ tenantId, ...input });
			return state.verification;
		},
		async verifyPresentation(input) {
			state.verifyPresentationCalls.push({ tenantId, ...input });
			return state.verification;
		},
		async checkLegacyCredentialStatus(credential) {
			state.statusCalls.push({ tenantId, credential });
			if (state.status instanceof Error) throw state.status;
			return state.status;
		},
		async storeCredential(id, credential) {
			state.storeCalls++;
			holder().set(id, credential);
		},
		async getStoredCredential(id) {
			return holder().get(id) ?? null;
		},
		async deleteStoredCredential(id) {
			return holder().delete(id);
		},
	};
}
