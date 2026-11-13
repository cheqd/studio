import type { IIdentityService } from '../index.js';
import type { IdentityEngine } from './identity-engine.js';
import { createCredoEngineStub } from './credo-engine.js';
import { VeramoEngine } from './veramo-engine.js';
import { DEFAULT_ENGINE, isEngineName } from './types.js';
import type { ArtifactRef, EngineName, EngineRoute } from './types.js';

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
	route: EngineRoute;
	/** Set when the operation acts on an artifact that already exists (update, deactivate, revoke, status check). */
	artifact?: ArtifactRef;
}

export type EngineDecisionReason = 'artifact' | 'flag' | 'default';

export interface EngineDecision {
	engine: EngineName;
	reason: EngineDecisionReason;
}

export type EngineFactory = (service: IIdentityService) => IdentityEngine;

export const defaultEngineFactories: Record<EngineName, EngineFactory> = {
	veramo: (service) => new VeramoEngine(service),
	// STUB: replace with the real Credo engine factory. Never selected unless a flag or a recorded engine says so.
	credo: () => createCredoEngineStub(),
};

/**
 * Chooses the engine for each request (migration plan, section 3):
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
		if (context.artifact) {
			const recorded = await this.safely(() => this.artifacts.recordedEngine(context.artifact as ArtifactRef));
			// An existing artifact never consults the flags: moving it between engines is a migration, not a flag.
			return isEngineName(recorded)
				? { engine: recorded, reason: 'artifact' }
				: { engine: DEFAULT_ENGINE, reason: 'default' };
		}
		const flagged = await this.safely(() => this.flags.flaggedEngine(context.customerId, context.route));
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
