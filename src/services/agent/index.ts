import type { CustomerEntity } from '../../database/entities/customer.entity.js';
import type { AgentEngineProvider } from './agent-engine.js';
import { AgentService } from './agent-service.js';

export * from './agent-errors.js';
export type { AgentEngineProvider } from './agent-engine.js';
export { AgentService } from './agent-service.js';
export type { AgentStore } from './agent-store.js';

/**
 * The engine for a customer's agent calls. The `EngineRouter` always answers Credo for the `agent` route family
 * (engine spec 4.1): no flag applies, and Veramo has none of the agent methods. Imported lazily so loading this module does not load the identity services.
 */
export const routedEngine: AgentEngineProvider = async (customer: CustomerEntity) => {
	const [{ IdentityServiceStrategySetup }, { engineRouter }] = await Promise.all([
		import('../identity/index.js'),
		import('../identity/engine/index.js'),
	]);
	const service = new IdentityServiceStrategySetup(customer.customerId).agent;
	return engineRouter.engineFor({ customerId: customer.customerId, route: 'agent' }, service);
};

export interface AgentServices {
	agents: AgentService;
}

let services: AgentServices | undefined;

/** The wired services. The TypeORM store (and with it every entity) is imported on first use, not at start-up. */
export async function agentServices(): Promise<AgentServices> {
	if (!services) {
		const { TypeormAgentStore } = await import('./agent-store.js');
		const store = new TypeormAgentStore();
		services = {
			agents: new AgentService({ store, engineFor: routedEngine }),
		};
	}
	return services;
}
