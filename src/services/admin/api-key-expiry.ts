/**
 * The default expiry for an API key that's created without an explicit `expiresAt`: `days` days after `from`.
 */
export function defaultApiKeyExpiry(from: Date, days: number): Date {
	const expiresAt = new Date(from);
	expiresAt.setDate(expiresAt.getDate() + days);
	return expiresAt;
}
