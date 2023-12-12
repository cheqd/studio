import { PUBLIC_KEY_LENGTH as ED25519_PUBLIC_KEY_LENGTH, convertPublicKeyToX25519 } from '@stablelib/ed25519';
import type { IValidationResult } from './validator.js';

export function ValidateEd25519PubKey(keyBytes: Uint8Array): IValidationResult {
	if (keyBytes.length != ED25519_PUBLIC_KEY_LENGTH) {
		return {
			valid: false,
			error: 'The length of public key is not 32 bytes',
		};
	}
	try {
		// Throws if given an invalid public key.
		convertPublicKeyToX25519(keyBytes);
	} catch (e) {
		return {
			valid: false,
			error: 'The public key is not valid Ed25519 public key',
		};
	}
	return { valid: true };
}
