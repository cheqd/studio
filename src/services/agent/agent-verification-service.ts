import { SDJwtInstance } from '@sd-jwt/core';
import { jwkVerifier, sha256Hasher } from '@cheqd/agent-identity-ap2';
import type { AgentCard } from '@a2a-js/sdk';
import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { CheckResult, VerifyCheckName, VerifyVerdict } from '../../types/agent.js';
import { VERIFY_CHECK_NAMES } from '../../types/agent.js';
import type { IdentityEngine } from '../identity/engine/identity-engine.js';
import type { EngineDidDocument, JsonObject } from '../identity/engine/types.js';
import { AGENT_CARD_RESOURCE_TYPE, CHEQD_TRUST_EXTENSION_URI, verifyAgentCardForDid } from './agent-card.js';
import { resolveDidKeys } from './agent-engine.js';
import type { AgentEngineProvider, ResolvedDid } from './agent-engine.js';
import { badRequest, unauthorised } from './agent-errors.js';
import type { AgentStore } from './agent-store.js';
import { readStatusClaim, verifyOpenMandate } from './ap2-mandate.js';
import type { PublicJwk } from './agent-keys.js';
import { decodeSdJwtUnverified } from './sd-jwt.js';

export interface VerifyAgentInput {
	/** The agent's `did:cheqd` identifier. */
	did: string;
	/** Which of the four calls to run. Default: all, and `verifyMandate` only when a mandate is presented. */
	checks?: VerifyCheckName[];
	/** A card the agent presented. Without one, the latest published card is fetched from the DID. */
	card?: Record<string, unknown>;
	/** Authority credentials (SD-JWT VCs) the agent presented, for `checkStatus`. */
	credentials?: string[];
	/** An AP2 open mandate presentation, for `verifyMandate`. */
	mandate?: {
		presentation: string;
		audience: string;
		nonce: string;
		closedMandate?: Record<string, unknown>;
		checkoutJwt?: string;
	};
}

export interface VerifyAgentResponse {
	verdict: VerifyVerdict;
	did: string;
	checks: Partial<Record<VerifyCheckName, CheckResult>>;
	/** The `verificationEvent` row, or null when it could not be written (the verdict still stands). */
	eventId: string | null;
}

const DID_CHEQD = /^did:cheqd:(mainnet|testnet):[A-Za-z0-9_-]{16,64}$/;

const result = (
	outcome: CheckResult['outcome'],
	reasons: string[] = [],
	details?: Record<string, unknown>
): CheckResult => ({
	outcome,
	reasons,
	...(details ? { details } : {}),
});

/**
 * The four-call verification contract (agent verification notes): `resolveAgent`, `verifyAgentCard`,
 * `checkStatus`, `verifyMandate`. Each call stands alone, fails closed, and reports reasons as short codes. The
 * verifier need not own the agent: nothing here reads another customer's rows, only what the ledger and the
 * status lists publish. Each call writes one `verificationEvent` (checks and verdict, no credential contents).
 *
 * Limits, stated so nobody assumes more: only `did:cheqd` resolves (a `did:web` fetch needs the shared fetch
 * wrapper that blocks internal destinations, A-062); budget and recurrence totals of a mandate are not tracked
 * (the toolkit's store is file-based); the Token Status List read goes through the engine.
 */
export class AgentVerificationService {
	constructor(private readonly deps: { store: AgentStore; engineFor: AgentEngineProvider; now?: () => Date }) {}

	async verify(customerIn: CustomerEntity | undefined, input: VerifyAgentInput): Promise<VerifyAgentResponse> {
		if (!customerIn?.customerId) throw unauthorised();
		if (!DID_CHEQD.test(input.did)) throw badRequest('did must be a did:cheqd identifier (testnet or mainnet)');
		const requested = input.checks && input.checks.length > 0 ? [...new Set(input.checks)] : undefined;
		if (requested?.some((name) => !VERIFY_CHECK_NAMES.includes(name))) {
			throw badRequest(`checks must be a subset of: ${VERIFY_CHECK_NAMES.join(', ')}`);
		}
		const names =
			requested ?? VERIFY_CHECK_NAMES.filter((name) => name !== 'verifyMandate' || input.mandate !== undefined);

		const engine = await this.deps.engineFor(customerIn);
		const resolution = await this.safely(() => resolveDidKeys(engine, input.did));
		const checks: Partial<Record<VerifyCheckName, CheckResult>> = {};
		for (const name of names) {
			checks[name] = await this.run(name, engine, input, resolution);
		}
		const verdict = verdictOf(Object.values(checks));
		const eventId = await this.record(customerIn, input.did, checks, verdict, engine.name);
		return { verdict, did: input.did, checks, eventId };
	}

	private async run(
		name: VerifyCheckName,
		engine: IdentityEngine,
		input: VerifyAgentInput,
		resolution: ResolvedDid | { error: string }
	): Promise<CheckResult> {
		try {
			switch (name) {
				case 'resolveAgent':
					return await this.resolveAgent(engine, input.did, resolution);
				case 'verifyAgentCard':
					return await this.verifyAgentCard(engine, input, resolution);
				case 'checkStatus':
					return await this.checkStatus(engine, input, resolution);
				case 'verifyMandate':
					return await this.verifyMandate(engine, input, resolution);
			}
		} catch (error) {
			return result('error', [`unexpected: ${error instanceof Error ? error.message : 'unknown'}`]);
		}
	}

	private async resolveAgent(
		engine: IdentityEngine,
		did: string,
		resolution: ResolvedDid | { error: string }
	): Promise<CheckResult> {
		if ('error' in resolution) return result('fail', ['did_unresolvable']);
		if (resolution.deactivated) return result('fail', ['did_deactivated']);
		if (resolution.keys.length === 0) return result('fail', ['no_usable_keys']);
		const card = await this.latestPublishedCard(engine, did);
		return result('pass', [], {
			keys: resolution.keys.map((key) => ({ id: key.kid, alg: key.alg })),
			cardResource: card ? { resourceId: card.resourceId, version: card.version } : null,
		});
	}

	private async verifyAgentCard(
		engine: IdentityEngine,
		input: VerifyAgentInput,
		resolution: ResolvedDid | { error: string }
	): Promise<CheckResult> {
		if ('error' in resolution) return result('fail', ['did_unresolvable']);
		if (resolution.deactivated) return result('fail', ['did_deactivated']);
		let card = input.card;
		if (!card) {
			const published = await this.latestPublishedCard(engine, input.did);
			if (!published) return result('fail', ['no_card_published_or_presented']);
			card = published.card ?? undefined;
			if (!card) return result('error', ['card_unreadable']);
		}
		const reasons: string[] = [];
		const signature = await verifyAgentCardForDid(card as unknown as AgentCard, input.did, async (did) =>
			did === input.did
				? resolution.document
				: ((await engine.resolveDid(did)).didDocument as EngineDidDocument | null)
		);
		if (!signature.ok) reasons.push(...signature.reasons.map((reason) => `signature_${reason}`));
		if (anchoredDidOf(card) !== input.did) reasons.push('anchored_did_mismatch');
		return reasons.length === 0 ? result('pass') : result('fail', reasons);
	}

	private async checkStatus(
		engine: IdentityEngine,
		input: VerifyAgentInput,
		resolution: ResolvedDid | { error: string }
	): Promise<CheckResult> {
		if ('error' in resolution) return result('fail', ['did_unresolvable']);
		if (resolution.deactivated) return result('fail', ['did_deactivated']);
		const credentials = input.credentials ?? [];
		const reasons: string[] = [];
		let failed = false;
		for (const [position, compact] of credentials.entries()) {
			const outcome = await this.credentialStatus(engine, input.did, compact);
			if (outcome.kind === 'fail') failed = true;
			if (outcome.kind !== 'ok') reasons.push(`credential_${position}_${outcome.reason}`);
		}
		const details = { didActive: true, credentialsChecked: credentials.length };
		if (reasons.length === 0) return result('pass', [], details);
		// A list that cannot be read is an error (try again), not a verdict; anything provably wrong is a failure.
		return result(failed ? 'fail' : 'error', reasons, details);
	}

	private async verifyMandate(
		engine: IdentityEngine,
		input: VerifyAgentInput,
		resolution: ResolvedDid | { error: string }
	): Promise<CheckResult> {
		const mandate = input.mandate;
		if (!mandate) return result('skipped', ['no_mandate_presented']);
		if ('error' in resolution) return result('fail', ['did_unresolvable']);
		const decoded = decodeSdJwtUnverified(mandate.presentation);
		const issuerDid = typeof decoded?.payload.iss === 'string' ? decoded.payload.iss : undefined;
		if (!decoded || !issuerDid || !DID_CHEQD.test(issuerDid))
			return result('fail', ['mandate_issuer_not_did_cheqd']);
		if (decoded.payload.sub !== input.did) return result('fail', ['mandate_subject_is_not_this_agent']);
		const issuerKey = await this.issuerKey(engine, issuerDid, decoded.header.kid);
		if (!issuerKey) return result('fail', ['mandate_issuer_key_not_found']);

		const verification = await verifyOpenMandate({
			presentation: mandate.presentation,
			audience: mandate.audience,
			nonce: mandate.nonce,
			issuerPublicJwk: issuerKey,
			agentKeys: resolution.keys.map((key) => key.jwk),
			...(mandate.closedMandate ? { closedMandate: mandate.closedMandate as never } : {}),
			...(mandate.checkoutJwt ? { checkoutJwt: mandate.checkoutJwt } : {}),
			...(this.deps.now ? { now: Math.floor(this.deps.now().getTime() / 1000) } : {}),
		});
		const reasons = [...verification.reasons];
		if (verification.status) {
			const status = await this.readStatus(engine, verification.status.uri, verification.status.idx);
			if (status !== 'valid') reasons.push(`mandate_${status}`);
		}
		const details = { consumptionTracked: false, ...(verification.vct ? { vct: verification.vct } : {}) };
		return reasons.length === 0 ? result('pass', [], details) : result('fail', reasons, details);
	}

	// --- helpers ------------------------------------------------------------------------------------------

	private async credentialStatus(
		engine: IdentityEngine,
		agentDid: string,
		compact: string
	): Promise<{ kind: 'ok' } | { kind: 'fail' | 'error'; reason: string }> {
		const decoded = decodeSdJwtUnverified(compact);
		const issuerDid = typeof decoded?.payload.iss === 'string' ? decoded.payload.iss : undefined;
		if (!decoded || !issuerDid || !DID_CHEQD.test(issuerDid))
			return { kind: 'fail', reason: 'issuer_not_did_cheqd' };
		if (decoded.payload.sub !== agentDid) return { kind: 'fail', reason: 'subject_is_not_this_agent' };
		const key = await this.issuerKey(engine, issuerDid, decoded.header.kid);
		if (!key) return { kind: 'fail', reason: 'issuer_key_not_found' };
		try {
			await new SDJwtInstance<Record<string, unknown>>({
				verifier: jwkVerifier(key),
				hasher: sha256Hasher,
			}).verify(compact);
		} catch {
			return { kind: 'fail', reason: 'signature_or_expiry_invalid' };
		}
		const status = readStatusClaim(decoded.payload);
		if (!status) return { kind: 'fail', reason: 'no_status_entry' };
		const state = await this.readStatus(engine, status.uri, status.idx);
		if (state === 'valid') return { kind: 'ok' };
		return { kind: state === 'unverifiable' ? 'error' : 'fail', reason: state };
	}

	private async readStatus(
		engine: IdentityEngine,
		uri: string,
		index: number
	): Promise<'valid' | 'revoked' | 'suspended' | 'unverifiable'> {
		if (typeof engine.getTokenStatus !== 'function') return 'unverifiable';
		try {
			const reading = await engine.getTokenStatus(uri, index);
			if (!reading.verified) return 'unverifiable';
			if (reading.status === 0) return 'valid';
			return reading.status === 2 ? 'suspended' : 'revoked';
		} catch {
			return 'unverifiable';
		}
	}

	/** The issuer's key for the token's `kid`. The `kid` must sit under the issuer DID; the key comes from the DID document. */
	private async issuerKey(engine: IdentityEngine, issuerDid: string, kid: unknown): Promise<PublicJwk | null> {
		if (typeof kid !== 'string' || !kid.startsWith(`${issuerDid}#`)) return null;
		const resolved = await this.safely(() => resolveDidKeys(engine, issuerDid));
		if ('error' in resolved || resolved.deactivated) return null;
		return resolved.keys.find((key) => key.kid === kid)?.jwk ?? null;
	}

	private async latestPublishedCard(
		engine: IdentityEngine,
		did: string
	): Promise<{ resourceId: string; version: string | null; card: Record<string, unknown> | null } | null> {
		try {
			const resolution = await engine.resolveDid(did, { resourceMetadata: true });
			const metadata = resolution.didDocumentMetadata as JsonObject & { linkedResourceMetadata?: JsonObject[] };
			const cards = (metadata.linkedResourceMetadata ?? [])
				.filter(
					(resource) =>
						resource.resourceType === AGENT_CARD_RESOURCE_TYPE && typeof resource.resourceId === 'string'
				)
				.sort((a, b) => String(b.created ?? '').localeCompare(String(a.created ?? '')));
			const latest = cards[0];
			if (!latest) return null;
			const response = await engine.resolve(`${did}/resources/${latest.resourceId as string}`, true);
			const card = response.ok ? ((await response.json()) as Record<string, unknown>) : null;
			return {
				resourceId: latest.resourceId as string,
				version: (latest.version as string | undefined) ?? null,
				card,
			};
		} catch {
			return null;
		}
	}

	private async safely<T>(read: () => Promise<T>): Promise<T | { error: string }> {
		try {
			return await read();
		} catch (error) {
			return { error: error instanceof Error ? error.message : 'unknown' };
		}
	}

	private async record(
		customer: CustomerEntity,
		did: string,
		checks: Partial<Record<VerifyCheckName, CheckResult>>,
		verdict: VerifyVerdict,
		engine: string
	): Promise<string | null> {
		try {
			// Outcomes and reason codes only: no credential, card or mandate content is stored.
			const summary = Object.fromEntries(
				Object.entries(checks).map(([name, check]) => [
					name,
					{ outcome: check?.outcome, reasons: check?.reasons },
				])
			);
			return await this.deps.store.recordVerificationEvent({
				customerId: customer.customerId,
				subjectDid: did,
				checks: summary,
				verdict,
				engine,
			});
		} catch (error) {
			console.error('verificationEvent not written:', error instanceof Error ? error.message : error);
			return null;
		}
	}
}

export function verdictOf(checks: Array<CheckResult | undefined>): VerifyVerdict {
	const outcomes = checks.map((check) => check?.outcome);
	if (outcomes.includes('fail')) return 'failed';
	if (outcomes.includes('error')) return 'inconclusive';
	return outcomes.includes('pass') ? 'verified' : 'inconclusive';
}

function anchoredDidOf(card: Record<string, unknown>): string | undefined {
	const capabilities = card.capabilities as
		| { extensions?: Array<{ uri?: string; params?: { anchoredDid?: unknown } }> }
		| undefined;
	const extension = capabilities?.extensions?.find((candidate) => candidate.uri === CHEQD_TRUST_EXTENSION_URI);
	return typeof extension?.params?.anchoredDid === 'string' ? extension.params.anchoredDid : undefined;
}
