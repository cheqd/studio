import { describe, it } from "@jest/globals";
import { CheqdW3CVerifiableCredential } from "../../types/credential.js";
import { expect } from "@playwright/test";
import { JWT_PROOF_TYPE } from "../../types/constants.js";
import { CREDENTIAL_JWT, CREDENTIAL_OBJECT, CREDENTIAL_SUBJECT_ID, ISSUIER_DID } from "../constants.js";

describe('Credential from JWT to object', () => {
    const credential = new CheqdW3CVerifiableCredential(CREDENTIAL_JWT);

    it('should have a proof', () => {
        expect(credential.proof).toBeDefined();
        expect(credential.proof.jwt).toEqual(CREDENTIAL_JWT);
        expect(credential.proof.type).toEqual(JWT_PROOF_TYPE);
    })

    it('should have a type', () => {
        expect(credential.type).toBeDefined();
        expect(credential.type).toContain('VerifiableCredential');
    })
    it('should have a context', () => {
        expect(credential['@context']).toBeDefined();
        expect(credential['@context']).toContain('https://www.w3.org/2018/credentials/v1');
    })
    it('should have a credentialSubject', () => {
        expect(credential.credentialSubject).toBeDefined();
        expect(credential.credentialSubject).toEqual({
            gender: "male",
            name: "Bob",
            id: CREDENTIAL_SUBJECT_ID
          });
    })
    it('should have an issuer', () => {
        expect(credential.issuer).toBeDefined();
        expect(credential.issuer).toEqual(ISSUIER_DID);
    })
    it('should have an issuanceDate', () => {
        expect(credential.issuanceDate).toBeDefined();
        expect(credential.issuanceDate).toEqual('2023-06-08T13:49:28.000Z');
    })
})

describe('Credential from object ', () => {
    const credential = new CheqdW3CVerifiableCredential(CREDENTIAL_OBJECT);
    
    it('should have a proof', () => {
        expect(credential.proof).toBeDefined();
        expect(credential.proof.jwt).toEqual(CREDENTIAL_JWT);
        expect(credential.proof.type).toEqual(JWT_PROOF_TYPE);
    })

    it('should have a type', () => {
        expect(credential.type).toBeDefined();
        expect(credential.type).toContain('VerifiableCredential');
    })
    it('should have a context', () => {
        expect(credential['@context']).toBeDefined();
        expect(credential['@context']).toContain('https://www.w3.org/2018/credentials/v1');
    })
    it('should have a credentialSubject', () => {
        expect(credential.credentialSubject).toBeDefined();
        expect(credential.credentialSubject).toEqual({
            gender: "male",
            name: "Bob",
            id: CREDENTIAL_SUBJECT_ID
          });
    })
    it('should have an issuer', () => {
        expect(credential.issuer).toBeDefined();
        expect(credential.issuer).toEqual(ISSUIER_DID);
    })
    it('should have an issuanceDate', () => {
        expect(credential.issuanceDate).toBeDefined();
        expect(credential.issuanceDate).toEqual('2023-06-08T13:49:28.000Z');
    })
})