import { Connection } from '../../database/connection/connection.js';
import { OperationNameEnum } from '../../types/constants.js';
import { captureActivationEvent } from './posthog.js';

/**
 * Activation milestones (cheqd/studio#869): the first time a customer does each of these. Each maps to one column
 * of `customerActivation`. The first four also send the PostHog event of the same name; the PostHog allow-list
 * keeps the others (API key, faucet, first API call) in Studio only.
 */
export const ACTIVATION_MILESTONES = {
	first_did_created: 'firstDidCreatedAt',
	first_credential_issued: 'firstCredentialIssuedAt',
	first_agent_registered: 'firstAgentRegisteredAt',
	first_status_list_created: 'firstStatusListCreatedAt',
	first_api_key_created: 'firstApiKeyCreatedAt',
	first_faucet_request: 'firstFaucetRequestAt',
	first_api_call: 'firstApiCallAt',
} as const;
export type ActivationMilestone = keyof typeof ACTIVATION_MILESTONES;

/**
 * `first_api_call` is recorded on every tracked operation, so this process remembers the customers it has already
 * seen recorded and skips the statement for them. Only a confirmed outcome (stamped now, or already stamped) is
 * remembered, never a failure. The set is cleared when it grows past the cap, which only costs one more no-op
 * statement per customer.
 */
const HOT_MILESTONES: ReadonlySet<ActivationMilestone> = new Set<ActivationMilestone>(['first_api_call']);
const SEEN_CAP = 50_000;
const seen = new Set<string>();

/** For tests: forget which customers this process has already seen recorded. */
export function resetActivationCacheForTests(): void {
	seen.clear();
}

/**
 * Records that a customer reached a milestone, once. Idempotent: the first call stamps the time, later calls change
 * nothing. It never throws and never waits on anything but one small statement, so a creation path can call it
 * without awaiting or guarding it: a failure is logged and the request carries on.
 *
 * Returns true when this call recorded the milestone (and so sent the optional PostHog event).
 */
export async function recordActivation(
	customerId: string | undefined,
	milestone: ActivationMilestone
): Promise<boolean> {
	try {
		const column = ACTIVATION_MILESTONES[milestone];
		if (!customerId || !column) return false;
		const hot = HOT_MILESTONES.has(milestone);
		const cacheKey = `${customerId}:${milestone}`;
		if (hot && seen.has(cacheKey)) return false;
		// The column name comes from the constant map above, never from input
		const rows = (await Connection.instance.dbConnection.query(
			`INSERT INTO "customerActivation" ("customerId", "${column}") VALUES ($1, now())
			 ON CONFLICT ("customerId") DO UPDATE SET "${column}" = now(), "updatedAt" = now()
			 WHERE "customerActivation"."${column}" IS NULL
			 RETURNING "customerId", (SELECT "source" FROM "customer" WHERE "customerId" = $1) AS "source"`,
			[customerId]
		)) as Array<{ customerId: string; source: string | null }>;
		if (hot) {
			if (seen.size >= SEEN_CAP) seen.clear();
			seen.add(cacheKey);
		}
		if (rows.length === 0) return false;
		captureActivationEvent(customerId, milestone, { source: rows[0].source ?? undefined });
		return true;
	} catch (error) {
		console.warn(`recordActivation(${milestone}) failed: ${(error as Error)?.message || error}`);
		return false;
	}
}

const ACTIVATION_BY_OPERATION: Partial<Record<string, ActivationMilestone>> = {
	[OperationNameEnum.DID_CREATE]: 'first_did_created',
	[OperationNameEnum.CREDENTIAL_ISSUE]: 'first_credential_issued',
	[OperationNameEnum.CREDENTIAL_STATUS_CREATE_UNENCRYPTED]: 'first_status_list_created',
	[OperationNameEnum.CREDENTIAL_STATUS_CREATE_ENCRYPTED]: 'first_status_list_created',
};

/** The activation milestone an operation counts towards, if any. */
export function activationMilestoneFor(operationName: string): ActivationMilestone | undefined {
	return ACTIVATION_BY_OPERATION[operationName];
}
