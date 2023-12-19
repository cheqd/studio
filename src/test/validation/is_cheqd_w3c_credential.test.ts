import { CheqdW3CVerifiableCredentialValidator } from "../../controllers/validator/cheqd_credential";
import { CREDENTIAL_OBJECT } from "../constants";
import { describe, it, expect } from '@jest/globals';

const credentialValidator = new CheqdW3CVerifiableCredentialValidator();

describe('isCheqdW3CCredential. Positive.', () => {
    it('should return true for valid credential', () => {
        const res = credentialValidator.validate(CREDENTIAL_OBJECT);
        console.log(res)
        expect(res.valid).toBeTruthy();
        expect(res.error).toBeUndefined();
    })
});

describe('isCheqdW3CCredential. Negative.', () => {
    it('should return false for structure without issuer', () => {
        const res = credentialValidator.validate({ ...CREDENTIAL_OBJECT, issuer: undefined } as any);
        expect(res.valid).toBeFalsy();
        expect(res.error).toBeDefined();
        expect(res.error).toContain('issuer is required');
    })
    it('should return false for structure without issuanceDate', () => {
        const res = credentialValidator.validate({ ...CREDENTIAL_OBJECT, issuanceDate: undefined } as any);
        expect(res.valid).toBeFalsy();
        expect(res.error).toBeDefined();
        expect(res.error).toContain('issuanceDate is required');
    })
    it('should return false for structure without credentialSubject', () => {
        const res = credentialValidator.validate({ ...CREDENTIAL_OBJECT, credentialSubject: undefined } as any);
        expect(res.valid).toBeFalsy();
        expect(res.error).toBeDefined();
        expect(res.error).toContain('credentialSubject is required');
    })
    it('should return false for structure without proof', () => {
        const res = credentialValidator.validate({ ...CREDENTIAL_OBJECT, proof: undefined } as any);
        expect(res.valid).toBeFalsy();
        expect(res.error).toBeDefined();
        expect(res.error).toContain('proof is required');
    })
})