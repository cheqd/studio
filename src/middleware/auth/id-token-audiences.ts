/**
 * Applications whose ID tokens Studio accepts as a bearer token: cheqd Studio's own LogTo application, plus any
 * public (native) LogTo applications listed in LOGTO_CLI_APP_IDS, such as the cheqd SDK quickstart's `00:login`.
 * The user's scopes still come from their roles, so a token from a listed application grants nothing extra.
 */
export function idTokenAudiences(env: { LOGTO_APP_ID?: string; LOGTO_CLI_APP_IDS?: string } = process.env): string[] {
	const ids = [env.LOGTO_APP_ID, ...(env.LOGTO_CLI_APP_IDS ?? '').split(',')];
	return [...new Set(ids.map((id) => id?.trim()).filter((id): id is string => !!id))];
}
