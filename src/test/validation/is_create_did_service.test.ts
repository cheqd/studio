import { describe, it, expect } from '@jest/globals';
import { CreateDIDDocumentServiceValidator } from '../../controllers/validator/service_create_request';

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
		expect(res.error).toContain('idFragment is required');
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
		expect(res.error).toContain('Service for CreateDID Request has not unique ids');
	});
	it('should return false for invalid service. serviceEndpoint is not array', () => {
		const res = createDIDDocumentServiceValidator.validate([
			{ ...VALID_CREATE_DID_SERVICE, serviceEndpoint: 'invalid' },
		] as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('ServiceEndpoint should be an array');
	});

	it('should return false for invalid service. idFragment is not defined', () => {
		const res = createDIDDocumentServiceValidator.validate([
			{ ...VALID_CREATE_DID_SERVICE, idFragment: undefined },
		] as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('idFragment is required');
	});
});
