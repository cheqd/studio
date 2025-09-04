import * as dotenv from 'dotenv';

dotenv.config();

interface EncryptedData {
	encrypted: string;
	iv: string;
	tag: string;
}

export class EncryptionService {
	private encryptionSecret: string;

	public static instance = new EncryptionService();

	constructor() {
		this.encryptionSecret = process.env.PROVIDER_ENCRYPTION_KEY || '';
		if (!this.encryptionSecret) {
			throw new Error('PROVIDER_ENCRYPTION_KEY environment variable is required');
		}
	}

	async encrypt(text: string): Promise<EncryptedData> {
		// Use a constant salt based on the service name for consistency
		const providerId = 'provider-service';

		// Derive symmetric key
		const derivedKey = await this.deriveSymmetricKeyFromSecret(providerId, this.encryptionSecret);

		// Generate random IV
		const iv = crypto.getRandomValues(new Uint8Array(12));

		// Encrypt the text
		const encrypted = await crypto.subtle.encrypt(
			{
				name: 'AES-GCM',
				iv,
			},
			derivedKey,
			new TextEncoder().encode(text)
		);

		return {
			encrypted: Buffer.from(encrypted).toString('hex'),
			iv: Buffer.from(iv).toString('hex'),
			tag: '', // GCM includes authentication tag in encrypted data
		};
	}

	async decrypt(encrypted: string, iv: string, tag: string): Promise<string> {
		// Use the same salt as encryption
		const providerId = 'provider-service';

		// Derive symmetric key
		const derivedKey = await this.deriveSymmetricKeyFromSecret(providerId, this.encryptionSecret);

		// Convert hex strings back to Uint8Arrays
		const encryptedData = new Uint8Array(Buffer.from(encrypted, 'hex'));
		const ivBuffer = new Uint8Array(Buffer.from(iv, 'hex'));

		// Decrypt the data
		const decrypted = await crypto.subtle.decrypt(
			{
				name: 'AES-GCM',
				iv: ivBuffer,
			},
			derivedKey,
			encryptedData
		);

		return new TextDecoder().decode(decrypted);
	}

	private async deriveSymmetricKeyFromSecret(
		providerId: string,
		encryptionKey: string,
		iterations = 100_000
	): Promise<CryptoKey> {
		// Create salt from provider ID
		const encoder = new TextEncoder();
		const salt = encoder.encode(providerId);

		// Import encryption key as raw key material
		const keyMaterial = encoder.encode(encryptionKey);
		const key = await crypto.subtle.importKey('raw', keyMaterial, { name: 'PBKDF2' }, false, [
			'deriveBits',
			'deriveKey',
		]);

		// Derive key from encryption secret
		const derivedKey = await crypto.subtle.deriveKey(
			{
				name: 'PBKDF2',
				salt: salt,
				iterations,
				hash: 'SHA-256',
			},
			key,
			{
				name: 'AES-GCM',
				length: 256,
			},
			false,
			['encrypt', 'decrypt']
		);

		return derivedKey;
	}
}
