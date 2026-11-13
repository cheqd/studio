import type { IIdentityService } from '../index.js';
import type { IdentityEngine } from './identity-engine.js';
import { getCredoEngine } from './credo/factory.js';
import { VeramoEngine } from './veramo-engine.js';
import { DEFAULT_ENGINE, isEngineName } from './types.js';
import { EngineGoneError } from './errors.js';
import type { ArtifactRef, EngineName, EngineRoute, RoutedFamily } from './types.js';

/** Reads the engine recorded on an existing artifact. Returns anything: the column may be missing or null. */
export interface ArtifactEngineLookup {
	recordedEngine(artifact: ArtifactRef): Promise<unknown>;
}

/** Reads the engine a feature flag selects for a new artifact, or null when no flag applies. */
export interface EngineFlagLookup {
	flaggedEngine(customerId: string | undefined, route: EngineRoute): Promise<unknown>;
}

export interface EngineDecisionContext {
	customerId?: string;
	route: RoutedFamily;
	/** The type of the key being created, when the request creates one. P-256 always goes to Credo. */
	keyType?: string;
	/** Set when the request creates a status list with `encrypted: true`, which is gone (410) on every engine. */
	encryptedStatusList?: boolean;
	/** Set when the operation acts on an artifact that already exists (update, deactivate, revoke, status check). */
	artifact?: ArtifactRef;
}

export type EngineDecisionReason = 'artifact' | 'flag' | 'exception' | 'default';

/** Which exception fired, when `reason` is `exception` (engine spec 4.1). */
export type EngineExceptionRule = 'agent-route' | 'p256-key';

export interface EngineDecision {
	engine: EngineName;
	reason: EngineDecisionReason;
	/** Set only for `exception`. */
	rule?: EngineExceptionRule;
}

const P256_KEY_TYPES = new Set(['secp256r1', 'p-256', 'p256', 'jsonwebkey', 'jsonwebkey2020']);

/** True for the key types that only the Credo engine can sign with (P-256 / JsonWebKey). */
export function isP256KeyType(keyType: unknown): boolean {
	return typeof keyType === 'string' && P256_KEY_TYPES.has(keyType.trim().toLowerCase());
}

export type EngineFactory = (service: IIdentityService) => IdentityEngine;

export const defaultEngineFactories: Record<EngineName, EngineFactory> = {
	veramo: (service) => new VeramoEngine(service),
	// Never selected unless a flag or a recorded engine says so. Credo starts on first use, not here.
	credo: () => getCredoEngine(),
};

/**
 * Chooses the engine for each request (migration plan, section 3; engine spec 4.1). Exceptions come first and are
 * written here, not in flags: encrypted status-list creation is `Gone` on every engine; agent route families and
 * P-256 key creation always use Credo. Then:
 *   1. an operation on an existing artifact uses the engine recorded on it;
 *   2. a new artifact uses the engine from the `featureFlag` table for that customer and route;
 *   3. otherwise the global default, `veramo`.
 * A missing column, a null, an unrecognised value or a failing lookup all read as `veramo`: the router must
 * never make a request fail because the engine bookkeeping is absent. Shadow reads are not part of this step.
 */
export class EngineRouter {
	constructor(
		private readonly artifacts: ArtifactEngineLookup,
		private readonly flags: EngineFlagLookup,
		private readonly factories: Record<EngineName, EngineFactory> = defaultEngineFactories
	) {}

	async decide(context: EngineDecisionContext): Promise<EngineDecision> {
		if (context.encryptedStatusList && context.route === 'status-list') {
			throw new EngineGoneError('Creating an encrypted status list is no longer supported');
		}
		if (context.route === 'agent') return { engine: 'credo', reason: 'exception', rule: 'agent-route' };
		if (isP256KeyType(context.keyType)) return { engine: 'credo', reason: 'exception', rule: 'p256-key' };
		if (context.artifact) {
			const recorded = await this.safely(() => this.artifacts.recordedEngine(context.artifact as ArtifactRef));
			// An existing artifact never consults the flags: moving it between engines is a migration, not a flag.
			return isEngineName(recorded)
				? { engine: recorded, reason: 'artifact' }
				: { engine: DEFAULT_ENGINE, reason: 'default' };
		}
		const flagged = await this.safely(() =>
			this.flags.flaggedEngine(context.customerId, context.route as EngineRoute)
		);
		return isEngineName(flagged)
			? { engine: flagged, reason: 'flag' }
			: { engine: DEFAULT_ENGINE, reason: 'default' };
	}

	async engineFor(context: EngineDecisionContext, service: IIdentityService): Promise<IdentityEngine> {
		const { engine } = await this.decide(context);
		return this.factories[engine](service);
	}

	private async safely(read: () => Promise<unknown>): Promise<unknown> {
		try {
			return await read();
		} catch {
			return null;
		}
	}
}
