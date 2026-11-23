import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CredentialStatusService } from '../../../../src/services/api/credential-status.js';
import { IdentifierService } from '../../../../src/services/api/identifier.js';
import { IdentityServiceStrategySetup } from '../../../../src/services/identity/index.js';
import { EngineRouter } from '../../../../src/services/identity/engine/engine-router.js';
import type { IdentityEngine } from '../../../../src/services/identity/engine/identity-engine.js';
import type { IIdentityService } from '../../../../src/services/identity/index.js';
import type { CustomerEntity } from '../../../../src/database/entities/customer.entity.js';

const customer = { customerId: 'c1' } as CustomerEntity;
const did = 'did:cheqd:testnet:5f3b3b2e-0000-4000-8000-000000000001';

let built: string[];
let recorded: string | null | undefined;

const stubEngine = (name: 'veramo' | 'credo') =>
	({
		name,
		createUnencryptedStatusList2021: async () => {
			throw new Error('stop after routing');
		},
		createUnencryptedBitstringStatusList: async () => {
			throw new Error('stop after routing');
		},
	}) as unknown as IdentityEngine;

beforeEach(() => {
	built = [];
	jest.spyOn(console, 'info').mockImplementation(() => undefined);
	jest.spyOn(console, 'error').mockImplementation(() => undefined);
	const router = new EngineRouter(
		{ recordedEngine: async () => recorded },
		{ flaggedEngine: async () => null },
		{
			veramo: () => {
				built.push('veramo');
				return stubEngine('veramo');
			},
			credo: () => {
				built.push('credo');
				return stubEngine('credo');
			},
		}
	);
	jest.spyOn(IdentifierService.instance, 'get').mockResolvedValue({ did } as never);
	jest.spyOn(IdentityServiceStrategySetup.prototype, 'setupIdentityStrategy').mockImplementation(() => undefined);
	jest.spyOn(IdentityServiceStrategySetup.prototype, 'engine').mockImplementation(async (route, artifact, hints) =>
		router.engineFor(
			{
				route,
				artifact,
				keyType: hints?.keyType,
				encryptedStatusList: hints?.encryptedStatusList,
				flagWhenUnrecorded: hints?.flagWhenUnrecorded,
				creates: hints?.creates,
			},
			{} as IIdentityService
		)
	);
});

afterEach(() => {
	jest.restoreAllMocks();
});

const create = (listType: string, statusPurpose: string) =>
	new CredentialStatusService().createUnencryptedStatusList(
		{ did, statusListName: 'list' } as never,
		{ listType, statusPurpose } as never,
		customer
	);

describe('creating an unencrypted status list follows the engine that holds its DID', () => {
	it.each([
		['a legacy Veramo DID (empty engine column)', '', 'veramo'],
		['a DID recorded as veramo', 'veramo', 'veramo'],
		['a DID recorded as credo', 'credo', 'credo'],
		['a DID Studio has no record of (new, so Credo)', undefined, 'credo'],
	])('%s', async (_label, engineOnDid, expected) => {
		recorded = engineOnDid as string | undefined;
		for (const [listType, purpose] of [
			['StatusList2021', 'revocation'],
			['BitstringStatusList', 'message'],
		]) {
			built = [];
			await create(listType, purpose);
			expect(built).toEqual([expected]);
		}
	});
});
