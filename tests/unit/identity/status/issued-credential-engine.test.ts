import { describe, expect, it, jest } from '@jest/globals';

const saved: Record<string, unknown>[] = [];
jest.unstable_mockModule('../../../../src/database/connection/connection.js', () => ({
	Connection: {
		instance: {
			dbConnection: {
				getRepository: () => ({
					save: async (row: Record<string, unknown>) => {
						saved.push(row);
						return row;
					},
				}),
			},
		},
	},
}));

const { Credentials } = await import('../../../../src/services/api/credentials.js');
const base = { providerId: 'studio', format: 'jwt' as const, type: ['VerifiableCredential'], issuedAt: new Date() };

describe('issued credential rows record the engine that issued them', () => {
	it('stores credo when the credential was issued through Credo', async () => {
		await new Credentials().create({ customerId: 'c-1' } as never, { ...base, engine: 'credo' });
		expect(saved.at(-1)?.engine).toBe('credo');
	});

	it('keeps the column default (veramo) when no engine is given', async () => {
		await new Credentials().create({ customerId: 'c-1' } as never, base);
		expect(saved.at(-1)?.engine).toBeUndefined();
	});
});
