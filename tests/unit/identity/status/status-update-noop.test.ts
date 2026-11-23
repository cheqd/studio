/**
 * U-58: a revoke, suspend or reinstate that would change nothing answers 409 with a stable `code`, on both engines.
 * The Veramo cases read the status through the real did-provider-cheqd check (list fetch stubbed); the Credo
 * engine's own reads are exercised in tests/unit/identity/credo-engine/status-lists.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Cheqd } from '@cheqd/did-provider-cheqd';
import { createBitstring, encodeBitstring, setBitstringStatus } from '@credo-ts/cheqd';
import { Veramo } from '../../../../src/services/identity/providers/studio/agent.js';
import {
	statusTransitionConflict,
	statusUpdateConflict,
	statusUpdateFailure,
	type StatusUpdateAction,
} from '../../../../src/services/api/status-update-outcome.js';
import type { CustomerEntity } from '../../../../src/database/entities/customer.entity.js';

const DID = 'did:cheqd:testnet:11111111-1111-4111-8111-111111111111';
const LIST_URL = `https://resolver.cheqd.net/1.0/identifiers/${DID}?resourceName=bits&resourceType=BitstringStatusListCredential`;
const customer = { customerId: 'c-1' } as CustomerEntity;

// Index 4 valid, 5 revoked, 6 suspended
function publishedList() {
	const bits = createBitstring(131072, 2);
	setBitstringStatus(bits, 5, 2, 1);
	setBitstringStatus(bits, 6, 2, 2);
	return {
		bitstringStatusListCredential: {
			'@context': ['https://www.w3.org/ns/credentials/v2'],
			type: ['VerifiableCredential', 'BitstringStatusListCredential'],
			issuer: { id: DID },
			credentialSubject: {
				type: 'BitstringStatusList',
				statusPurpose: 'message',
				encodedList: encodeBitstring(bits),
			},
			proof: { type: 'JwtProof2020', jwt: 'a.b.c' },
		},
		metadata: { encrypted: false, encoding: 'base64url', length: 131072, statusSize: 2 },
	};
}

const bitstringCredential = (index: number) => ({
	issuer: { id: DID },
	credentialSubject: { id: 'did:key:z6Mkholder' },
	credentialStatus: {
		id: `${LIST_URL}#${index}`,
		type: 'BitstringStatusListEntry',
		statusPurpose: 'message',
		statusListIndex: String(index),
		statusListCredential: LIST_URL,
		statusSize: 2,
	},
});

/** The Veramo service's status read, backed by the real plugin method. */
function veramoReader() {
	const plugin = new Cheqd({ providers: [{ network: 'testnet' }] } as unknown as ConstructorParameters<
		typeof Cheqd
	>[0]);
	const context = { agent: { verifyCredential: async () => ({ verified: true }) } };
	const agent = {
		cheqdCheckBitstringStatus: (args: unknown) =>
			plugin.methods!.cheqdCheckBitstringStatus(args as never, context as never),
	};
	return {
		checkBitstringStatusList: (did: string, entry: never) =>
			Veramo.instance.checkBitstringStatusList(agent as never, did, entry),
		checkStatusList2021: jest.fn(async () => ({ revoked: false })),
	};
}

describe('no-op status changes on the Veramo engine (Bitstring, real plugin read)', () => {
	let fetchSpy: ReturnType<typeof jest.spyOn>;
	beforeEach(() => {
		fetchSpy = jest
			.spyOn(globalThis, 'fetch')
			.mockImplementation(async () => new Response(JSON.stringify(publishedList()), { status: 200 }));
	});
	afterEach(() => fetchSpy.mockRestore());

	it.each<[StatusUpdateAction, number, string | null]>([
		['revoke', 5, 'already_revoked'],
		['revoke', 6, null], // revoking a suspended credential is a real change
		['revoke', 4, null],
		['suspend', 6, 'already_suspended'],
		['suspend', 5, 'credential_revoked'],
		['suspend', 4, null],
		['reinstate', 4, 'not_suspended'],
		['reinstate', 5, 'credential_revoked'],
		['reinstate', 6, null],
	])('%s of index %i answers %s', async (action, index, code) => {
		const outcome = await statusUpdateConflict(
			action,
			bitstringCredential(index),
			'BitstringStatusList',
			veramoReader(),
			customer
		);
		if (code === null) expect(outcome).toBeNull();
		else
			expect(outcome).toMatchObject({
				statusCode: 409,
				code,
				error: expect.stringMatching(/^Nothing was changed/),
			});
	});
});

describe('no-op status changes on StatusList2021 (Veramo check shape)', () => {
	const sl2021 = (purpose: 'revocation' | 'suspension') => ({
		issuer: DID,
		credentialStatus: {
			id: `https://resolver.cheqd.net/1.0/identifiers/${DID}?resourceName=list-a&resourceType=StatusList2021${purpose === 'revocation' ? 'Revocation' : 'Suspension'}#10`,
			type: 'StatusList2021Entry',
			statusPurpose: purpose,
			statusListIndex: '10',
		},
	});

	it('reads the right list and answers 409 for each no-op', async () => {
		const reader = {
			checkBitstringStatusList: jest.fn(async () => ({})),
			checkStatusList2021: jest.fn(async (_did: string, options: { statusPurpose: string }) =>
				options.statusPurpose === 'revocation' ? { revoked: true } : { suspended: true }
			),
		};
		const revoke = await statusUpdateConflict('revoke', sl2021('revocation'), 'StatusList2021', reader, customer);
		expect(revoke).toMatchObject({ statusCode: 409, code: 'already_revoked' });
		expect(reader.checkStatusList2021).toHaveBeenLastCalledWith(
			DID,
			{ statusListName: 'list-a', statusPurpose: 'revocation', statusListIndex: '10' },
			customer
		);
		const suspend = await statusUpdateConflict('suspend', sl2021('suspension'), 'StatusList2021', reader, customer);
		expect(suspend).toMatchObject({ statusCode: 409, code: 'already_suspended' });

		reader.checkStatusList2021.mockImplementation(async () => ({ suspended: false }));
		const reinstate = await statusUpdateConflict(
			'reinstate',
			sl2021('suspension'),
			'StatusList2021',
			reader,
			customer
		);
		expect(reinstate).toMatchObject({ statusCode: 409, code: 'not_suspended' });
		expect(
			await statusUpdateConflict('suspend', sl2021('suspension'), 'StatusList2021', reader, customer)
		).toBeNull();
	});
});

describe('when the status cannot be read the update decides', () => {
	it('returns null for an undecodable credential, a failing read, or an encrypted list', async () => {
		const failing = {
			checkBitstringStatusList: async () => {
				throw new Error('STATUS_RETRIEVAL_ERROR');
			},
			checkStatusList2021: async () => ({ revoked: true }),
		};
		expect(await statusUpdateConflict('revoke', 'not-a-jwt', 'BitstringStatusList', failing, customer)).toBeNull();
		expect(
			await statusUpdateConflict('revoke', bitstringCredential(5), 'BitstringStatusList', failing, customer)
		).toBeNull();
		const revoked = {
			checkBitstringStatusList: async () => ({ status: 1 }),
			checkStatusList2021: async () => ({}),
		};
		expect(
			await statusUpdateConflict(
				'revoke',
				bitstringCredential(5),
				'BitstringStatusList',
				revoked,
				customer,
				'key'
			)
		).toBeNull();
	});
});

describe('no-op reported by the engine itself (a race after the read)', () => {
	it('answers 409 with the same codes', () => {
		expect(statusUpdateFailure('revoke', { updated: false, statusValue: 1 })).toMatchObject({
			statusCode: 409,
			code: 'already_revoked',
		});
		expect(statusUpdateFailure('suspend', { updated: [false], statusValues: [2] })).toMatchObject({
			statusCode: 409,
			code: 'already_suspended',
		});
		expect(
			statusUpdateFailure('reinstate', {
				updated: false,
				statusValue: 0,
				error: { message: 'Credential already has status value 0 (valid)' },
			})
		).toMatchObject({ statusCode: 409, code: 'not_suspended' });
	});

	it('keeps a genuine failure non-409 and without a code', () => {
		const failure = statusUpdateFailure('revoke', { updated: false, statusValue: 3 });
		expect(failure?.statusCode).toBe(500);
		expect(failure?.code).toBeUndefined();
	});

	it('maps every transition', () => {
		expect(statusTransitionConflict('revoke', 'suspended')).toBeNull();
		expect(statusTransitionConflict('reinstate', 'suspended')).toBeNull();
		expect(statusTransitionConflict('suspend', 'valid')).toBeNull();
		expect(statusTransitionConflict('reinstate', 'revoked')?.code).toBe('credential_revoked');
	});
});
