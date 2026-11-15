/**
 * Startup guard for authentication settings.
 *
 * Authentication is only mounted when both `ENABLE_AUTHENTICATION` and `ENABLE_EXTERNAL_DB` are exactly "true", so a
 * missing or mistyped value leaves every route open. In production the process refuses to start in that state unless
 * the deliberate override below is set. Outside production (development, test, the local end-to-end harness, where
 * NODE_ENV is unset) the guard does nothing.
 */

/** Explicit, loudly named exception for a production deployment that really is meant to run without authentication. */
export const INSECURE_OVERRIDE_VARIABLE = 'ALLOW_INSECURE_PRODUCTION_WITHOUT_AUTHENTICATION';

export type StartupEnvironment = Record<string, string | undefined>;

export interface StartupGuardResult {
	/** True when startup may continue */
	ok: boolean;
	/** True when startup continues only because the override variable is set */
	overridden: boolean;
	/** One-line reason, set whenever the configuration is not fully authenticated in production */
	reason?: string;
}

export function evaluateStartupGuard(env: StartupEnvironment = process.env): StartupGuardResult {
	if (env.NODE_ENV !== 'production') return { ok: true, overridden: false };

	const problems: string[] = [];
	if (env.ENABLE_AUTHENTICATION !== 'true') problems.push('ENABLE_AUTHENTICATION is not "true"');
	if (env.ENABLE_EXTERNAL_DB !== 'true') problems.push('ENABLE_EXTERNAL_DB is not "true"');
	if (problems.length === 0) return { ok: true, overridden: false };

	const reason = `Authentication is not fully enabled in production: ${problems.join(' and ')}`;
	if (env[INSECURE_OVERRIDE_VARIABLE] === 'true') return { ok: true, overridden: true, reason };
	return { ok: false, overridden: false, reason };
}

/** Throws (after logging one line) when production would start without authentication and no override is set. */
export function assertSecureStartup(
	env: StartupEnvironment = process.env,
	log: Pick<Console, 'error' | 'warn'> = console
) {
	const result = evaluateStartupGuard(env);
	if (result.ok && !result.overridden) return;
	if (result.ok) {
		log.warn(`${result.reason}; continuing because ${INSECURE_OVERRIDE_VARIABLE}=true is set`);
		return;
	}
	const message = `${result.reason}. Refusing to start; set both to "true", or set ${INSECURE_OVERRIDE_VARIABLE}=true for a deliberate exception.`;
	log.error(message);
	throw new Error(message);
}
