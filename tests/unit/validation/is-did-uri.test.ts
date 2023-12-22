import { DIDURIValidator } from '../../../src/controllers/validator/did-uri';
import { describe, it, expect } from '@jest/globals';

const didURIValidator = new DIDURIValidator();

describe('isDidURI. Positive.', () => {
	it('should return true for valid cheqd did method', () => {
		const res = didURIValidator.validate('https://cheqd.io/solutions/#');
		expect(res).toBeTruthy();
	});
});
