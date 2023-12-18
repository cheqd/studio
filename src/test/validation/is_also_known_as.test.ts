import { describe, it, expect } from '@jest/globals';
import { AlsoKnownAsValidator } from '../../controllers/validator/also_known_as';

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
		expect(res.error).toContain('Also known as must be an array.');
	});
	it('should return false for invalid alsoKnownAs. It is empty', () => {
		const res = alsoKnownAsValidator.validate([]);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('Also known as must not be empty');
	});
	it('should return false for invalid alsoKnownAs. uri is not a string', () => {
		const res = alsoKnownAsValidator.validate([{ uri: 1, description: 'example' }] as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain("AlsoKnownAs's uri field must be a string");
	});
	it('should return false for invalid alsoKnownAs. uri is not defined', () => {
		const res = alsoKnownAsValidator.validate([{ description: 'example' }] as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain("AlsoKnownAs's uri field is required");
	});
	it('should return false for invalid alsoKnownAs. description is not a string', () => {
		const res = alsoKnownAsValidator.validate([{ uri: 'example.com', description: 1 }] as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain("AlsoKnownAs's description field must be a string");
	});
	it('should return false for invalid alsoKnownAs. description is not defined', () => {
		const res = alsoKnownAsValidator.validate([{ uri: 'example.com' }] as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain("AlsoKnownAs's description field is required");
	});
});
