import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CredentialStatusService } from '../../../../src/services/api/credential-status.js';
import { IdentityServiceStrategySetup } from '../../../../src/services/identity/index.js';
import { EngineRouter } from '../../../../src/services/identity/engine/engine-router.js';
import type { IdentityEngine } from '../../../../src/services/identity/engine/identity-engine.js';
import type { IIdentityService } from '../../../../src/services/identity/index.js';
import type { CustomerEntity } from '../../../../src/database/entities/customer.entity.js';

const customer = { customerId: 'c1' } as CustomerEntity;

let engineFactory: jest.Mock<() => IdentityEngine>;

beforeEach(() => {
	jest.spyOn(console, 'info').mockImplementation(() => undefined);
	engineFactory = jest.fn(() => ({ name: 'veramo' }) as IdentityEngine);
	const router = new EngineRouter(
		{ recordedEngine: async () => null },
		{ flaggedEngine: async () => null },
		{ veramo: engineFactory, credo: engineFactory }
	);
	jest.spyOn(IdentityServiceStrategySetup.prototype, 'setupIdentityStrategy').mockImplementation(() => undefined);
	jest.spyOn(IdentityServiceStrategySetup.prototype, 'engine').mockImplementation(async (route, artifact, hints) =>
		router.engineFor(
			{ route, artifact, keyType: hints?.keyType, encryptedStatusList: hints?.encryptedStatusList },
			{} as IIdentityService
		)
	);
});

afterEach(() => {
	jest.restoreAllMocks();
});

describe('encrypted status-list creation', () => {
	it.each(['bitstring', 'statuslist2021'])(
		'answers 410 Gone for %s, before any engine is built',
		async (listType) => {
			const result = await new CredentialStatusService().createEncryptedStatusList(
				{ did: 'did:cheqd:testnet:abc', statusListName: 'list' } as never,
				{ listType, statusPurpose: 'revocation' } as never,
				customer
			);
			expect(result).toMatchObject({ success: false, statusCode: 410 });
			expect(result.error).toMatch(/encrypted status list/i);
			expect(engineFactory).not.toHaveBeenCalled();
		}
	);
});
