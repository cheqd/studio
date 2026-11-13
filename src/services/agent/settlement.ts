import type { MandatePolicySummary } from '../../types/agent.js';
import type { OpenMandateRequest } from './ap2-mandate.js';

/**
 * The settlement view (Proposed): an agent's open AP2 payment mandate expressed as an x402 payment policy.
 * Read-only and single hop. `PaymentAddressBinding` and this policy shape are cheqd's own vocabulary, not x402 standards.
 */

/** The non-secret summary of a validated open payment mandate request, or null for a checkout mandate. */
export function summariseMandate(mandate: OpenMandateRequest): MandatePolicySummary | null {
	if (mandate.type !== 'payment') return null;
	const summary: MandatePolicySummary = {
		mandateType: 'payment',
		amountRange: null,
		budget: null,
		recurrence: null,
		payees: null,
		executionWindow: null,
	};
	for (const c of mandate.constraints) {
		switch (c.type) {
			case 'payment.amount_range':
				summary.amountRange = {
					currency: c.currency as string,
					max: c.max as number,
					...(c.min !== undefined ? { min: c.min as number } : {}),
				};
				break;
			case 'payment.budget':
				summary.budget = { currency: c.currency as string, max: c.max as number };
				break;
			case 'payment.agent_recurrence':
				summary.recurrence = {
					frequency: c.frequency as string,
					maxOccurrences: (c.max_occurrences as number | undefined) ?? null,
				};
				break;
			case 'payment.allowed_payees':
				summary.payees = (c.allowed as Array<{ name: string }>).map((payee) => payee.name);
				break;
			case 'payment.execution_date':
				summary.executionWindow = {
					notBefore: (c.not_before as string | undefined) ?? null,
					notAfter: (c.not_after as string | undefined) ?? null,
				};
				break;
			default:
				break;
		}
	}
	return summary;
}

export interface SettlementView {
	label: 'Proposed';
	readOnly: true;
	note: string;
	agentId: string;
	agentStatus: string;
	mandate: { id: string; type: 'payment'; issuedAt: Date; expiresAt: Date | null };
	policy: {
		capPerPayment: { currency: string; max: number; min: number | null; unit: 'minor' } | null;
		budget: { currency: string; max: number; unit: 'major' } | null;
		repeats: { frequency: string; maxOccurrences: number | null } | null;
		payees: string[] | null;
		window: { notBefore: string | null; notAfter: string | null } | null;
	};
	payFrom: Array<{ bindingId: string; account: string }>;
}

export const SETTLEMENT_NOTE =
	"Proposed. A read-only view of the open AP2 payment mandate as an x402 payment policy, and the payment addresses bound to the agent. The vocabulary is cheqd's own, not an x402 standard. AP2 amounts are fiat currency codes; mapping to an x402 asset is not done here. Single hop only.";

export function buildSettlementView(input: {
	agentId: string;
	agentStatus: string;
	grant: { id: string; createdAt: Date; expiresAt?: Date | null };
	summary: MandatePolicySummary;
	bindings: Array<{ id: string; account: string }>;
}): SettlementView {
	const { summary } = input;
	return {
		label: 'Proposed',
		readOnly: true,
		note: SETTLEMENT_NOTE,
		agentId: input.agentId,
		agentStatus: input.agentStatus,
		mandate: {
			id: input.grant.id,
			type: 'payment',
			issuedAt: input.grant.createdAt,
			expiresAt: input.grant.expiresAt ?? null,
		},
		policy: {
			capPerPayment: summary.amountRange
				? {
						currency: summary.amountRange.currency,
						max: summary.amountRange.max,
						min: summary.amountRange.min ?? null,
						unit: 'minor',
					}
				: null,
			budget: summary.budget ? { ...summary.budget, unit: 'major' } : null,
			repeats: summary.recurrence ? { ...summary.recurrence } : null,
			payees: summary.payees,
			window: summary.executionWindow,
		},
		payFrom: input.bindings.map((binding) => ({ bindingId: binding.id, account: binding.account })),
	};
}
