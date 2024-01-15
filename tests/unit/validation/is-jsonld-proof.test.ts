import { describe, it, expect } from '@jest/globals';
import { JsonLDProofValidator } from '../../../src/controllers/validator/jsonld-proof';
import { JSONLD_PROOF_TYPES } from '../../../src/types/constants';

const jsonldProofValdiator = new JsonLDProofValidator();

const validProof = {
	type: 'Ed25519Signature2018',
	created: '2023-12-26T12:44:49Z',
	verificationMethod: 'did:cheqd:testnet:4JdgsZ4A8LegKXdsKE3v6X#key-1',
	proofPurpose: 'assertionMethod',
	jws: 'eyJhbGciOiJFZERTQSIsImI2NCI6ZmFsc2UsImNyaXQiOlsiYjY0Il19..ZUkh4FZ9IcxZK-H6hr0fduq5q4MBYrRfihENJXeJGzqgQkEy16dHwcowbE8NZwNYzmz5MjVJ73q7pkRTg6BvCw',
};

describe('isJSONLDProofValidator. Positive', () => {
	it('should return true for valid JSONLD proof', () => {
		const result = jsonldProofValdiator.validate(validProof);
		expect(result.valid).toBe(true);
	});
});

describe('isJSONLDProofValidator. Negative', () => {
	it('should return false for invalid JSONLD proof. No type', () => {
		const result = jsonldProofValdiator.validate({ ...validProof, type: undefined } as any);
		expect(result.valid).toBe(false);
		expect(result.error).toContain('Proof.type is required');
	});
	it('should return false for invalid JSONLD proof. Invalid type', () => {
		const result = jsonldProofValdiator.validate({ ...validProof, type: 'someType' } as any);
		expect(result.valid).toBe(false);
		expect(result.error).toContain(`Only ${JSONLD_PROOF_TYPES.join(', ')} proof types are supported`);
	});

	it('should return false for invalid JSONLD proof. No created', () => {
		const result = jsonldProofValdiator.validate({ ...validProof, created: undefined } as any);
		expect(result.valid).toBe(false);
		expect(result.error).toContain('Proof.created is required');
	});
	it('should return false for invalid JSONLD proof. No verificationMethod', () => {
		const result = jsonldProofValdiator.validate({ ...validProof, verificationMethod: undefined } as any);
		expect(result.valid).toBe(false);
		expect(result.error).toContain('Proof.verificationMethod is required');
	});
	it('should return false for invalid JSONLD proof. No proofPurpose', () => {
		const result = jsonldProofValdiator.validate({ ...validProof, proofPurpose: undefined } as any);
		expect(result.valid).toBe(false);
		expect(result.error).toContain('Proof.proofPurpose is required');
	});
	it('should return false for invalid JSONLD proof. No jws', () => {
		const result = jsonldProofValdiator.validate({ ...validProof, jws: undefined } as any);
		expect(result.valid).toBe(false);
		expect(result.error).toContain('Proof.jws is required');
	});
});
