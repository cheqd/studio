import 'reflect-metadata';
import { Agent, type DependencyManager, InjectionSymbols, Kms, type Module, TypedArrayEncoder } from '@credo-ts/core';
import { agentDependencies, NodeKeyManagementService } from '@credo-ts/node';
import { PrivateKey, PrivateKeyStore } from '@veramo/data-store';
import { KeyManagementSystem, SecretBox } from '@veramo/kms-local';
import { DataSource } from 'typeorm';
import { describe, expect, test } from '@jest/globals';
import { VeramoKeyManagementStorage } from '../../../../src/services/identity/credo/VeramoKeyManagementStorage.js';
import { InMemoryStorageService } from './InMemoryStorageService.js';

// The agent also needs a record store (DIDs, credentials), which is separate from key storage
class InMemoryRecordStorageModule implements Module {
	public register(dependencyManager: DependencyManager) {
		dependencyManager.registerInstance(InjectionSymbols.StorageService, new InMemoryStorageService());
	}
}

describe('real Credo agent on the Veramo key store', () => {
	test('agent creates a key through the Veramo-backed KMS, Veramo reads it, and the agent signs', async () => {
		const ds = await new DataSource({ type: 'sqljs', synchronize: true, entities: [PrivateKey] }).initialize();
		const store = new PrivateKeyStore(ds, new SecretBox(await SecretBox.createSecretKey()));
		const veramo = new KeyManagementSystem(store);
		const storage = new VeramoKeyManagementStorage({ privateKeyStore: store });

		const agent = new Agent({
			config: {},
			dependencies: agentDependencies,
			modules: {
				kms: new Kms.KeyManagementModule({ backends: [new NodeKeyManagementService(storage)] }),
				recordStorage: new InMemoryRecordStorageModule(),
			},
		});
		await agent.initialize();

		// 1. A key Veramo (Studio today) already holds is usable by the agent
		const existing = await veramo.createKey({ type: 'Secp256r1' });
		const sig1 = await agent.kms.sign({
			keyId: existing.kid,
			algorithm: 'ES256',
			data: TypedArrayEncoder.fromUtf8String('jws signing input'),
		});
		expect(sig1.signature.length).toBe(64);

		// 2. A key the agent creates lands in the Veramo table and Veramo can use it
		const created = await agent.kms.createKey({ type: { kty: 'OKP', crv: 'Ed25519' } });
		const stored = await store.getKey({ alias: created.keyId });
		expect(stored.type).toBe('Ed25519');
		const veramoSig = await veramo.sign({
			keyRef: { kid: created.keyId },
			algorithm: 'EdDSA',
			data: TypedArrayEncoder.fromUtf8String('x'),
		});
		expect(veramoSig.length).toBeGreaterThan(40);

		await agent.shutdown();
	});
});
