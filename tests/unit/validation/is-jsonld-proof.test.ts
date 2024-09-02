import { describe, it, expect } from '@jest/globals';
import { JsonLDProofValidator } from '../../../src/controllers/validator/jsonld-proof';
import { JSONLD_PROOF_TYPES } from '../../../src/types/constants';

const jsonldProofValdiator = new JsonLDProofValidator();

const validProof = {
	type: 'Ed25519Signature2020',
	created: '2024-09-02T11:19:17Z',
	verificationMethod: 'did:cheqd:testnet:11ceabbd-1fdc-46c0-a15d-534c07926d2b#key-1',
	proofPurpose: 'assertionMethod',
	proofValue: 'z3yauZKryHsVvnW2y8XCB1b993makLQfk1ocKLyhu6w1q2EgeAqAFEhGE1C44XkCoFVPg7r9BK6dTT6P4XCHo6mZp',
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
	it('should return false for invalid JSONLD proof. No proofValue', () => {
		const result = jsonldProofValdiator.validate({ ...validProof, proofValue: undefined } as any);
		expect(result.valid).toBe(false);
		expect(result.error).toContain('Proof.proofValue or Proof.jws is required');
	});
});
