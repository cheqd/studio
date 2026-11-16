import { describe, expect, it } from '@jest/globals';
import {
	KEY_EXPORT_FORMAT,
	KEY_EXPORT_VERSION,
	decryptKeyExport,
	encryptKeyExport,
	getMinPasswordLength,
	validateExportPassword,
} from '../../../src/helpers/key-export.js';

const PASSWORD = 'correct horse battery staple';
const SECRET_HEX = 'deadbeefcafebabe0123456789abcdef0123456789abcdef0123456789abcdef';
const payload = { dids: [{ did: 'did:cheqd:testnet:abc', export: { keys: [{ privateKeyHex: SECRET_HEX }] } }] };

describe('key export encryption', () => {
	it('produces a versioned envelope that does not contain the plaintext', async () => {
		const envelope = await encryptKeyExport(payload, PASSWORD);
		expect(envelope.format).toBe(KEY_EXPORT_FORMAT);
		expect(envelope.version).toBe(KEY_EXPORT_VERSION);
		expect(envelope.kdf.name).toBe('scrypt');
		expect(envelope.cipher.name).toBe('aes-256-gcm');
		const serialised = JSON.stringify(envelope);
		expect(serialised).not.toContain(SECRET_HEX);
		expect(serialised).not.toContain('privateKeyHex');
		expect(serialised).not.toContain(PASSWORD);
	});

	it('round-trips: decrypts with the same password', async () => {
		const envelope = await encryptKeyExport(payload, PASSWORD);
		expect(await decryptKeyExport(envelope, PASSWORD)).toEqual(payload);
	});

	it('fails with the wrong password', async () => {
		const envelope = await encryptKeyExport(payload, PASSWORD);
		await expect(decryptKeyExport(envelope, 'a different long password')).rejects.toThrow(/decrypt/i);
	});

	it('fails if the ciphertext is tampered with (authenticated encryption)', async () => {
		const envelope = await encryptKeyExport(payload, PASSWORD);
		const bytes = Buffer.from(envelope.ciphertext, 'base64');
		bytes[0] ^= 0xff;
		await expect(decryptKeyExport({ ...envelope, ciphertext: bytes.toString('base64') }, PASSWORD)).rejects.toThrow(
			/decrypt/i
		);
	});

	it('uses a fresh random salt and IV for every export', async () => {
		const a = await encryptKeyExport(payload, PASSWORD);
		const b = await encryptKeyExport(payload, PASSWORD);
		expect(a.kdf.salt).not.toEqual(b.kdf.salt);
		expect(a.cipher.iv).not.toEqual(b.cipher.iv);
		expect(a.ciphertext).not.toEqual(b.ciphertext);
	});

	it('rejects an unsupported version or format on decrypt', async () => {
		const envelope = await encryptKeyExport(payload, PASSWORD);
		await expect(decryptKeyExport({ ...envelope, version: 99 as never }, PASSWORD)).rejects.toThrow(/unsupported/i);
		await expect(decryptKeyExport({ ...envelope, format: 'other' as never }, PASSWORD)).rejects.toThrow(
			/unsupported/i
		);
	});
});

describe('validateExportPassword', () => {
	it('rejects a missing password with PASSWORD_REQUIRED', () => {
		for (const value of [undefined, null, '', 42, {}]) {
			const result = validateExportPassword(value);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.code).toBe('PASSWORD_REQUIRED');
		}
	});

	it('rejects weak passwords with WEAK_PASSWORD', () => {
		for (const value of ['short', 'aaaaaaaaaaaaaaaa', '            ', 'password1234']) {
			const result = validateExportPassword(value);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.code).toBe('WEAK_PASSWORD');
		}
	});

	it('accepts a strong passphrase', () => {
		expect(validateExportPassword(PASSWORD)).toEqual({ ok: true, password: PASSWORD });
	});

	it('honours KEY_EXPORT_MIN_PASSWORD_LENGTH', () => {
		process.env.KEY_EXPORT_MIN_PASSWORD_LENGTH = '20';
		try {
			expect(validateExportPassword(PASSWORD).ok).toBe(true); // 27 chars
			expect(validateExportPassword('only fifteen chars').ok).toBe(false); // 18 chars
		} finally {
			delete process.env.KEY_EXPORT_MIN_PASSWORD_LENGTH;
		}
	});

	it('never lets KEY_EXPORT_MIN_PASSWORD_LENGTH drop below 12', () => {
		try {
			const cases: Array<[string, number]> = [
				['0', 12],
				['3', 12],
				['8', 12],
				['12', 12],
				['20', 20],
				['abc', 12],
			];
			for (const [value, expected] of cases) {
				process.env.KEY_EXPORT_MIN_PASSWORD_LENGTH = value;
				expect(getMinPasswordLength()).toBe(expected);
			}
			delete process.env.KEY_EXPORT_MIN_PASSWORD_LENGTH;
			expect(getMinPasswordLength()).toBe(12);
		} finally {
			delete process.env.KEY_EXPORT_MIN_PASSWORD_LENGTH;
		}
	});

	it('rejects an envelope whose authentication tag is truncated', async () => {
		const envelope = await encryptKeyExport(payload, PASSWORD);
		const tag = Buffer.from(envelope.cipher.tag, 'base64');
		expect(tag.length).toBe(16);
		for (const length of [4, 8, 15]) {
			const truncated = {
				...envelope,
				cipher: { ...envelope.cipher, tag: tag.subarray(0, length).toString('base64') },
			};
			await expect(decryptKeyExport(truncated, PASSWORD)).rejects.toThrow(/wrong password or corrupted/);
		}
	});
});
