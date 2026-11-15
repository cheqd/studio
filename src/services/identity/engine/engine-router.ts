import type { IIdentityService } from '../index.js';
import type { IdentityEngine } from './identity-engine.js';
import { getCredoEngine } from './credo/factory.js';
import { VeramoEngine } from './veramo-engine.js';
import { DEFAULT_ENGINE, isEngineName } from './types.js';
import { currentRequestContext } from '../../request-context.js';
import { logRoutingOutcome } from './routing-log.js';
import { EngineGoneError, EngineRoutingUnavailableError, logRoutingFailure } from './errors.js';
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
export type EngineExceptionRule = 'agent-route' | 'p256-key' | 'encrypted-status-list';

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
 * A missing column, a null or an empty value on an existing record reads as `veramo`: those rows predate the
 * engine bookkeeping. A lookup that FAILS, or a recorded value that is not an engine name, is not the same as "no
 * record": the artefact may belong to Credo, so the request is refused with `EngineRoutingUnavailableError` (503)
 * rather than answered by Veramo. The compiled default applies only when the lookup worked and found no record.
 * Shadow reads are not part of this step.
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
			const recorded = await this.lookup('artifact', () =>
				this.artifacts.recordedEngine(context.artifact as ArtifactRef)
			);
			// An existing artifact never consults the flags: moving it between engines is a migration, not a flag.
			if (isEngineName(recorded)) return { engine: recorded, reason: 'artifact' };
			if (recorded === null || recorded === undefined || recorded === '') {
				return { engine: DEFAULT_ENGINE, reason: 'default' };
			}
			logRoutingFailure('artifact', new Error('recorded engine is not a known engine'));
			throw new EngineRoutingUnavailableError();
		}
		const flagged = await this.lookup('flag', () =>
			this.flags.flaggedEngine(context.customerId, context.route as EngineRoute)
		);
		return isEngineName(flagged)
			? { engine: flagged, reason: 'flag' }
			: { engine: DEFAULT_ENGINE, reason: 'default' };
	}

	async engineFor(context: EngineDecisionContext, service: IIdentityService): Promise<IdentityEngine> {
		let decision: EngineDecision;
		try {
			decision = await this.decide(context);
		} catch (error) {
			if (error instanceof EngineGoneError)
				this.record(context, { engine: 'none', reason: 'exception', rule: 'encrypted-status-list' });
			throw error;
		}
		this.record(context, decision);
		return this.factories[decision.engine](service);
	}

	/**
	 * Notes the decision on the request, so the one log line (with outcome and duration) is written when the
	 * response is sent and the operation row gets its `engine`. Outside a request there is no outcome to wait for,
	 * so the line is written at once. Nothing here can fail the request.
	 */
	private record(context: EngineDecisionContext, decision: { engine: string; reason: string; rule?: string }): void {
		try {
			const record = {
				routeFamily: context.route,
				engine: decision.engine,
				reason: decision.reason,
				rule: decision.rule,
				customerId: context.customerId,
			};
			const request = currentRequestContext();
			if (request) {
				request.decisions.push(record);
				if (context.customerId) request.customerId = context.customerId;
			} else {
				logRoutingOutcome(
					{ requestId: 'none', startedAt: Date.now(), decisions: [record], customerId: context.customerId },
					{}
				);
			}
		} catch {
			/* ignore */
		}
	}

	/** Runs a lookup. A failure is logged and refused as `EngineRoutingUnavailableError`, never turned into "veramo". */
	private async lookup(what: 'artifact' | 'flag', read: () => Promise<unknown>): Promise<unknown> {
		try {
			return await read();
		} catch (error) {
			if (error instanceof EngineRoutingUnavailableError) throw error;
			logRoutingFailure(what, error);
			throw new EngineRoutingUnavailableError(undefined, error);
		}
	}
}
