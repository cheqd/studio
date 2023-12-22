import { DIDDocumentSectionIDValidator } from '../../controllers/validator/did-document-section-id';
import { describe, it, expect } from '@jest/globals';
import { VALID_CHEQD_DID_INDY } from '../constants';

const didDocumentSectionID = new DIDDocumentSectionIDValidator();

describe('isDIDDocumentSectionID. Positive.', () => {
	it('should return true for valid did document section id', () => {
		const res = didDocumentSectionID.validate(`${VALID_CHEQD_DID_INDY}#service-1`);
		expect(res).toBeTruthy();
	});
});

describe('isDIDDocumentSectionID. Negative.', () => {
	it('should return false for invalid did document section id. Not string', () => {
		const res = didDocumentSectionID.validate({} as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('didDocument.<section>.id should be a string');
	});
	it('should return false for invalid did document section id. Not started with DID', () => {
		const res = didDocumentSectionID.validate(`${VALID_CHEQD_DID_INDY}`);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('didDocument.<section>.id does not have right format. Expected DID#keyId');
	});
	it('should return false for invalid did document section id. Not valid DID', () => {
		const res = didDocumentSectionID.validate(`${VALID_CHEQD_DID_INDY}#service-1#service-2`);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('didDocument.<section>.id does not have right format. Expected DID#keyId');
	});
	it('should return false for invalid did document section id. Not valid section', () => {
		const res = didDocumentSectionID.validate(`invalid_did#service-1`);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('Invalid format of DID Document Section ID. DID has unexpected format');
	});
});
