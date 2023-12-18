import { describe, it, expect } from '@jest/globals';
import { ServiceValidator } from '../../controllers/validator/service';

const serviceValidator = new ServiceValidator();

const VALID_SERVICE = {
    id: `service-1`,
    type: 'LinkedDomains',
    serviceEndpoint: ['https://example.com/'],
};

describe('isService. Positive.', () => {
    it('should return true for valid service', () => {
        const res = serviceValidator.validate([VALID_SERVICE]);
        expect(res.valid).toBeTruthy();
        expect(res.error).toBeUndefined();
    });
})

describe('isService. Negative.', () => {
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
        expect(res.error).toContain('Service ids are not unique');
    })
    it('should return false for invalid service. serviceEndpoint is not array', () => {
        const res = serviceValidator.validate([{ ...VALID_SERVICE, serviceEndpoint: 'invalid' }]);
        expect(res.valid).toBeFalsy();
        expect(res.error).toBeDefined();
        expect(res.error).toContain('Service serviceEndpoint should be an array');
    })
});