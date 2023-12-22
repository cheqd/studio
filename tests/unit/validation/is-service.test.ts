import { describe, it, expect } from '@jest/globals';
import { ServiceValidator } from '../../../src/controllers/validator/service';
import { VALID_CHEQD_DID_INDY } from '../constants';

const serviceValidator = new ServiceValidator();

const VALID_SERVICE = {
	id: `${VALID_CHEQD_DID_INDY}#service-1`,
	type: 'LinkedDomains',
	serviceEndpoint: ['https://example.com/'],
};

describe('isService. Positive.', () => {
	it('should return true for valid service', () => {
		const res = serviceValidator.validate([VALID_SERVICE]);
		expect(res.valid).toBeTruthy();
		expect(res.error).toBeUndefined();
	});
});

describe('isService. Negative.', () => {
	it('should return false for invalid service. id not placed in structure', () => {
		const res = serviceValidator.validate([{ ...VALID_SERVICE, id: undefined }] as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('Service has validation errors: service.id is required');
	});
	it('should return false for invalid service. type not placed in structure', () => {
		const res = serviceValidator.validate([{ ...VALID_SERVICE, type: undefined }] as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('Service has validation errors: service.type is required');
	});
	it('should return false for invalid service. serviceEndpoint not placed in structure', () => {
		const res = serviceValidator.validate([{ ...VALID_SERVICE, serviceEndpoint: undefined }] as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('Service has validation errors: service.serviceEndpoint is required');
	});
	it('should return false for invalid service. Not array', () => {
		const res = serviceValidator.validate(VALID_SERVICE as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('Service should be an array');
	});
	it('should return false for invalid service. Invalid id', () => {
		const res = serviceValidator.validate([{ ...VALID_SERVICE, id: 'invalid' }]);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('id does not have right format');
	});
	it('should return false for invalid service. Not unique ids', () => {
		const res = serviceValidator.validate([VALID_SERVICE, VALID_SERVICE]);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('service.id entries are not unique');
	});
	it('should return false for invalid service. serviceEndpoint is not array', () => {
		const res = serviceValidator.validate([{ ...VALID_SERVICE, serviceEndpoint: 'invalid' }]);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('Service has validation errors: service.serviceEndpoint should be an array');
	});
});
