import { Connection } from '../../database/connection/connection.js';
import { credentialScreensMode, type CredentialScreenMode, type FlagRow } from './feature-flag.js';

/**
 * Decides whether a customer sees the portal's credential screens (issue, verify, issued credentials, status lists).
 *
 * The screens are kept for customers who already use them, without putting them in front of new customers:
 * - a staff override (`credentialScreens` flag, mode `on` or `off`) always wins;
 * - otherwise (`auto`) the customer sees them when they have history: they have ever issued a credential, created a
 *   status list, or verified a credential, before `CREDENTIAL_SCREENS_HISTORY_CUTOFF` (an ISO date, set to the
 *   release date so the rule does not change under people afterwards). With no cutoff set, all history counts.
 */

export type CredentialScreensSource = 'flag' | 'history' | 'default';
export interface CredentialScreensDecision {
	enabled: boolean;
	mode: CredentialScreenMode;
	source: CredentialScreensSource;
}

export function historyCutoff(env: { CREDENTIAL_SCREENS_HISTORY_CUTOFF?: string } = process.env): Date | undefined {
	const raw = env.CREDENTIAL_SCREENS_HISTORY_CUTOFF;
	if (!raw) return undefined;
	const date = new Date(raw);
	if (Number.isNaN(date.getTime())) {
		console.warn('CREDENTIAL_SCREENS_HISTORY_CUTOFF is not a date; counting all history');
		return undefined;
	}
	return date;
}

/** One read: has this customer ever issued, listed or verified (before the cutoff)? */
export type HistoryLookup = (customerId: string, cutoff: Date | undefined) => Promise<boolean>;

export const databaseHistoryLookup: HistoryLookup = async (customerId, cutoff) => {
	const rows = (await Connection.instance.dbConnection.query(
		`SELECT (
			EXISTS (SELECT 1 FROM "issuedCredential" WHERE "customerId" = $1 AND ($2::timestamptz IS NULL OR "createdAt" < $2))
			OR EXISTS (SELECT 1 FROM "statusRegistry" WHERE "customerId" = $1 AND ($2::timestamptz IS NULL OR "createdAt" < $2))
			OR EXISTS (SELECT 1 FROM "operation" WHERE "customerId" = $1 AND "operationName" IN ('credential-issue', 'credential-verify')
				AND ($2::timestamptz IS NULL OR "createdAt" < $2))
		) AS "hasHistory"`,
		[customerId, cutoff ?? null]
	)) as { hasHistory: boolean }[];
	return Boolean(rows[0]?.hasHistory);
};

const TTL_MS = 10 * 60 * 1000;

export class CredentialScreensService {
	static instance = new CredentialScreensService();
	private readonly cache = new Map<string, { value: boolean; at: number }>();

	constructor(
		private readonly lookup: HistoryLookup = databaseHistoryLookup,
		private readonly now: () => number = Date.now
	) {}

	/** History is cached for ten minutes. A failed read counts as no history (staff can still switch it on). */
	async hasHistory(customerId: string): Promise<boolean> {
		const hit = this.cache.get(customerId);
		if (hit && this.now() - hit.at < TTL_MS) return hit.value;
		let value = false;
		try {
			value = await this.lookup(customerId, historyCutoff());
		} catch (error) {
			console.warn(`credential-screens history read failed: ${(error as Error)?.message ?? error}`);
			return false;
		}
		this.cache.set(customerId, { value, at: this.now() });
		return value;
	}

	async decide(customerId: string | undefined, rows: readonly FlagRow[]): Promise<CredentialScreensDecision> {
		const mode = credentialScreensMode(rows, customerId);
		if (mode === 'on') return { enabled: true, mode, source: 'flag' };
		if (mode === 'off') return { enabled: false, mode, source: 'flag' };
		if (!customerId) return { enabled: false, mode, source: 'default' };
		const history = await this.hasHistory(customerId);
		return { enabled: history, mode, source: history ? 'history' : 'default' };
	}
}
