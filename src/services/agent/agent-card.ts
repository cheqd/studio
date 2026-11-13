import { canonicalizeAgentCard, verifyAgentCardSignature } from '@a2a-js/sdk';
import type { AgentCard } from '@a2a-js/sdk';
import { createRetrievePublicKey } from '@cheqd/agent-identity';
import type { MinimalDidDocument } from '@cheqd/agent-identity';
import { fromString, toString } from 'uint8arrays';
import type { EngineDidDocument, EngineSigningAlg } from '../identity/engine/types.js';

/** The cheqd trust extension of the A2A binding: it carries the DID that anchors the card. */
export const CHEQD_TRUST_EXTENSION_URI = 'https://cheqd.io/a2a/ext/trust/v1';

/** DID-Linked Resource type the published card goes under. */
export const AGENT_CARD_RESOURCE_TYPE = 'A2AAgentCard';

export interface AgentCardSkillInput {
	id: string;
	name: string;
	description?: string;
	tags?: string[];
	examples?: string[];
}

/** What a caller may put in a card. Everything else (DID, signatures, trust extension) is set by Studio. */
export interface AgentCardInput {
	/** Where the agent serves A2A. Must be https. */
	endpoint: string;
	protocolBinding?: 'JSONRPC' | 'GRPC' | 'HTTP+JSON';
	description?: string;
	version?: string;
	skills?: AgentCardSkillInput[];
	streaming?: boolean;
	pushNotifications?: boolean;
	provider?: { organization: string; url: string };
	documentationUrl?: string;
	defaultInputModes?: string[];
	defaultOutputModes?: string[];
}

export function buildAgentCard(
	agent: { did: string; name: string; description?: string | null },
	input: AgentCardInput
) {
	const card = {
		name: agent.name,
		description: input.description ?? agent.description ?? agent.name,
		version: input.version ?? '1.0.0',
		supportedInterfaces: [
			{
				url: input.endpoint,
				protocolBinding: input.protocolBinding ?? 'JSONRPC',
				tenant: '',
				protocolVersion: '1.0',
			},
		],
		capabilities: {
			streaming: input.streaming ?? false,
			pushNotifications: input.pushNotifications ?? false,
			extensions: [
				{
					uri: CHEQD_TRUST_EXTENSION_URI,
					description: 'The did:cheqd identifier that anchors this agent card',
					required: false,
					params: { anchoredDid: agent.did },
				},
			],
		},
		securitySchemes: {},
		securityRequirements: [],
		defaultInputModes: input.defaultInputModes ?? ['text/plain'],
		defaultOutputModes: input.defaultOutputModes ?? ['text/plain'],
		skills: (input.skills ?? []).map((skill) => ({
			id: skill.id,
			name: skill.name,
			description: skill.description ?? skill.name,
			tags: skill.tags ?? [],
			examples: skill.examples ?? [],
			inputModes: [],
			outputModes: [],
			securityRequirements: [],
		})),
		...(input.provider ? { provider: input.provider } : {}),
		...(input.documentationUrl ? { documentationUrl: input.documentationUrl } : {}),
		signatures: [],
	};
	return card as unknown as AgentCard;
}

export interface CardSigner {
	did: string;
	/** The verification method DID URL. */
	kid: string;
	alg: EngineSigningAlg;
	sign(data: Uint8Array): Promise<Uint8Array>;
}

export interface SignedAgentCard {
	card: AgentCard;
	/** Detached compact JWS (`protected..signature`) for people who want it outside the card. */
	jws: string;
}

/**
 * Signs a card as the A2A spec says (section 8.4: a JWS in flattened form over the JCS form of the card, with
 * `alg`, `kid` and `typ` in the protected header). The private key stays in the engine: only the signing input
 * goes in and only the signature comes back. The result is checked with the same verifier a counterparty would
 * use before it is returned.
 */
export async function signAgentCard(
	card: AgentCard,
	signer: CardSigner,
	resolveDidDocument: DidDocumentResolver
): Promise<SignedAgentCard> {
	const protectedHeader = toString(
		fromString(JSON.stringify({ alg: signer.alg, kid: signer.kid, typ: 'JOSE' })),
		'base64url'
	);
	const payload = toString(fromString(canonicalizeAgentCard(card)), 'base64url');
	const signature = toString(await signer.sign(fromString(`${protectedHeader}.${payload}`)), 'base64url');
	const signed = { ...card, signatures: [{ protected: protectedHeader, signature }] } as unknown as AgentCard;

	const check = await verifyAgentCardForDid(signed, signer.did, resolveDidDocument);
	if (!check.ok) {
		throw new Error(
			`The engine's signature does not verify against the DID document (${check.reasons.join(', ')})`
		);
	}
	return { card: signed, jws: `${protectedHeader}..${signature}` };
}

export type DidDocumentResolver = (did: string) => Promise<EngineDidDocument | null>;

export interface CardVerification {
	ok: boolean;
	reasons: string[];
}

/**
 * Verifies a card against the DID that is expected to have signed it. Uses the toolkit's key resolver, which
 * ignores the signer-supplied `jku`, resolves strictly by `kid`, and rejects a `kid` outside `expectedDid`; the
 * SDK accepts a card if any one signature verifies, so every `kid` has to be pinned to the same DID first.
 * Only `did:cheqd` resolves, through the engine: `did:web` is refused until the shared fetch wrapper that blocks
 * internal destinations (A-062) exists.
 */
export async function verifyAgentCardForDid(
	card: AgentCard,
	expectedDid: string,
	resolveDidDocument: DidDocumentResolver
): Promise<CardVerification> {
	if (!expectedDid.startsWith('did:cheqd:')) return { ok: false, reasons: ['unsupported_did_method'] };
	const signatures = (card as { signatures?: unknown }).signatures;
	if (!Array.isArray(signatures) || signatures.length === 0) return { ok: false, reasons: ['no_signatures'] };

	const retrievePublicKey = createRetrievePublicKey({
		expectedDid,
		resolveDidCheqd: async (did) => (await resolveDidDocument(did)) as MinimalDidDocument | null,
		// did:web is not reachable from here: this is never called for a did:cheqd kid, and any did:web kid is
		// rejected by the expectedDid pin before resolution.
		fetchDidWebDocument: async () => {
			throw new Error('did:web resolution is disabled');
		},
	});
	let lastReason = 'no_valid_signature';
	const pinned: typeof retrievePublicKey = async (kid, jku) => {
		try {
			return await retrievePublicKey(kid, jku);
		} catch (error) {
			lastReason = error instanceof Error ? error.message : 'key_resolution_failed';
			throw error;
		}
	};
	try {
		await verifyAgentCardSignature(pinned)(card);
		return { ok: true, reasons: [] };
	} catch {
		return { ok: false, reasons: [lastReason] };
	}
}
