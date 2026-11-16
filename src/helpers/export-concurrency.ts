/**
 * In-process limiter for key exports. Each export runs scrypt at roughly 128 MB, so concurrency is capped per
 * process (KEY_EXPORT_MAX_CONCURRENCY, default 2) and per customer (1). Slots are taken without waiting: when
 * there is no free slot the caller is told to retry.
 */
const DEFAULT_MAX_CONCURRENCY = 2;

export function getMaxExportConcurrency(): number {
	const raw = process.env.KEY_EXPORT_MAX_CONCURRENCY;
	if (!raw || !/^\d+$/.test(raw.trim())) return DEFAULT_MAX_CONCURRENCY;
	const parsed = Number.parseInt(raw, 10);
	return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : DEFAULT_MAX_CONCURRENCY;
}

let active = 0;
const activeCustomers = new Set<string>();

/** Returns a release function, or null when the process or the customer is already at its limit. */
export function tryAcquireExportSlot(customerId: string | undefined): (() => void) | null {
	if (active >= getMaxExportConcurrency()) return null;
	if (customerId !== undefined && activeCustomers.has(customerId)) return null;
	active++;
	if (customerId !== undefined) activeCustomers.add(customerId);
	let released = false;
	return () => {
		if (released) return;
		released = true;
		active--;
		if (customerId !== undefined) activeCustomers.delete(customerId);
	};
}
