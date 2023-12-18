import { describe, it, expect } from '@jest/globals';
import { CreateDIDDocumentServiceValidator } from '../../controllers/validator/service_create_request';

const serviceValidator = new CreateDIDDocumentServiceValidator();

const VALID_CREATE_DID_SERVICE = {
    idFragment: `service-1`,
    type: 'LinkedDomains',
    serviceEndpoint: ['https://example.com/'],
};

describe('isService. Positive.', () => {
    it('should return true for valid service', () => {
        const res = serviceValidator.validate([VALID_CREATE_DID_SERVICE]);
        expect(res.valid).toBeTruthy();
        expect(res.error).toBeUndefined();
    });
})

describe('isService. Negative.', () => {
    it('should return false for invalid service. Not unique ids', () => {
        const res = serviceValidator.validate([VALID_CREATE_DID_SERVICE, VALID_CREATE_DID_SERVICE]);
        expect(res.valid).toBeFalsy();
        expect(res.error).toBeDefined();
        expect(res.error).toContain('Service ids are not unique');
    })
    // it('should return false for invalid service. serviceEndpoint is not array', () => {
    //     const res = serviceValidator.validate([{ serviceEndpoint: 'invalid' }]);
    //     console.log(res);
    //     expect(res.valid).toBeFalsy();
    //     expect(res.error).toBeDefined();
    //     expect(res.error).toContain('Service serviceEndpoint should be an array');
    // })
});