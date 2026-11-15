/**
 * Applications whose ID tokens Studio accepts as a bearer token: cheqd Studio's own LogTo application, plus any
 * public (native) LogTo applications listed in LOGTO_CLI_APP_IDS, such as the cheqd SDK quickstart's `00:login`.
 * The user's scopes still come from their roles, so a token from a listed application grants nothing extra.
 */
export function idTokenAudiences(env: { LOGTO_APP_ID?: string; LOGTO_CLI_APP_IDS?: string } = process.env): string[] {
	const ids = [env.LOGTO_APP_ID, ...(env.LOGTO_CLI_APP_IDS ?? '').split(',')];
	return [...new Set(ids.map((id) => id?.trim()).filter((id): id is string => !!id))];
}

/**
 * The Logto application ids of the portal, from PORTAL_APP_IDS (comma list; the value the portal calls
 * LOGTO_APP_ID). The portal path accepts an ID token only when its `aud` includes one of them. An empty list means
 * the check is not configured.
 */
export function portalAppIds(env: { PORTAL_APP_IDS?: string } = process.env): string[] {
	const ids = (env.PORTAL_APP_IDS ?? '').split(',').map((id) => id.trim());
	return [...new Set(ids.filter((id) => id !== ''))];
}

/** True when the token's `aud` claim (a string or an array) includes at least one of the allowed ids. */
export function audienceMatches(aud: unknown, allowed: string[]): boolean {
	const claimed = Array.isArray(aud) ? aud : typeof aud === 'string' ? [aud] : [];
	return claimed.some((value) => typeof value === 'string' && allowed.includes(value));
}
