import type { RequestContext, RoutingRecord } from '../../request-context.js';

/** `ok` for a 2xx or 3xx answer, `error` otherwise. Fits the `operation.outcome` column (varchar 16). */
export function outcomeOf(status: number | undefined): 'ok' | 'error' | 'unknown' {
	if (status === undefined) return 'unknown';
	return status < 400 ? 'ok' : 'error';
}

export interface RoutingLogLine {
	event: 'engine-routed';
	requestId: string;
	customerId: string | null;
	routeFamily: string;
	engine: string;
	rule: string;
	outcome: 'ok' | 'error' | 'unknown';
	status: number | null;
	durationMs: number;
}

/** The rule that chose the engine, as one word: `artifact`, `flag`, `default`, or `exception:<name>`. */
export function ruleOf(record: Pick<RoutingRecord, 'reason' | 'rule'>): string {
	return record.reason === 'exception' && record.rule ? `exception:${record.rule}` : record.reason;
}

export function routingLogLine(
	context: Pick<RequestContext, 'requestId' | 'startedAt'>,
	record: RoutingRecord,
	result: { status?: number; customerId?: string },
	now: number = Date.now()
): RoutingLogLine {
	return {
		event: 'engine-routed',
		requestId: context.requestId,
		customerId: record.customerId ?? result.customerId ?? null,
		routeFamily: record.routeFamily,
		engine: record.engine,
		rule: ruleOf(record),
		outcome: outcomeOf(result.status),
		status: result.status ?? null,
		durationMs: Math.max(0, now - context.startedAt),
	};
}

/** Logs one line per decision of the request. Never throws: logging must not fail a request. */
export function logRoutingOutcome(
	context: RequestContext,
	result: { status?: number; customerId?: string },
	sink: (line: string) => void = (line) => console.info(line)
): void {
	try {
		for (const record of context.decisions) sink(JSON.stringify(routingLogLine(context, record, result)));
	} catch {
		/* ignore */
	}
}
