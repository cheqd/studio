import type { AgentContext } from '@credo-ts/core';
import { CheqdDidRegistrar, CheqdLedgerService } from '@credo-ts/cheqd';
import { requiredUpdateSigners } from './did-update-signers.js';

type SignPayload = (
	agentContext: AgentContext,
	payload: Uint8Array,
	verificationMethod?: { id: string }[],
	keys?: unknown
) => Promise<unknown[]>;

type UpdateOptions = Parameters<CheqdDidRegistrar['update']>[1];

/**
 * Credo's did:cheqd registrar, signing a key replacement with the keys the ledger SDK accepts (see
 * `did-update-signers.ts`). Without this, an update that swaps one `authentication` key for another (an agent key
 * rotation) is refused by `@cheqd/sdk` before broadcast because the keys that stay also signed. Everything else is
 * Credo's own behaviour.
 */
export class StudioCheqdDidRegistrar extends CheqdDidRegistrar {
	/** The signer set for an update in progress, by agent context (a tenant's writes are serialised by the payer lock). */
	private readonly updateSigners = new WeakMap<AgentContext, Set<string>>();

	constructor() {
		super();
		const self = this as unknown as { signPayload: SignPayload };
		const original = self.signPayload.bind(this);
		self.signPayload = (agentContext, payload, verificationMethod = [], keys) => {
			const required = this.updateSigners.get(agentContext);
			const signers = required
				? verificationMethod.filter((method) => required.has(method.id))
				: verificationMethod;
			return original(agentContext, payload, signers, keys);
		};
	}

	async update(agentContext: AgentContext, options: UpdateOptions) {
		const required = await this.signersFor(agentContext, options);
		if (!required) return super.update(agentContext, options);
		this.updateSigners.set(agentContext, required);
		try {
			return await super.update(agentContext, options);
		} finally {
			this.updateSigners.delete(agentContext);
		}
	}

	private async signersFor(agentContext: AgentContext, options: UpdateOptions): Promise<Set<string> | null> {
		const document = options.didDocument;
		if (!document) return null;
		try {
			const ledger = agentContext.dependencyManager.resolve(CheqdLedgerService);
			const previous = await ledger.resolve(document.id);
			if (!previous?.didDocument || previous.didDocumentMetadata?.deactivated) return null;
			return requiredUpdateSigners(document.toJSON() as never, previous.didDocument as never);
		} catch {
			// The registrar resolves the DID itself and reports a failure in its own words
			return null;
		}
	}
}
