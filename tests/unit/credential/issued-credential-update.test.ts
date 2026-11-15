import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { validateIssuedCredentialUpdate } from '../../../src/helpers/issued-credential-update.js';

type Row = Record<string, any>;
let rows: Row[] = [];
const updates: { where: Row; set: Row }[] = [];

jest.unstable_mockModule('../../../src/database/connection/connection.js', () => ({
	Connection: {
		instance: {
			dbConnection: {
				getRepository: () => ({
					findOne: async () => rows[0] ?? null,
					update: async (where: Row, set: Row) => {
						updates.push({ where, set });
						return { affected: 1 };
					},
				}),
			},
		},
	},
}));

const { Credentials } = await import('../../../src/services/api/credentials.js');
const { CredentialController } = await import('../../../src/controllers/api/credential.js');

const customer = { customerId: 'c-1' } as never;

beforeEach(() => {
	updates.length = 0;
	rows = [
		{
			issuedCredentialId: 'id-1',
			providerId: 'studio',
			issuerId: 'did:cheqd:testnet:abc',
			status: 'issued',
			engine: 'credo',
			metadata: { migratedFrom: 'legacy', note: 'old' },
			issuedAt: new Date(),
			customer: { customerId: 'c-1' },
		},
	];
});

describe('validateIssuedCredentialUpdate', () => {
	it('accepts the documented fields', () => {
		expect(
			validateIssuedCredentialUpdate({
				providerCredentialId: 'abc',
				status: 'revoked',
				providerMetadata: { a: 1 },
			})
		).toEqual({ ok: true, value: { providerCredentialId: 'abc', status: 'revoked', metadata: { a: 1 } } });
	});

	it('accepts an empty object', () => {
		expect(validateIssuedCredentialUpdate({})).toEqual({ ok: true, value: {} });
	});

	it.each([
		['engine'],
		['statusFormat'],
		['customer'],
		['issuedCredentialId'],
		['issuerId'],
		['statusRegistry'],
		['x'],
	])('rejects the server-controlled or unknown field %s', (field) => {
		const result = validateIssuedCredentialUpdate({ status: 'issued', [field]: 'value' });
		expect(result.ok).toBe(false);
	});

	it.each([
		[{ status: 'offered' }],
		[{ status: 5 }],
		[{ providerCredentialId: '' }],
		[{ providerCredentialId: 7 }],
		[{ providerMetadata: 'text' }],
		[{ providerMetadata: [] }],
		[{ providerMetadata: {}, metadata: {} }],
		[null],
		[[]],
		['text'],
	])('rejects an invalid value: %j', (body) => {
		expect(validateIssuedCredentialUpdate(body).ok).toBe(false);
	});
});

describe('Credentials.update', () => {
	it('writes only allow-listed fields even if more are passed', async () => {
		await Credentials.instance.update(
			'id-1',
			{ status: 'suspended', engine: 'other', statusFormat: 'x', customer: { customerId: 'c-2' } } as never,
			customer
		);
		const set = updates[0].set;
		expect(Object.keys(set).sort()).toEqual(['status', 'statusUpdatedAt', 'updatedAt']);
		expect(set.status).toBe('suspended');
	});

	it('keeps server-written migration bookkeeping when metadata is replaced', async () => {
		await Credentials.instance.update('id-1', { metadata: { note: 'new' } }, customer);
		expect(updates[0].set.metadata).toEqual({ note: 'new', migratedFrom: 'legacy' });
	});
});

describe('PUT /credentials/issued/:id handler', () => {
	const run = async (body: unknown) => {
		const response: any = {
			locals: { customer },
			status: jest.fn(() => response),
			json: jest.fn(() => response),
		};
		await new CredentialController().updateIssuedCredential({ params: { id: 'id-1' }, body } as never, response);
		return response;
	};

	it('answers 400 invalid_request for a server-controlled field and writes nothing', async () => {
		const response = await run({ engine: 'other' });
		expect(response.status).toHaveBeenCalledWith(400);
		expect(response.json.mock.calls[0][0]).toMatchObject({ success: false, code: 'invalid_request' });
		expect(updates).toHaveLength(0);
	});

	it('answers 200 for an allowed update', async () => {
		const response = await run({ status: 'revoked' });
		expect(response.status).toHaveBeenCalledWith(200);
		expect(updates[0].set.status).toBe('revoked');
	});
});
