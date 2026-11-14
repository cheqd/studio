import type { MandatePolicySummary } from '../../types/agent.js';

/**
 * A short, human-readable line for an authority grant, built from what Studio keeps of its policy. One pure
 * function so no client builds this text itself. It never includes a secret or any part of a credential.
 *
 * Examples: `Up to 50 USD per week, supplies`, `Acts for did:cheqd:testnet:...`, `Tools: search, fetch`,
 * `Delegation (KYA-OS), depth 1`.
 */

export interface GrantSummaryInput {
	grantType: string;
	/** The DID that issued the grant: for `acts-for`, the DID the agent acts for. */
	issuerDid?: string | null;
	/** Tool names, scopes or mandate constraints kept at grant time. May be missing on older grants. */
	claims?: Record<string, unknown> | null;
	/** The non-secret summary of an open payment mandate. Missing on older grants and on checkout mandates. */
	policySummary?: MandatePolicySummary | null;
}

const MAX_ITEM = 64;
const MAX_LISTED = 5;
const MAX_LINE = 240;

/** Currencies with no minor unit: AP2 amounts in these are already whole units. */
const ZERO_DECIMAL = new Set(['JPY', 'KRW', 'VND', 'CLP', 'ISK', 'UGX', 'XAF', 'XOF', 'XPF', 'PYG', 'RWF']);

const EVERY: Record<string, string> = {
	DAILY: 'per day',
	WEEKLY: 'per week',
	BIWEEKLY: 'every two weeks',
	MONTHLY: 'per month',
	QUARTERLY: 'per quarter',
	ANNUALLY: 'per year',
};

/** Plain text for display: control characters out, length bounded. Caller-supplied names go through this. */
function clean(value: string, max = MAX_ITEM): string {
	const text = value.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
	return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function list(values: unknown): string | null {
	if (!Array.isArray(values)) return null;
	const names = values.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map((v) => clean(v));
	if (names.length === 0) return null;
	const shown = names.slice(0, MAX_LISTED).join(', ');
	return names.length > MAX_LISTED ? `${shown} and ${names.length - MAX_LISTED} more` : shown;
}

function amount(value: number, currency: string, minorUnits: boolean): string {
	const code = clean(currency, 8).toUpperCase();
	const major = minorUnits && !ZERO_DECIMAL.has(code) ? value / 100 : value;
	const text = Number.isInteger(major) ? String(major) : major.toFixed(2);
	return `${text} ${code}`;
}

function summariseMandate(policy: MandatePolicySummary | null | undefined): string {
	if (!policy) return 'Payment mandate';
	const parts: string[] = [];
	const every = policy.recurrence ? EVERY[policy.recurrence.frequency] : undefined;
	if (policy.amountRange) {
		parts.push(
			`Up to ${amount(policy.amountRange.max, policy.amountRange.currency, true)}${every ? ` ${every}` : ''}`
		);
	} else if (policy.budget) {
		parts.push(`Budget ${amount(policy.budget.max, policy.budget.currency, false)}${every ? ` ${every}` : ''}`);
	}
	if (policy.amountRange && policy.budget) {
		parts.push(`budget ${amount(policy.budget.max, policy.budget.currency, false)}`);
	}
	const payees = list(policy.payees);
	if (payees) parts.push(payees);
	if (policy.executionWindow?.notAfter) parts.push(`until ${clean(policy.executionWindow.notAfter, 32)}`);
	return parts.length > 0 ? parts.join(', ') : 'Payment mandate';
}

export function summariseGrant(input: GrantSummaryInput): string {
	let line: string;
	switch (input.grantType) {
		case 'acts-for':
			line = input.issuerDid ? `Acts for ${clean(input.issuerDid, 128)}` : 'Acts for your organisation';
			break;
		case 'tool-scope': {
			const tools = list(input.claims?.tools);
			line = tools ? `Tools: ${tools}` : 'Tool scope';
			break;
		}
		case 'mandate':
			line = summariseMandate(input.policySummary);
			break;
		case 'delegation':
			// Single hop only, so the depth is always 1.
			line = 'Delegation (KYA-OS), depth 1';
			break;
		default:
			line = 'Authority grant';
	}
	return line.length > MAX_LINE ? `${line.slice(0, MAX_LINE - 1)}…` : line;
}
