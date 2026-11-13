import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

export const STAFF_SCOPES = {
	customersRead: 'admin:customers:read',
	analyticsRead: 'admin:analytics:read',
	auditRead: 'admin:audit:read',
	organisationDelete: 'admin:organisation:delete',
} as const;

/**
 * Belt and braces behind the auth rule: when authentication is on, the caller's scopes must include the staff scope
 * for this route, so the handler stays staff-only even if the rule is ever loosened. Returns true when the request
 * may go on, and has already answered 403 when not.
 */
export function requireStaffScope(response: Response, scope: string, message = 'Only staff can use this endpoint.') {
	const scopes: string[] = response.locals.scopes || [];
	if (process.env.ENABLE_AUTHENTICATION === 'true' && !scopes.includes(scope)) {
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
	return response.locals.user?.logToId || 'unknown';
}
