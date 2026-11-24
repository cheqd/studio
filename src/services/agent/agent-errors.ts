import { StatusCodes } from 'http-status-codes';

/** An error the controller turns into an HTTP response as it is. Nothing else leaks to the caller. */
export class AgentServiceError extends Error {
	constructor(
		readonly status: number,
		readonly code: string,
		message: string
	) {
		super(message);
		this.name = 'AgentServiceError';
	}
}

export const notFound = (what = 'Agent') =>
	new AgentServiceError(StatusCodes.NOT_FOUND, 'not_found', `${what} not found`);
export const badRequest = (message: string) =>
	new AgentServiceError(StatusCodes.BAD_REQUEST, 'invalid_request', message);
export const conflict = (message: string) => new AgentServiceError(StatusCodes.CONFLICT, 'conflict', message);
export const actsForExists = () =>
	new AgentServiceError(
		StatusCodes.CONFLICT,
		'acts_for_exists',
		'The agent already has an active or suspended acts-for grant. Revoke it before granting another'
	);
export const actsForIsAgent = (did: string) =>
	new AgentServiceError(
		StatusCodes.BAD_REQUEST,
		'acts_for_is_agent',
		`${did} is the DID of an agent (or of a deleted agent), so no agent can act for it. Choose one of your own DIDs that is not an agent's`
	);
export const unauthorised = () =>
	new AgentServiceError(StatusCodes.UNAUTHORIZED, 'unauthorised', 'A customer account is required');
export const featureDisabled = (message: string) =>
	new AgentServiceError(StatusCodes.FORBIDDEN, 'feature_disabled', message);
export const upstreamFailure = (message: string) =>
	new AgentServiceError(StatusCodes.BAD_GATEWAY, 'upstream_failure', message);

/** The customer's engine cannot do what the route needs (the Veramo engine, or a Credo engine without the method). */
export class EngineCapabilityError extends AgentServiceError {
	constructor(readonly missing: string[]) {
		super(
			StatusCodes.NOT_IMPLEMENTED,
			'engine_capability_missing',
			`The identity engine for this account cannot serve the agent endpoints yet (missing: ${missing.join(', ')}). They need the Credo engine.`
		);
		this.name = 'EngineCapabilityError';
	}
}
