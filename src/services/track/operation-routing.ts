import type { OperationRouting } from '../api/operation.js';
import { currentRequestContext } from '../request-context.js';
import type { ITrackOperation, TrackData } from '../../types/track.js';

const NETWORK_IN_DID = /^did:cheqd:(mainnet|testnet):/;

/** The network of the operation: from the DID it acted on, else from the fee payment, else unknown. */
export function networkOf(operation: ITrackOperation<TrackData>): string | undefined {
	const did = (operation.data as { did?: unknown }).did;
	if (typeof did === 'string') {
		const match = NETWORK_IN_DID.exec(did);
		if (match) return match[1];
	}
	const paid = operation.feePaymentOptions?.[0]?.network;
	return typeof paid === 'string' ? paid : undefined;
}

/**
 * The `engine`, `outcome`, `durationMs` and `network` columns for an operation row (engine spec 4.3). The engine
 * is the router's most recent decision on this request; with none (the route does not use the router) it is left
 * empty rather than guessed. Outside a request, nothing is known about timing and outcome is read from the event.
 */
export function operationRouting(operation: ITrackOperation<TrackData>, now: number = Date.now()): OperationRouting {
	const request = currentRequestContext();
	const decision = request?.decisions.at(-1);
	const failed = operation.successful === false || Boolean((operation.data as { error?: unknown }).error);
	return {
		engine: decision && decision.engine !== 'none' ? decision.engine : undefined,
		network: networkOf(operation),
		outcome: failed ? 'error' : 'ok',
		durationMs: request ? Math.max(0, now - request.startedAt) : undefined,
		authMethod: request?.authMethod,
	};
}
