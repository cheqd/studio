import { describe, it, expect } from '@jest/globals';
import { AlsoKnownAsValidator } from '../../controllers/validator/also-known-as';

const alsoKnownAsValidator = new AlsoKnownAsValidator();

describe('isAlsoKnownAs. Positive.', () => {
	it('should return true for valid alsoKnownAs', () => {
		const res = alsoKnownAsValidator.validate([{ uri: 'https://example.com/', description: 'example' }]);
		expect(res.valid).toBeTruthy();
		expect(res.error).toBeUndefined();
	});
});

describe('isAlsoKnownAs. Negative.', () => {
	it('should return false for invalid alsoKnownAs. It is not an Array', () => {
		const res = alsoKnownAsValidator.validate({ uri: 'example.com', description: 'example' } as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('alsoKnownAs must be an array.');
	});
	it('should return false for invalid alsoKnownAs. It is empty', () => {
		const res = alsoKnownAsValidator.validate([]);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('alsoKnownAs must have at least one entry.');
	});
	it('should return false for invalid alsoKnownAs. uri is not a string', () => {
		const res = alsoKnownAsValidator.validate([{ uri: 1, description: 'example' }] as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain("alsoKnownAs has validation errors: alsoKnownAs.uri field must be a string");
	});
	it('should return false for invalid alsoKnownAs. uri is not defined', () => {
		const res = alsoKnownAsValidator.validate([{ description: 'example' }] as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain("alsoKnownAs has validation errors: alsoKnownAs.uri field is required");
	});
	it('should return false for invalid alsoKnownAs. description is not a string', () => {
		const res = alsoKnownAsValidator.validate([{ uri: 'example.com', description: 1 }] as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain("alsoKnownAs has validation errors: alsoKnownAs.description field must be a string");
	});
	it('should return false for invalid alsoKnownAs. description is not defined', () => {
		const res = alsoKnownAsValidator.validate([{ uri: 'example.com' }] as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain("alsoKnownAs has validation errors: alsoKnownAs.description field is required");
	});
});
