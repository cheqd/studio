import { Connection } from '../../database/connection/connection.js';
import { OperationNameEnum } from '../../types/constants.js';
import { captureActivationEvent } from './posthog.js';

/**
 * Activation milestones (cheqd/studio#869): the first time a customer does each of these. Each maps to one column
 * of `customerActivation`, and to the PostHog event of the same name.
 */
export const ACTIVATION_MILESTONES = {
	first_did_created: 'firstDidCreatedAt',
	first_credential_issued: 'firstCredentialIssuedAt',
	first_agent_registered: 'firstAgentRegisteredAt',
	first_status_list_created: 'firstStatusListCreatedAt',
} as const;
export type ActivationMilestone = keyof typeof ACTIVATION_MILESTONES;

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
		// The column name comes from the constant map above, never from input
		const rows = (await Connection.instance.dbConnection.query(
			`INSERT INTO "customerActivation" ("customerId", "${column}") VALUES ($1, now())
			 ON CONFLICT ("customerId") DO UPDATE SET "${column}" = now(), "updatedAt" = now()
			 WHERE "customerActivation"."${column}" IS NULL
			 RETURNING "customerId", (SELECT "source" FROM "customer" WHERE "customerId" = $1) AS "source"`,
			[customerId]
		)) as Array<{ customerId: string; source: string | null }>;
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
