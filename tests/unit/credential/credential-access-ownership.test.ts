import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
import { NOT_FOUND_MESSAGE, OwnershipError } from '../../../src/services/identity/ownership-error.js';
import type { CustomerEntity } from '../../../src/database/entities/customer.entity.js';

const issuerDid = 'did:cheqd:testnet:6a8a9c6c-8e30-4b5c-a5d0-0b8f5a6f9c11';
const customer = { customerId: 'customer-a' } as CustomerEntity;
const credential = { issuer: { id: issuerDid } } as never;

type IdentifierServiceType = typeof import('../../../src/services/api/identifier.js').IdentifierService;

let service: { validateCredentialAccess(credentials: unknown, customer: CustomerEntity): Promise<void> };
let IdentifierService: IdentifierServiceType;

const mockFind = (result: unknown) => jest.spyOn(IdentifierService.instance, 'find').mockResolvedValue(result as never);

describe('validateCredentialAccess (issuer ownership on revoke, suspend and reinstate)', () => {
	beforeAll(async () => {
		// Imported here, not at the top: the database entities and service singletons need environment variables at import time.
		process.env.ENABLE_EXTERNAL_DB ??= 'false';
		// Dummy, non-secret value: service singletons construct a SecretBox at import time.
		process.env.EXTERNAL_DB_ENCRYPTION_KEY ??= '0'.repeat(64);
		({ IdentifierService } = await import('../../../src/services/api/identifier.js'));
		const { PostgresIdentityService } = await import('../../../src/services/identity/providers/studio/postgres.js');
		// Skip the constructor: it would open a database connection and build a Veramo agent.
		service = Object.create(PostgresIdentityService.prototype);
	}, 60_000);

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('rejects when the customer does not own the issuer DID (findAndCount returns [[], 0])', async () => {
		mockFind([[], 0]);
		await expect(service.validateCredentialAccess(credential, customer)).rejects.toThrow(OwnershipError);
	});

	it('rejects when the lookup fails (find returns [] on error)', async () => {
		mockFind([]);
		await expect(service.validateCredentialAccess(credential, customer)).rejects.toThrow(OwnershipError);
	});

	it('allows when the customer owns the issuer DID', async () => {
		mockFind([[{ did: issuerDid }], 1]);
		await expect(service.validateCredentialAccess(credential, customer)).resolves.toBeUndefined();
	});

	it('rejects the whole batch if any credential has an issuer the customer does not own', async () => {
		jest.spyOn(IdentifierService.instance, 'find').mockImplementation((async (where: { did: string }) =>
			where.did === issuerDid ? [[{ did: issuerDid }], 1] : [[], 0]) as never);
		const other = { issuer: 'did:cheqd:testnet:other' } as never;
		await expect(service.validateCredentialAccess([credential, other], customer)).rejects.toThrow(OwnershipError);
	});
});

describe('assertCustomerOwnsDid (shared ownership guard for DID-scoped writes)', () => {
	type Guarded = {
		assertCustomerOwnsDid(did: string, customer: CustomerEntity): Promise<void>;
		updateDid(doc: unknown, customer: CustomerEntity): Promise<unknown>;
		deactivateDid(did: string, customer: CustomerEntity): Promise<unknown>;
		createPresentation(presentation: unknown, options: unknown, customer: CustomerEntity): Promise<unknown>;
	};
	let guarded: Guarded;

	beforeAll(async () => {
		process.env.ENABLE_EXTERNAL_DB ??= 'false';
		process.env.EXTERNAL_DB_ENCRYPTION_KEY ??= '0'.repeat(64);
		({ IdentifierService } = await import('../../../src/services/api/identifier.js'));
		const { PostgresIdentityService } = await import('../../../src/services/identity/providers/studio/postgres.js');
		guarded = Object.create(PostgresIdentityService.prototype);
	}, 60_000);

	afterEach(() => {
		jest.restoreAllMocks();
	});

	it('rejects when the count is zero', async () => {
		mockFind([[], 0]);
		await expect(guarded.assertCustomerOwnsDid(issuerDid, customer)).rejects.toThrow(OwnershipError);
	});

	it('rejects when the lookup fails (find returns [])', async () => {
		mockFind([]);
		await expect(guarded.assertCustomerOwnsDid(issuerDid, customer)).rejects.toThrow(OwnershipError);
	});

	it('rejects without querying when there is no customer', async () => {
		const find = mockFind([[{ did: issuerDid }], 1]);
		await expect(guarded.assertCustomerOwnsDid(issuerDid, undefined as never)).rejects.toThrow(OwnershipError);
		expect(find).not.toHaveBeenCalled();
	});

	it('gives a missing DID and a DID owned by someone else the same error, with no identifier in it', async () => {
		const thrown: Error[] = [];
		for (const did of [issuerDid, 'did:cheqd:testnet:00000000-0000-4000-8000-000000000000']) {
			mockFind([[], 0]);
			thrown.push(
				await guarded.assertCustomerOwnsDid(did, customer).then(
					() => new Error('expected a rejection'),
					(error: Error) => error
				)
			);
		}
		expect(thrown[0]).toBeInstanceOf(OwnershipError);
		expect({ name: thrown[0].name, message: thrown[0].message }).toEqual({
			name: thrown[1].name,
			message: thrown[1].message,
		});
		expect(thrown[0].message).toBe(NOT_FOUND_MESSAGE);
		expect(thrown[0].message).not.toContain('did:');
	});

	it('allows when the customer owns the DID', async () => {
		mockFind([[{ did: issuerDid }], 1]);
		await expect(guarded.assertCustomerOwnsDid(issuerDid, customer)).resolves.toBeUndefined();
	});

	it('is used by updateDid, deactivateDid and createPresentation before any signing', async () => {
		mockFind([[], 0]);
		await expect(guarded.updateDid({ id: issuerDid }, customer)).rejects.toThrow(OwnershipError);
		await expect(guarded.deactivateDid(issuerDid, customer)).rejects.toThrow(OwnershipError);
		await expect(guarded.createPresentation({ holder: issuerDid }, {}, customer)).rejects.toThrow(OwnershipError);
		await expect(guarded.createPresentation({}, {}, customer)).rejects.toThrow(OwnershipError);
	});
});
