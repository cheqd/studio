import { describe, it, expect } from '@jest/globals';
import { JWTProofValidator } from '../../controllers/validator/jwt_proof';
import { CREDENTIAL_JWT } from '../constants';
import { JWT_PROOF_TYPE } from '../../types/constants';

const jwtPRoofValidator = new JWTProofValidator();
describe('isJwtProof2020. Positive.', () => {
	it('should return true for valid JWT proof', () => {
		const res = jwtPRoofValidator.validate({
			jwt: CREDENTIAL_JWT,
			type: JWT_PROOF_TYPE,
		});
		expect(res.valid).toBeTruthy();
		expect(res.error).toBeUndefined();
	});
});

describe('isJwtProof2020. Negative.', () => {
	it('should return false for invalid JWT proof. jwt not placed in structure', () => {
		const res = jwtPRoofValidator.validate({
			type: JWT_PROOF_TYPE,
		} as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('JWT is required');
	});
	it('should return false for invalid JWT proof. type not placed in structure', () => {
		const res = jwtPRoofValidator.validate({
			jwt: CREDENTIAL_JWT,
		} as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('Proof type is required');
	});
	it('should return false for invalid JWT proof. Not JWT proof type', () => {
		const res = jwtPRoofValidator.validate({
			jwt: CREDENTIAL_JWT,
			type: 'invalid',
		} as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain(`Only ${JWT_PROOF_TYPE} proof type is supported`);
	});
	it('should return false for invalid JWT proof. JWT is invalid', () => {
		const res = jwtPRoofValidator.validate({
			jwt: 'invalid',
			type: JWT_PROOF_TYPE,
		} as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('JWT is invalid');
	});
});
