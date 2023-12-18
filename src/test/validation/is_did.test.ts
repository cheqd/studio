import { describe, it, expect } from '@jest/globals';
import { DIDValidator } from '../../controllers/validator/did';
import { VALID_CHEQD_DID_INDY, VALID_CHEQD_DID_UUID, VALID_KEY_DID } from '../constants';
import type { VerificationMethod } from 'did-resolver';

const didValidator = new DIDValidator();

describe('isDid. Positive.', () => {
	it('should return true for valid cheqd did method', () => {
		const res = didValidator.validate(VALID_CHEQD_DID_UUID);
		expect(res.valid).toBeTruthy();
		expect(res.error).toBeUndefined();
	});

	it('should return true for valid cheqd did method', () => {
		const res = didValidator.validate(VALID_CHEQD_DID_INDY);
		expect(res.valid).toBeTruthy();
		expect(res.error).toBeUndefined();
	});

	it('should return true for valid key did method', () => {
		const res = didValidator.validate(VALID_KEY_DID);
		expect(res.valid).toBeTruthy();
		expect(res.error).toBeUndefined();
	});
});

describe('isDid. Negative.', () => {
	it('should return false for invalid did. Not string', () => {
		const res = didValidator.validate({} as VerificationMethod);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('DID should be a string');
	});
	it('should return false cause DID is not started with did:'	, () => {
		const res = didValidator.validate('notdid:cheqd:testnet:90d5c141-724f-47ad-9ae7-a7c33a9e5643');
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('DID should start with did:');
	})
	it('should return false for invalid cheqd did. Invalid UUID id', () => {
		const res = didValidator.validate('did:cheqd:testnet:123');
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('Cheqd Identifier is not valid UUID');
	});
	it('should return false for invalid cheqd did. Invalid indy-style id. Not base58 symbol', () => {
		const res = didValidator.validate('did:cheqd:testnet:OI');
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('Cheqd Identifier is not a valid base58 string');
	});
	it('should return false for invalid cheqd did. Invalid indy-style id. Wrong length', () => {
		const res = didValidator.validate('did:cheqd:testnet:abcdef');
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('Cheqd Identifier does not have 16 bytes length');
	});
	it('should return false for invalid cheqd did. Invalid namespace', () => {
		const res = didValidator.validate('did:cheqd:somenetwork:90d5c141-724f-47ad-9ae7-a7c33a9e5643');
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('Cheqd DID namespace must be testnet or mainnet');
	});
	it('should return false for invalid cheqd did. Invalid method', () => {
		const res = didValidator.validate('did:notcheqd:testnet:90d5c141-724f-47ad-9ae7-a7c33a9e5643');
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('DID method notcheqd is not supported');
	});
});
