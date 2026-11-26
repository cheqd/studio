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
		if (response.req) void recordStaffDenial(response.req, response, result.reason);
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

/** The same caller, route and reason is written at most once per this interval, so a loop cannot flood the log. */
export const STAFF_DENIAL_RECORD_INTERVAL_MS = 60_000;
const MAX_REMEMBERED_DENIALS = 1000;
const recentDenials = new Map<string, number>();

/** For tests: forget which denials were written recently. */
export function resetStaffDenialThrottle() {
	recentDenials.clear();
}

/** The route a request was refused on, as `METHOD /path` (the route pattern when Express has matched one). */
function deniedRoute(request: Request): string {
	const path = request.route?.path ? `${request.baseUrl ?? ''}${request.route.path}` : (request.path ?? '');
	return `${request.method} ${String(path)}`.slice(0, 200);
}

/**
 * Writes `staff.access.denied` to the admin audit log for a caller that an admin route refused: the actor's Logto
 * user id (or `m2m` / `unknown`), the route and a reason code, in the same fields as every other entry. No email or
 * other personal data. Best effort: it never throws and never changes the answer the caller gets. Called by the
 * auth guard (an authenticated caller without the admin scopes) and by the staff policy check in the controllers,
 * so any refused `/admin` call is recorded; repeats of the same caller, route and reason within a minute are not.
 */
export async function recordStaffDenial(
	request: Request,
	response: Response,
	reasonCode: string,
	options: { targetCustomerId?: string; throttle?: boolean } = {}
): Promise<void> {
	try {
		const actorUserId = staffActor(request, response);
		const route = deniedRoute(request);
		if (options.throttle !== false) {
			const key = `${actorUserId}|${route}|${reasonCode}`;
			const now = Date.now();
			const last = recentDenials.get(key);
			if (last !== undefined && now - last < STAFF_DENIAL_RECORD_INTERVAL_MS) return;
			recentDenials.delete(key);
			recentDenials.set(key, now);
			while (recentDenials.size > MAX_REMEMBERED_DENIALS) {
				const oldest = recentDenials.keys().next().value;
				if (oldest === undefined) break;
				recentDenials.delete(oldest);
			}
		}
		// Imported on use: loading the guard must not need the database (the auth middleware imports it)
		const [{ Connection }, { AdminAuditLogEntity }] = await Promise.all([
			import('../../database/connection/connection.js'),
			import('../../database/entities/admin-audit-log.entity.js'),
		]);
		await Connection.instance.dbConnection.getRepository(AdminAuditLogEntity).insert({
			actorUserId,
			action: 'staff.access.denied',
			targetCustomerId: options.targetCustomerId,
			reason: reasonCode,
			metadata: { route, reasonCode } as never,
		});
	} catch (error) {
		console.error(`Could not record the denied staff attempt in the audit log: ${(error as Error)?.message}`);
	}
}
