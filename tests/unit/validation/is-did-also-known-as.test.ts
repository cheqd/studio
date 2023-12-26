import { AlsoKnownAsValidator } from '../../../src/controllers/validator/did-also-known-as';
import { describe, it, expect } from '@jest/globals';

const alsoKnownAsValidator = new AlsoKnownAsValidator();

describe('isAlsoKnownAs. Positive.', () => {
	it('should return true for valid cheqd did method', () => {
		const res = alsoKnownAsValidator.validate(['https://cheqd.io/solutions/#']);
		expect(res).toBeTruthy();
	});
});

describe('isAlsoKnownAs. Negative.', () => {
	it('should return false for invalid alsoKnownAs. It is not an Array', () => {
		const res = alsoKnownAsValidator.validate({ uri: 'example.com', description: 'example' } as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('alsoKnownAs must be an array.');
	});
});
