import {
	CheckoutMandateChain,
	PaymentMandateChain,
	verifyOpenCheckoutMandatePresentation,
	verifyOpenPaymentMandatePresentation,
	verifySameKeyContinuity,
	verifyTransactionDataBinding,
} from '@cheqd/agent-identity-ap2';
import type {
	CheckoutMandate,
	OpenCheckoutMandate,
	OpenPaymentMandate,
	PaymentMandate,
	VerifiedOpenMandatePresentation,
} from '@cheqd/agent-identity-ap2';
import { VCT } from '../../types/agent.js';
import type { PublicJwk } from './agent-keys.js';

/**
 * AP2 open mandates, SINGLE HOP ONLY.
 *
 * The toolkit deliberately leaves out AP2's multi-hop delegation chain (an unratified draft), so a mandate here
 * is issued by the organisation to one agent, bound to that agent's key (`cnf`), and nothing in the request can
 * ask for re-delegation to a sub-agent: unknown keys are refused rather than ignored.
 */

export type MandateType = 'payment' | 'checkout';

export interface OpenMandateRequest {
	type: MandateType;
	constraints: Array<Record<string, unknown>>;
}

const PAYMENT_CONSTRAINTS: Record<string, (c: Record<string, unknown>) => string | null> = {
	'payment.amount_range': (c) =>
		onlyKeys(c, ['type', 'currency', 'max', 'min']) ??
		(isCurrency(c.currency) && isNonNegInt(c.max) && (c.min === undefined || isNonNegInt(c.min))
			? null
			: 'payment.amount_range needs currency, an integer max and an optional integer min (minor units)'),
	'payment.allowed_payees': (c) =>
		onlyKeys(c, ['type', 'allowed']) ??
		(areMerchants(c.allowed) ? null : 'payment.allowed_payees needs a list of merchants'),
	'payment.agent_recurrence': (c) =>
		onlyKeys(c, ['type', 'frequency', 'max_occurrences']) ??
		(typeof c.frequency === 'string' &&
		['ON_DEMAND', 'DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY'].includes(c.frequency) &&
		(c.max_occurrences === undefined || isNonNegInt(c.max_occurrences))
			? null
			: 'payment.agent_recurrence needs a frequency and an optional max_occurrences'),
	'payment.budget': (c) =>
		onlyKeys(c, ['type', 'max', 'currency']) ??
		(typeof c.max === 'number' && c.max >= 0 && isCurrency(c.currency)
			? null
			: 'payment.budget needs currency and a max in major units'),
	'payment.execution_date': (c) =>
		onlyKeys(c, ['type', 'not_before', 'not_after']) ??
		((c.not_before === undefined || isIsoDate(c.not_before)) &&
		(c.not_after === undefined || isIsoDate(c.not_after))
			? null
			: 'payment.execution_date needs ISO 8601 not_before and not_after'),
	'payment.allowed_payment_instruments': (c) =>
		onlyKeys(c, ['type', 'allowed']) ??
		(Array.isArray(c.allowed) &&
		c.allowed.length > 0 &&
		c.allowed.every((i) => isRecord(i) && typeof i.id === 'string' && typeof i.type === 'string')
			? null
			: 'payment.allowed_payment_instruments needs a list of instruments with id and type'),
	'payment.allowed_pisps': (c) =>
		onlyKeys(c, ['type', 'allowed']) ??
		(Array.isArray(c.allowed) &&
		c.allowed.length > 0 &&
		c.allowed.every(
			(p) =>
				isRecord(p) &&
				typeof p.legal_name === 'string' &&
				typeof p.brand_name === 'string' &&
				typeof p.domain_name === 'string'
		)
			? null
			: 'payment.allowed_pisps needs a list of PISPs with legal_name, brand_name and domain_name'),
	'payment.reference': (c) =>
		onlyKeys(c, ['type', 'conditional_transaction_id']) ??
		(typeof c.conditional_transaction_id === 'string'
			? null
			: 'payment.reference needs conditional_transaction_id'),
};

const CHECKOUT_CONSTRAINTS: Record<string, (c: Record<string, unknown>) => string | null> = {
	'checkout.allowed_merchants': (c) =>
		onlyKeys(c, ['type', 'allowed']) ??
		(areMerchants(c.allowed) ? null : 'checkout.allowed_merchants needs a list of merchants'),
	'checkout.line_items': (c) =>
		onlyKeys(c, ['type', 'items']) ??
		(Array.isArray(c.items) && c.items.length > 0 && c.items.every(isLineItemRequirement)
			? null
			: 'checkout.line_items needs a list of requirements with id, acceptable_items and quantity'),
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
const isNonNegInt = (value: unknown): boolean => Number.isInteger(value) && (value as number) >= 0;
const isCurrency = (value: unknown): boolean => typeof value === 'string' && /^[A-Z]{3}$/.test(value);
const isIsoDate = (value: unknown): boolean => typeof value === 'string' && !Number.isNaN(Date.parse(value));
const areMerchants = (value: unknown): boolean =>
	Array.isArray(value) && value.length > 0 && value.every((m) => isRecord(m) && typeof m.name === 'string');
const isLineItemRequirement = (value: unknown): boolean =>
	isRecord(value) &&
	typeof value.id === 'string' &&
	isNonNegInt(value.quantity) &&
	Array.isArray(value.acceptable_items) &&
	value.acceptable_items.every((i) => isRecord(i) && typeof i.id === 'string' && typeof i.title === 'string');

function onlyKeys(value: Record<string, unknown>, allowed: string[]): string | null {
	const extra = Object.keys(value).filter((key) => !allowed.includes(key));
	return extra.length === 0 ? null : `Unexpected field(s) in ${String(value.type)}: ${extra.join(', ')}`;
}

/** Keys that would mean re-delegation or a caller-chosen key binding. Named so the error says why. */
const FORBIDDEN_REQUEST_KEYS = [
	'cnf',
	'delegate',
	'delegateTo',
	'delegatee',
	'subAgent',
	'subAgents',
	'parent',
	'parentMandate',
	'chain',
	'delegationChain',
	'delegation_chain',
	'redelegation',
];

export type MandateRequestValidation = { ok: true; mandate: OpenMandateRequest } | { ok: false; error: string };

export function validateOpenMandateRequest(input: unknown): MandateRequestValidation {
	if (!isRecord(input)) return { ok: false, error: 'mandate must be an object' };
	const forbidden = FORBIDDEN_REQUEST_KEYS.filter((key) => key in input);
	if (forbidden.length > 0) {
		return {
			ok: false,
			error: `Single hop only: AP2 re-delegation to sub-agents is not supported and the key binding is always the agent's own key (${forbidden.join(', ')})`,
		};
	}
	const extra = Object.keys(input).filter((key) => !['type', 'constraints'].includes(key));
	if (extra.length > 0) return { ok: false, error: `Unexpected mandate field(s): ${extra.join(', ')}` };
	if (input.type !== 'payment' && input.type !== 'checkout')
		return { ok: false, error: "mandate.type must be 'payment' or 'checkout'" };
	if (!Array.isArray(input.constraints) || input.constraints.length === 0 || input.constraints.length > 20) {
		return { ok: false, error: 'mandate.constraints must be a list of 1 to 20 constraints' };
	}
	const table = input.type === 'payment' ? PAYMENT_CONSTRAINTS : CHECKOUT_CONSTRAINTS;
	for (const constraint of input.constraints) {
		if (!isRecord(constraint) || typeof constraint.type !== 'string')
			return { ok: false, error: 'Every constraint needs a type' };
		const check = table[constraint.type];
		if (!check) return { ok: false, error: `Unsupported ${input.type} constraint type: ${constraint.type}` };
		const problem = check(constraint);
		if (problem) return { ok: false, error: problem };
	}
	return {
		ok: true,
		mandate: { type: input.type, constraints: input.constraints as Array<Record<string, unknown>> },
	};
}

export interface MandateVerificationInput {
	/** SD-JWT presentation with a Key Binding JWT: `<issuer-jwt>~<disclosures>~<kb-jwt>`. */
	presentation: string;
	audience: string;
	nonce: string;
	/** The issuer's public key, resolved from the issuer DID by the caller, never read from the token. */
	issuerPublicJwk: Record<string, unknown>;
	/** The agent's keys from its DID document: the mandate's `cnf` must be one of them. */
	agentKeys: PublicJwk[];
	/** Epoch seconds, for tests. */
	now?: number;
	/** A closed mandate to check against the open one (one transaction). */
	closedMandate?: PaymentMandate | CheckoutMandate;
	/** The merchant-signed checkout JWT, for a checkout mandate chain. */
	checkoutJwt?: string;
}

export interface MandateVerification {
	ok: boolean;
	reasons: string[];
	vct?: string;
	/** `status.status_list` of the open mandate, for the caller to read against the list. */
	status?: { idx: number; uri: string };
	issuer?: string;
	subject?: string;
}

/**
 * Verifies a presented open mandate with the toolkit: SD-JWT VC signature against the pinned issuer key, Key
 * Binding JWT (audience, nonce, `cnf`), key continuity with the agent's DID document, and, when a closed mandate
 * is given, the transaction binding and every constraint. Consumption (budget and recurrence totals) is not
 * tracked here: the toolkit's store is file-based and Studio runs more than one replica.
 */
export async function verifyOpenMandate(input: MandateVerificationInput): Promise<MandateVerification> {
	const verify = (token: string, vct: string | undefined) => {
		const options = {
			token,
			issuerPublicJwk: input.issuerPublicJwk,
			expectedAudience: input.audience,
			expectedNonce: input.nonce,
			...(input.now !== undefined ? { currentDate: input.now } : {}),
		};
		return vct === VCT.checkoutOpenMandate
			? verifyOpenCheckoutMandatePresentation(options)
			: verifyOpenPaymentMandatePresentation(options);
	};
	const vct = peekVct(input.presentation);
	if (vct !== VCT.paymentOpenMandate && vct !== VCT.checkoutOpenMandate)
		return { ok: false, reasons: ['unsupported_vct'] };

	let verified: VerifiedOpenMandatePresentation<OpenPaymentMandate | OpenCheckoutMandate>;
	try {
		verified = await verify(input.presentation, vct);
	} catch (error) {
		return {
			ok: false,
			reasons: [`presentation_invalid: ${error instanceof Error ? error.message : 'unknown'}`],
			vct,
		};
	}

	const reasons: string[] = [];
	const continuity = await Promise.all(input.agentKeys.map((key) => verifySameKeyContinuity(verified.cnfJwk, key)));
	if (!continuity.some((result) => result.ok)) reasons.push('cnf_not_an_agent_key');

	if (input.closedMandate) {
		if (!verifyTransactionDataBinding(verified.keyBinding, input.closedMandate))
			reasons.push('closed_mandate_not_bound_by_kb_jwt');
		if (vct === VCT.paymentOpenMandate) {
			const chain = PaymentMandateChain.parse([
				verified.payload as OpenPaymentMandate,
				input.closedMandate as PaymentMandate,
			]);
			reasons.push(...chain.verify());
		} else if (input.checkoutJwt) {
			const chain = CheckoutMandateChain.parse([
				verified.payload as OpenCheckoutMandate,
				input.closedMandate as CheckoutMandate,
			]);
			reasons.push(...chain.verify(input.checkoutJwt));
		} else {
			reasons.push('checkout_jwt_required');
		}
	}

	const payload = verified.payload as unknown as Record<string, unknown>;
	const status = readStatusClaim(payload);
	return {
		ok: reasons.length === 0,
		reasons,
		vct,
		...(status ? { status } : {}),
		...(typeof payload.iss === 'string' ? { issuer: payload.iss } : {}),
		...(typeof payload.sub === 'string' ? { subject: payload.sub } : {}),
	};
}

function peekVct(presentation: string): string | undefined {
	try {
		const payload = JSON.parse(
			Buffer.from((presentation.split('~')[0] ?? '').split('.')[1] ?? '', 'base64url').toString('utf8')
		);
		return typeof payload?.vct === 'string' ? payload.vct : undefined;
	} catch {
		return undefined;
	}
}

/** `status.status_list.{idx,uri}` of an SD-JWT VC (Token Status List draft). */
export function readStatusClaim(payload: Record<string, unknown>): { idx: number; uri: string } | undefined {
	const status = payload.status;
	if (!isRecord(status) || !isRecord(status.status_list)) return undefined;
	const { idx, uri } = status.status_list;
	return Number.isInteger(idx) && typeof uri === 'string' ? { idx: idx as number, uri } : undefined;
}
