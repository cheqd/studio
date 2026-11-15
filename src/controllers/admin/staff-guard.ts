import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { evaluateStaffAccess, type StaffAccessResult } from './staff-policy.js';

export const STAFF_SCOPES = {
	customersRead: 'admin:customers:read',
	analyticsRead: 'admin:analytics:read',
	auditRead: 'admin:audit:read',
	organisationDelete: 'admin:organisation:delete',
	flagsUpdate: 'admin:flags:update',
} as const;

/** Every scope that guards a staff route. The routes themselves are listed in `admin-auth.ts`. */
export const ALL_STAFF_SCOPES: readonly string[] = Object.values(STAFF_SCOPES);

/**
 * Applies the staff policy (see `staff-policy.ts`) to the request's identity, which only the portal user-session
 * fetcher fills in. When authentication is off (local development) the check is skipped, as it always was.
 */
export function checkStaffAccess(response: Response, scope: string): StaffAccessResult {
	if (process.env.ENABLE_AUTHENTICATION !== 'true') return { allowed: true };
	const identity = response.locals.staffIdentity as
		| { email?: string; emailVerified?: boolean; roles?: string[]; authMethod?: string }
		| undefined;
	return evaluateStaffAccess({
		scopes: response.locals.scopes,
		requiredScope: scope,
		email: identity?.email,
		emailVerified: identity?.emailVerified,
		roles: identity?.roles,
		authMethod: identity?.authMethod,
	});
}

/** Logs a denial with the Logto user id and the reason code only, never the email. */
export function logStaffDenial(response: Response, scope: string, reason: string) {
	const userId = response.locals.staffIdentity?.logtoUserId ?? response.locals.user?.logToId ?? 'unknown';
	console.warn(`staff-access-denied user=${userId} scope=${scope} reason=${reason}`);
}

/**
 * Belt and braces behind the auth rule, and the enforcement point for the staff policy: scope AND verified email on
 * an allowed domain AND a staff role AND a portal user session. Returns true when the request may go on, and has
 * already answered 403 (with the same generic message whatever the reason) when not.
 */
export function requireStaffScope(response: Response, scope: string, message = 'Only staff can use this endpoint.') {
	const result = checkStaffAccess(response, scope);
	if (!result.allowed) {
		logStaffDenial(response, scope, result.reason);
		response.status(StatusCodes.FORBIDDEN).json({ error: message });
		return false;
	}
	return true;
}

/** True when the call came through the machine-to-machine path, where `customer-id` names the target, not the caller. */
export function isM2MRequest(request: Request): boolean {
	return Boolean(request.headers?.['customer-id']) && !request.headers?.['x-api-key'];
}

/**
 * Who is acting, for the audit log. A portal or Logto session gives the staff member's Logto user id. The M2M path
 * only identifies the calling client by its scopes (see #874), so it is recorded as `m2m`.
 */
export function staffActor(request: Request, response: Response): string {
	if (isM2MRequest(request)) return 'm2m';
	return response.locals.staffIdentity?.logtoUserId || response.locals.user?.logToId || 'unknown';
}
