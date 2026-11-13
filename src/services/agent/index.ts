import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { AgentEngineProvider } from './agent-engine.js';
import { AgentService } from './agent-service.js';
import { AgentVerificationService } from './agent-verification-service.js';

export * from './agent-errors.js';
export type { AgentEngineProvider } from './agent-engine.js';
export { AgentService } from './agent-service.js';
export { AgentVerificationService } from './agent-verification-service.js';
export type { AgentStore } from './agent-store.js';

/**
 * The engine for a customer's agent calls, chosen by the `EngineRouter` on the `did` route family. With no flag
 * that is Veramo, which has none of the agent methods, so the routes answer 501 until the customer's `did` route
 * is switched to Credo. Imported lazily so loading this module does not load the identity services.
 */
export const routedEngine: AgentEngineProvider = async (customer: CustomerEntity) => {
	const [{ IdentityServiceStrategySetup }, { engineRouter }] = await Promise.all([
		import('../identity/index.js'),
		import('../identity/engine/index.js'),
	]);
	const service = new IdentityServiceStrategySetup(customer.customerId).agent;
	return engineRouter.engineFor({ customerId: customer.customerId, route: 'did' }, service);
};

export interface AgentServices {
	agents: AgentService;
	verification: AgentVerificationService;
}

let services: AgentServices | undefined;

/** The wired services. The TypeORM store (and with it every entity) is imported on first use, not at start-up. */
export async function agentServices(): Promise<AgentServices> {
	if (!services) {
		const { TypeormAgentStore } = await import('./agent-store.js');
		const store = new TypeormAgentStore();
		services = {
			agents: new AgentService({ store, engineFor: routedEngine }),
			verification: new AgentVerificationService({ store, engineFor: routedEngine }),
		};
	}
	return services;
}
