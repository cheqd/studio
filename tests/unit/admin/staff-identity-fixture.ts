/** A portal user session that satisfies the staff policy, with the default domain and role. Example data only. */
export function staffIdentity(overrides: Record<string, unknown> = {}) {
	return {
		logtoUserId: 'logto-staff-1',
		email: 'staff@cheqd.io',
		emailVerified: true,
		roles: ['cheqd admin'],
		authMethod: 'portal-user-session',
		...overrides,
	};
}
