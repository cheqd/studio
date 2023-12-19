import { describe, it, expect } from '@jest/globals';
import { CredentialStatusValidator } from '../../controllers/validator/credential_status';

const credentialStatusValidator = new CredentialStatusValidator();

describe('isCredentialStatusValidator. Positive.', () => {
	it('should return true for valid credential status', () => {
		const res = credentialStatusValidator.validate({
			id: 'https://resolver.cheqd.net/1.0/identifiers/did:cheqd:testnet:7c2b990c-3d05-4ebf-91af-f4f4d0091d2e?resourceName=cheqd-suspension-1&resourceType=StatusList2021Suspension#20',
			statusListIndex: '20',
			statusPurpose: 'suspension',
			type: 'StatusList2021Entry',
		});
		expect(res.valid).toBeTruthy();
		expect(res.error).toBeUndefined();
	});
});

describe('isCredentialStatusValidator. Negative.', () => {
	it('should return false for invalid credential status. id not placed in structure', () => {
		const res = credentialStatusValidator.validate({
			statusListIndex: '20',
			statusPurpose: 'suspension',
			type: 'StatusList2021Entry',
		} as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('id is required');
	});
	it('should return false for invalid credential status. statusListIndex not placed in structure', () => {
		const res = credentialStatusValidator.validate({
			id: 'https://resolver.cheqd.net/1.0/identifiers/did:cheqd:testnet:7c2b990c-3d05-4ebf-91af-f4f4d0091d2e?resourceName=cheqd-suspension-1&resourceType=StatusList2021Suspension#20',
			statusPurpose: 'suspension',
			type: 'StatusList2021Entry',
		} as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('statusListIndex is required');
	});
	it('should return false for invalid credential status. statusPurpose not placed in structure', () => {
		const res = credentialStatusValidator.validate({
			id: 'https://resolver.cheqd.net/1.0/identifiers/did:cheqd:testnet:7c2b990c-3d05-4ebf-91af-f4f4d0091d2e?resourceName=cheqd-suspension-1&resourceType=StatusList2021Suspension#20',
			statusListIndex: '20',
			type: 'StatusList2021Entry',
		} as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('statusPurpose is required');
	});
	it('should return false for invalid credential status. type not placed in structure', () => {
		const res = credentialStatusValidator.validate({
			id: 'https://resolver.cheqd.net/1.0/identifiers/did:cheqd:testnet:7c2b990c-3d05-4ebf-91af-f4f4d0091d2e?resourceName=cheqd-suspension-1&resourceType=StatusList2021Suspension#20',
			statusListIndex: '20',
			statusPurpose: 'suspension',
		} as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('type is required');
	});
	it('should return false for invalid credential status. Credential status statusPurpose must be either revocation or suspension', () => {
		const res = credentialStatusValidator.validate({
			id: 'https://resolver.cheqd.net/1.0/identifiers/did:cheqd:testnet:7c2b990c-3d05-4ebf-91af-f4f4d0091d2e?resourceName=cheqd-suspension-1&resourceType=StatusList2021Suspension#20',
			statusListIndex: '20',
			statusPurpose: 'invalid',
			type: 'StatusList2021Entry',
		} as any);
		expect(res.valid).toBeFalsy();
		expect(res.error).toBeDefined();
		expect(res.error).toContain('Credential status statusPurpose must be either revocation or suspension');
	});
});
