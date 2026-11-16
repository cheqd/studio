import { afterEach, beforeAll, describe, expect, it, jest } from '@jest/globals';
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
		await expect(service.validateCredentialAccess(credential, customer)).rejects.toThrow(
			`${issuerDid} not found in wallet`
		);
	});

	it('rejects when the lookup fails (find returns [] on error)', async () => {
		mockFind([]);
		await expect(service.validateCredentialAccess(credential, customer)).rejects.toThrow(
			`${issuerDid} not found in wallet`
		);
	});

	it('allows when the customer owns the issuer DID', async () => {
		mockFind([[{ did: issuerDid }], 1]);
		await expect(service.validateCredentialAccess(credential, customer)).resolves.toBeUndefined();
	});

	it('rejects the whole batch if any credential has an issuer the customer does not own', async () => {
		jest.spyOn(IdentifierService.instance, 'find').mockImplementation((async (where: { did: string }) =>
			where.did === issuerDid ? [[{ did: issuerDid }], 1] : [[], 0]) as never);
		const other = { issuer: 'did:cheqd:testnet:other' } as never;
		await expect(service.validateCredentialAccess([credential, other], customer)).rejects.toThrow(
			'did:cheqd:testnet:other not found in wallet'
		);
	});
});
