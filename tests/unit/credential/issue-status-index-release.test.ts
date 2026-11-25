import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * A failed issue must not consume a status list entry: the index reserved for a credential that was never signed is
 * given back, so "x of y used" (the write cursor) matches the credentials on the list. Once the credential is signed
 * the index stays used, and an index that is no longer the latest reservation is never moved back over.
 */

type Registry = {
	registryId: string;
	registryName: string;
	registryType: string;
	writeCursor: number;
	registrySize: number;
	state: string;
	version: number;
	threshold_percentage: number;
	metadata: Record<string, unknown>;
};

let registry: Registry;
const rows = new Map<string, any>();
let createCredential: (credential: any, format: string, statusOptions: any) => Promise<any>;
let didExists: () => Promise<boolean>;

/** A minimal query builder: applies the `set` when every `where` condition holds on the registry. */
function registryQueryBuilder() {
	let patch: Partial<Registry> = {};
	const conditions: Record<string, unknown> = {};
	const builder = {
		update: () => builder,
		set: (values: Partial<Registry>) => {
			patch = values;
			return builder;
		},
		where: (_sql: string, params: Record<string, unknown>) => {
			Object.assign(conditions, params);
			return builder;
		},
		andWhere: (_sql: string, params: Record<string, unknown>) => {
			Object.assign(conditions, params);
			return builder;
		},
		execute: async () => {
			const matches = Object.entries(conditions).every(
				([key, value]) => (registry as unknown as Record<string, unknown>)[key] === value
			);
			if (!matches) return { affected: 0 };
			Object.assign(registry, patch);
			return { affected: 1 };
		},
	};
	return builder;
}

const registryRepository = {
	findOne: async () => ({ ...registry }),
	createQueryBuilder: registryQueryBuilder,
};
const credentialRepository = {
	save: async (entity: any) => {
		entity.issuedCredentialId ??= '0b6c1f9e-3c4d-4f6a-9d2e-1a2b3c4d5e6f';
		rows.set(entity.issuedCredentialId, entity);
		return entity;
	},
	delete: async (where: any) => {
		rows.delete(where.issuedCredentialId);
	},
	update: async (where: any, patch: any) => {
		Object.assign(rows.get(where.issuedCredentialId) ?? {}, patch);
	},
	findOne: async ({ where }: any) => rows.get(where.issuedCredentialId) ?? null,
};

jest.unstable_mockModule('../../../src/database/connection/connection.js', () => ({
	Connection: {
		instance: {
			dbConnection: {
				getRepository: (entity: { name: string }) =>
					entity.name === 'StatusRegistryEntity' ? registryRepository : credentialRepository,
			},
		},
	},
}));
// Filling a list emits a rotation event; nothing here rotates
jest.unstable_mockModule('../../../src/services/track/tracker.js', () => ({ eventTracker: { emit: () => true } }));
jest.unstable_mockModule('../../../src/services/identity/index.js', () => ({
	IdentityServiceStrategySetup: class {
		async engine() {
			return { name: 'credo', createCredential: (...args: any[]) => createCredential(args[0], args[1], args[2]) };
		}
		async routed() {
			return { didExists: () => didExists() };
		}
	},
}));

// The database entities and service singletons read these at import time; dummy, non-secret values
process.env.ENABLE_EXTERNAL_DB ??= 'false';
process.env.EXTERNAL_DB_ENCRYPTION_KEY ??= '0'.repeat(64);
const { Credentials } = await import('../../../src/services/api/credentials.js');

const issuerDid = 'did:cheqd:testnet:5f3b3b2e-0000-4000-8000-000000000001';
const customer = { customerId: 'c-1' } as never;
const request = (format: string) =>
	({
		issuerDid,
		subjectDid: 'did:key:z6Mk',
		attributes: { tag: 'x' },
		format,
		credentialStatus: {
			statusListName: 'list-1',
			statusListType: 'BitstringStatusList',
			statusPurpose: 'revocation',
		},
	}) as never;

describe('status list index of a failed issue', () => {
	beforeEach(() => {
		rows.clear();
		registry = {
			registryId: 'reg-1',
			registryName: 'list-1',
			registryType: 'BitstringStatusList',
			writeCursor: 5,
			registrySize: 100,
			state: 'ACTIVE',
			version: 1,
			threshold_percentage: 80,
			metadata: {},
		};
		didExists = async () => false;
	});

	it('gives the index back when signing fails', async () => {
		let indexUsed: number | undefined;
		createCredential = async (_credential, _format, statusOptions) => {
			indexUsed = statusOptions.statusListIndex;
			throw new Error('undefined terms');
		};
		await expect(new Credentials().issueWithRecord(request('jsonld'), customer)).rejects.toThrow('undefined terms');
		expect(indexUsed).toBe(6);
		expect(registry.writeCursor).toBe(5);
		expect(rows.size).toBe(0);
	});

	it('hands the same index to the next issue after a failed one', async () => {
		createCredential = async () => {
			throw new Error('undefined terms');
		};
		await new Credentials().issueWithRecord(request('jsonld'), customer).catch(() => undefined);

		const indexes: number[] = [];
		createCredential = async (credential, _format, statusOptions) => {
			indexes.push(statusOptions.statusListIndex);
			return { ...credential, proof: { type: 'Ed25519Signature2020', proofValue: 'z1' } };
		};
		await new Credentials().issueWithRecord(request('jsonld'), customer);
		expect(indexes).toEqual([6]);
		expect(registry.writeCursor).toBe(6);
	});

	it('keeps the index used once the credential was signed, even when a later step fails', async () => {
		createCredential = async (credential) => ({ ...credential, proof: { type: 'JwtProof2020', jwt: 'a.b.c' } });
		didExists = async () => {
			throw new Error('lookup failed after signing');
		};
		await expect(new Credentials().issueWithRecord(request('jwt'), customer)).rejects.toThrow(
			'lookup failed after signing'
		);
		expect(registry.writeCursor).toBe(6);
	});

	it('leaves the cursor alone when another issue has reserved an index since', async () => {
		createCredential = async () => {
			// A concurrent issue takes index 7 while this one is signing
			registry.writeCursor = 7;
			registry.version += 1;
			throw new Error('undefined terms');
		};
		await expect(new Credentials().issueWithRecord(request('jsonld'), customer)).rejects.toThrow();
		expect(registry.writeCursor).toBe(7);
	});

	it('leaves a list the reservation filled as it is', async () => {
		registry.writeCursor = 98;
		registry.registrySize = 99;
		createCredential = async () => {
			throw new Error('undefined terms');
		};
		await expect(new Credentials().issueWithRecord(request('jsonld'), customer)).rejects.toThrow();
		expect(registry.writeCursor).toBe(99);
		expect(registry.state).toBe('FULL');
	});
});
