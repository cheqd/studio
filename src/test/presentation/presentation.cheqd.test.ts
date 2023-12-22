import { describe, it } from '@jest/globals';
import type { W3CVerifiablePresentation } from '@veramo/core';
import { expect } from '@playwright/test';
import { CheqdW3CVerifiableCredential } from '../../services/w3c-credential';
import { JWT_PROOF_TYPE } from '../../types/constants';
import { CheqdW3CVerifiablePresentation } from '../../services/w3c-presentation';
import {
	CREDENTIAL_JWT,
	HOLDER_DID,
	PRESENTATION_JWT,
	PRESENTATION_OBJECT_CREDENTIAL_JWT,
	VERIFIER_DID,
	PRESENTATION_OBJECT_CREDENTIAL_OBJECT,
	CREDENTIAL_OBJECT,
} from '../constants.js';

describe('Presentation from JWT to object', () => {
	const presentation = new CheqdW3CVerifiablePresentation(PRESENTATION_JWT);

	it('should have a proof', () => {
		expect(presentation.proof).toBeDefined();
		expect(presentation.proof.jwt).toEqual(PRESENTATION_JWT);
		expect(presentation.proof.type).toEqual(JWT_PROOF_TYPE);
	});

	it('should have a type', () => {
		expect(presentation.type).toBeDefined();
		expect(presentation.type).toContain('VerifiablePresentation');
	});

	it('should have holder', () => {
		expect(presentation.holder).toBeDefined();
		expect(presentation.holder).toEqual(HOLDER_DID);
	});

	it('should have verifier', () => {
		expect(presentation.verifier).toBeDefined();
		expect(presentation.verifier).toEqual([VERIFIER_DID]);
	});
	it('should have issuanceDate', () => {
		expect(presentation.issuanceDate).toBeDefined();
		expect(presentation.issuanceDate).toEqual('2023-11-28T12:27:02.000Z');
	});
	it('should have verifiableCredential', () => {
		expect(presentation.verifiableCredential).toBeDefined();
		expect(presentation.verifiableCredential).toHaveLength(1);
		if (presentation.verifiableCredential) {
			expect(presentation.verifiableCredential[0]).toEqual(new CheqdW3CVerifiableCredential(CREDENTIAL_JWT));
		}
	});
});

describe('Presentation from object with credential as JWT', () => {
	const presentation = new CheqdW3CVerifiablePresentation(
		PRESENTATION_OBJECT_CREDENTIAL_JWT as W3CVerifiablePresentation
	);
	it('should have a proof', () => {
		expect(presentation.proof).toBeDefined();
		expect(presentation.proof.jwt).toEqual(PRESENTATION_JWT);
		expect(presentation.proof.type).toEqual(JWT_PROOF_TYPE);
	});

	it('should have a type', () => {
		expect(presentation.type).toBeDefined();
		expect(presentation.type).toContain('VerifiablePresentation');
	});

	it('should have holder', () => {
		expect(presentation.holder).toBeDefined();
		expect(presentation.holder).toEqual(HOLDER_DID);
	});

	it('should have verifier', () => {
		expect(presentation.verifier).toBeDefined();
		expect(presentation.verifier).toEqual([VERIFIER_DID]);
	});
	it('should have verifiableCredential', () => {
		expect(presentation.verifiableCredential).toBeDefined();
		expect(presentation.verifiableCredential).toHaveLength(1);
		if (presentation.verifiableCredential) {
			expect(presentation.verifiableCredential[0]).toEqual(new CheqdW3CVerifiableCredential(CREDENTIAL_JWT));
		}
	});
});

describe('Presentation from object with credential as object', () => {
	const presentation = new CheqdW3CVerifiablePresentation(
		PRESENTATION_OBJECT_CREDENTIAL_OBJECT as W3CVerifiablePresentation
	);
	it('should have a proof', () => {
		expect(presentation.proof).toBeDefined();
		expect(presentation.proof.jwt).toEqual(PRESENTATION_JWT);
		expect(presentation.proof.type).toEqual(JWT_PROOF_TYPE);
	});

	it('should have a type', () => {
		expect(presentation.type).toBeDefined();
		expect(presentation.type).toContain('VerifiablePresentation');
	});

	it('should have holder', () => {
		expect(presentation.holder).toBeDefined();
		expect(presentation.holder).toEqual(HOLDER_DID);
	});

	it('should have verifier', () => {
		expect(presentation.verifier).toBeDefined();
		expect(presentation.verifier).toEqual([VERIFIER_DID]);
	});
	it('should have verifiableCredential', () => {
		expect(presentation.verifiableCredential).toBeDefined();
		expect(presentation.verifiableCredential).toHaveLength(1);
		if (presentation.verifiableCredential) {
			expect(presentation.verifiableCredential[0]).toEqual(new CheqdW3CVerifiableCredential(CREDENTIAL_OBJECT));
		}
	});
});
