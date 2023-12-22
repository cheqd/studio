import { describe, it, expect } from '@jest/globals';
import { CreateDIDDocumentServiceValidator } from '../../../src/controllers/validator/service-create-request';

const createDIDDocumentServiceValidator = new CreateDIDDocumentServiceValidator();

const VALID_CREATE_DID_SERVICE = {
	idFragment: `service-1`,
	type: 'LinkedDomains',
	serviceEndpoint: ['https://example.com/'],
};

describe('isCreateDidService. Positive.', () => {
	it('should return true for valid service', () => {
		const res = createDIDDocumentServiceValidator.validate([VALID_CREATE_DID_SERVICE]);
		expect(res.valid).toBeTruthy();
		expect(res.error).toBeUndefined();
	});
});

describe('isCreateDidService. Negative.', () => {
	it('should return false for invalid service. idFragment not placed in structure', () => {
		const res = createDIDDocumentServiceValidator.validate([
			{ ...VALID_CREATE_DID_SERVICE, idFragment: undefined },
		] as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain(
			'Service for Create DID Request has validation errors: service.id is required in object'
		);
	});
	it('should return false for invalid service. type not placed in structure', () => {
		const res = createDIDDocumentServiceValidator.validate([
			{ ...VALID_CREATE_DID_SERVICE, type: undefined },
		] as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('type is required');
	});
	it('should return false for invalid service. serviceEndpoint not placed in structure', () => {
		const res = createDIDDocumentServiceValidator.validate([
			{ ...VALID_CREATE_DID_SERVICE, serviceEndpoint: undefined },
		] as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('serviceEndpoint is required');
	});
	it('should return false for invalid service. Not unique ids', () => {
		const res = createDIDDocumentServiceValidator.validate([VALID_CREATE_DID_SERVICE, VALID_CREATE_DID_SERVICE]);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('Service for Create DID Request does not have unique service.');
	});
	it('should return false for invalid service. serviceEndpoint is not array', () => {
		const res = createDIDDocumentServiceValidator.validate([
			{ ...VALID_CREATE_DID_SERVICE, serviceEndpoint: 'invalid' },
		] as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain(
			'Service for Create DID Request has validation errors: service.serviceEndpoint should be an array in object'
		);
	});
});
