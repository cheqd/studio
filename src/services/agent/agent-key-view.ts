import type { EngineDidDocument } from '../identity/engine/types.js';
import { keyFromVerificationMethod, publicKeyMultibaseFor, relationshipIds } from './agent-keys.js';
import type { AgentKeyType, VerificationMethodLike } from './agent-keys.js';

export type AgentKeyStatus = 'active' | 'rotated' | 'revoked';
export type KeyUse = 'did' | 'a2a' | 'ap2' | 'kya-os';

/** One of the agent's keys, as the API returns it. Public material only. */
export interface AgentKeyView {
	/** The full DID URL of the verification method. */
	keyId: string;
	type: AgentKeyType;
	algorithm: 'EdDSA' | 'ES256';
	status: AgentKeyStatus;
	createdAt: Date;
	rotatedAt: Date | null;
	publicKeyMultibase: string;
	usedBy: KeyUse[];
}

/** When each key came to be and when it was rotated out, from the agent's key events. */
export interface KeyHistory {
	createdAt: Map<string, Date>;
	rotatedAt: Map<string, Date>;
}

/**
 * The agent's keys, read from its DID document (the ledger is the source of truth for what is a key and which
 * keys are in force).
 *  - `active`: listed under `authentication` or `assertionMethod`.
 *  - `rotated`: still in `verificationMethod` (kept so earlier credentials verify) but no longer in force.
 *  - `revoked`: every key of a deactivated DID.
 * `usedBy` is derived, for active keys only: `did` (DID authentication), `a2a` (agent card signing), `ap2`
 * (AP2 mandates are bound to the P-256 key) and `kya-os` (KYA-OS uses the Ed25519 key). Labels, not enforcement.
 */
export function viewKeys(
	document: EngineDidDocument,
	deactivated: boolean,
	history: KeyHistory,
	registeredAt: Date
): AgentKeyView[] {
	const authentication = new Set(relationshipIds(document, 'authentication'));
	const assertion = new Set(relationshipIds(document, 'assertionMethod'));
	const methods = (document.verificationMethod as VerificationMethodLike[] | undefined) ?? [];
	const views: AgentKeyView[] = [];
	for (const method of methods) {
		const key = keyFromVerificationMethod(document.id, method);
		if (!key) continue;
		const inForce = authentication.has(key.kid) || assertion.has(key.kid);
		const status: AgentKeyStatus = deactivated ? 'revoked' : inForce ? 'active' : 'rotated';
		const usedBy: KeyUse[] = [];
		if (status === 'active') {
			if (authentication.has(key.kid)) usedBy.push('did');
			if (assertion.has(key.kid)) {
				usedBy.push('a2a');
				usedBy.push(key.alg === 'ES256' ? 'ap2' : 'kya-os');
			}
		}
		views.push({
			keyId: key.kid,
			type: key.alg === 'ES256' ? 'P-256' : 'Ed25519',
			algorithm: key.alg,
			status,
			createdAt: history.createdAt.get(key.kid) ?? registeredAt,
			rotatedAt: status === 'rotated' ? (history.rotatedAt.get(key.kid) ?? null) : null,
			publicKeyMultibase: publicKeyMultibaseFor(key),
			usedBy,
		});
	}
	return views;
}
