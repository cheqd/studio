import type { AgentContext, Kms } from '@credo-ts/core';
import type { NodeKeyManagementStorage } from '@credo-ts/node';
import type { PrivateKeyStore } from '@veramo/data-store';
import { jwkToVeramoKey, veramoKeyToJwk } from './keyConversion.js';

export interface VeramoKeyManagementStorageOptions {
	/** Veramo's `PrivateKeyStore`, configured with the same `SecretBox` secret Studio already uses. */
	privateKeyStore: PrivateKeyStore;
	/**
	 * Called after Credo creates a key, so the host (Studio) can write its own `key` row and `customerId`.
	 * Not called for keys that already existed in the Veramo store.
	 */
	onKeyCreated?: (agentContext: AgentContext, keyId: string, jwk: Kms.KmsJwkPrivate) => Promise<void> | void;
}

/**
 * Credo `NodeKeyManagementStorage` backed by Veramo's `private-key` table.
 *
 * - Key id (Credo) = alias (Veramo) = kid.
 * - Existing Veramo keys are converted to JWKs on read.
 * - New Credo keys are written in Veramo's own layout, so Veramo can still read them.
 */
export class VeramoKeyManagementStorage implements NodeKeyManagementStorage {
	public constructor(private readonly options: VeramoKeyManagementStorageOptions) {}

	public async get(_agentContext: AgentContext, keyId: string): Promise<Kms.KmsJwkPrivate | null> {
		const stored = await this.find(keyId);
		if (!stored) return null;
		return veramoKeyToJwk(stored.type, stored.privateKeyHex, keyId);
	}

	public async has(_agentContext: AgentContext, keyId: string): Promise<boolean> {
		return (await this.find(keyId)) !== null;
	}

	public async set(agentContext: AgentContext, keyId: string, jwk: Kms.KmsJwkPrivate): Promise<void> {
		const { type, privateKeyHex } = jwkToVeramoKey(jwk);
		await this.options.privateKeyStore.importKey({ alias: keyId, type, privateKeyHex });
		await this.options.onKeyCreated?.(agentContext, keyId, jwk);
	}

	public async delete(_agentContext: AgentContext, keyId: string): Promise<boolean> {
		return this.options.privateKeyStore.deleteKey({ alias: keyId });
	}

	private async find(keyId: string) {
		try {
			return await this.options.privateKeyStore.getKey({ alias: keyId });
		} catch {
			// Veramo throws when the alias is unknown
			return null;
		}
	}
}
