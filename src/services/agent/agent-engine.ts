import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { IdentityEngine } from '../identity/engine/identity-engine.js';
import type { EngineDidDocument } from '../identity/engine/types.js';
import { EngineCapabilityError, upstreamFailure } from './agent-errors.js';
import { keysFromDidDocument, relationshipIds } from './agent-keys.js';
import type { ResolvedAgentKey } from './agent-keys.js';
import type { DidSigner } from './sd-jwt.js';

/** The optional `IdentityEngine` methods the agent endpoints use, by name. */
export type AgentCapability = 'signWithDidKey' | 'createTokenStatusList' | 'setTokenStatus' | 'getTokenStatus';

/** Picks the engine for a customer. The default (see `agent-service.ts`) goes through the `EngineRouter`. */
export type AgentEngineProvider = (customer: CustomerEntity) => Promise<IdentityEngine>;

export function requireCapabilities(engine: IdentityEngine, ...needed: AgentCapability[]): void {
	const missing = needed.filter((name) => typeof engine[name] !== 'function');
	if (missing.length > 0) throw new EngineCapabilityError(missing.map((name) => `${engine.name}.${name}`));
}

/** The engine's method, bound to the engine, or a 501 if it does not have it. */
export function engineMethod<K extends AgentCapability>(
	engine: IdentityEngine,
	name: K
): NonNullable<IdentityEngine[K]> {
	const method = engine[name];
	if (typeof method !== 'function') throw new EngineCapabilityError([`${engine.name}.${name}`]);
	return (method as (...args: unknown[]) => unknown).bind(engine) as NonNullable<IdentityEngine[K]>;
}

export interface ResolvedDid {
	document: EngineDidDocument;
	deactivated: boolean;
	keys: ResolvedAgentKey[];
}

export async function resolveDidKeys(engine: IdentityEngine, did: string): Promise<ResolvedDid> {
	let resolution;
	try {
		resolution = await engine.resolveDid(did);
	} catch (error) {
		throw upstreamFailure(`Could not resolve ${did}: ${error instanceof Error ? error.message : 'unknown error'}`);
	}
	if (!resolution.didDocument) throw upstreamFailure(`Could not resolve ${did}`);
	return {
		document: resolution.didDocument,
		deactivated: resolution.didDocumentMetadata?.deactivated === true,
		keys: signingKeys(resolution.didDocument),
	};
}

/**
 * The keys that may sign: those listed under `authentication` or `assertionMethod`. A rotated key stays in
 * `verificationMethod` (so earlier credentials still verify) but must never be picked to sign again. A document
 * with no such lists, or none of whose keys are listed, falls back to all of its keys.
 */
function signingKeys(document: EngineDidDocument): ResolvedAgentKey[] {
	const all = keysFromDidDocument(document);
	const inForce = new Set([
		...relationshipIds(document, 'authentication'),
		...relationshipIds(document, 'assertionMethod'),
	]);
	const current = all.filter((key) => inForce.has(key.kid));
	return current.length > 0 ? current : all;
}

/** The keys a DID document lists under `assertionMethod`, or all of its keys when it has no such list. */
export function assertionKeys(resolved: ResolvedDid): ResolvedAgentKey[] {
	const listed = resolved.document.assertionMethod;
	if (!Array.isArray(listed)) return resolved.keys;
	const ids = new Set(
		listed
			.map((entry) => (typeof entry === 'string' ? entry : (entry as { id?: string } | null)?.id))
			.filter(Boolean)
	);
	const keys = resolved.keys.filter((key) => ids.has(key.kid) || ids.has(key.kid.slice(key.kid.indexOf('#'))));
	return keys.length > 0 ? keys : resolved.keys;
}

export function didSigner(
	engine: IdentityEngine,
	customer: CustomerEntity,
	did: string,
	key: ResolvedAgentKey
): DidSigner {
	return {
		did,
		kid: key.kid,
		alg: key.alg,
		// Called as a method, not through a detached reference: engines are class instances that use `this`.
		sign: async (data) => {
			if (!engine.signWithDidKey) throw new EngineCapabilityError([`${engine.name}.signWithDidKey`]);
			return engine.signWithDidKey({ did, kid: key.kid, alg: key.alg, data }, customer);
		},
	};
}
