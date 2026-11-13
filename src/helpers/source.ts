/**
 * The `source` field on accounts and faucet requests (cheqd/studio#868): where a sign-up or request came from,
 * for reporting only. Suggested values are `studio`, `sdk`, `agent-quickstart` and `agent`, but any short label
 * is accepted so that campaigns and partners can be told apart without a code change. It never carries free text:
 * lower-case letters, digits and hyphens, 1 to 32 characters, starting with a letter or digit. The same pattern
 * is enforced in the database by `CHK_customer_source` and `CHK_faucetRequest_source`.
 */
export const SOURCE_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const SOURCE_MAX_LENGTH = 32;

export function isValidSource(value: unknown): value is string {
	return typeof value === 'string' && SOURCE_PATTERN.test(value);
}

/** The source to store: the value when it is valid, otherwise `undefined` (stored as NULL). */
export function sourceOrUndefined(value: unknown): string | undefined {
	return isValidSource(value) ? value : undefined;
}
