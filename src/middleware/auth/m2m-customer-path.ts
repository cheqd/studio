/**
 * The direct machine-to-machine customer path: a Bearer token from the identity provider plus a `customer-id` header
 * naming the customer to act for. It has no legitimate caller in the standard deployment, so it is disabled unless
 * `ENABLE_M2M_CUSTOMER_PATH` is exactly the string `true`. Any other value, including unset, `TRUE`, `1` or ` true`,
 * leaves it disabled.
 */
export const M2M_CUSTOMER_PATH_ENV = 'ENABLE_M2M_CUSTOMER_PATH';

export function m2mCustomerPathEnabled(): boolean {
	return process.env[M2M_CUSTOMER_PATH_ENV] === 'true';
}

/** Logs once at startup when the path has been switched on, so the exposure is visible in the logs. */
export function warnIfM2MCustomerPathEnabled(): void {
	if (m2mCustomerPathEnabled()) {
		console.warn(
			`${M2M_CUSTOMER_PATH_ENV}=true: the machine-to-machine customer path is enabled. Any token from the identity provider that carries the required scopes can act for a customer named in the customer-id header. Enable it only for a named internal service.`
		);
	}
}
