import { describe, expect, it } from '@jest/globals';
import { shapeKeyResponse } from '../../../../src/services/identity/engine/key-response.js';
import type { IdentityEngine } from '../../../../src/services/identity/engine/identity-engine.js';
import type { CustomerEntity } from '../../../../src/database/entities/customer.entity.js';

const veramo = { name: 'veramo' } as IdentityEngine;
const credo = { name: 'credo' } as IdentityEngine;
const customer = { customerId: 'c1', name: 'n' } as CustomerEntity;
const createdAt = new Date('2026-11-13T00:00:00Z');

// What the Veramo path returns for POST /key/create (contract fixture key-create), and for GET /key/read/:kid
const veramoCreated = {
	kid: 'abcd',
	kms: 'postgres',
	type: 'Ed25519',
	publicKeyHex: 'abcd',
	meta: { algorithms: ['EdDSA', 'Ed25519'] },
	publicKeyAlias: null,
	createdAt,
	updatedAt: null,
	customer,
};
// What the Credo store returns: a narrower record
const credoStored = {
	kid: 'abcd',
	kms: 'postgres',
	type: 'Ed25519',
	publicKeyHex: 'abcd',
	meta: null,
	publicKeyAlias: undefined,
	createdAt,
};

describe('shapeKeyResponse', () => {
	it('returns a Veramo key untouched, as the same object', () => {
		expect(shapeKeyResponse(veramoCreated, veramo, customer)).toBe(veramoCreated);
	});

	it('gives an Ed25519 key from Credo the same JSON as Veramo on create and import', () => {
		const shaped = shapeKeyResponse(credoStored, credo, customer);
		expect(JSON.parse(JSON.stringify(shaped))).toEqual(JSON.parse(JSON.stringify(veramoCreated)));
	});

	it('gives an Ed25519 key from Credo the same JSON as Veramo on read (no customer)', () => {
		const { customer: _omitted, ...veramoRead } = veramoCreated;
		const shaped = shapeKeyResponse(credoStored, credo);
		expect(JSON.parse(JSON.stringify(shaped))).toEqual(JSON.parse(JSON.stringify(veramoRead)));
	});

	it('keeps an alias and meta that are already set, and does not mutate its input', () => {
		const input = { ...credoStored, publicKeyAlias: 'mine', meta: { algorithms: ['x'] } };
		const shaped = shapeKeyResponse(input, credo, customer);
		expect(shaped.publicKeyAlias).toBe('mine');
		expect(shaped.meta).toEqual({ algorithms: ['x'] });
		expect(credoStored.publicKeyAlias).toBeUndefined();
	});

	it('leaves meta null for key types it has no Veramo equivalent for (P-256)', () => {
		expect(shapeKeyResponse({ ...credoStored, type: 'Secp256r1' }, credo, customer).meta).toBeNull();
	});
});
