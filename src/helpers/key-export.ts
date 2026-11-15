import { createCipheriv, createDecipheriv, randomBytes, scrypt, type ScryptOptions } from 'node:crypto';
import type { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { engineErrorResponse } from './engine-errors.js';
import { tryAcquireExportSlot } from './export-concurrency.js';

/**
 * Password-protected export of private key material.
 *
 * Output format `cheqd-studio-key-export` version 1 (JSON):
 *
 * {
 *   "format": "cheqd-studio-key-export",
 *   "version": 1,
 *   "kdf":    { "name": "scrypt", "salt": <base64, 16 bytes>, "N": 131072, "r": 8, "p": 1, "keyLength": 32 },
 *   "cipher": { "name": "aes-256-gcm", "iv": <base64, 12 bytes>, "tag": <base64, 16 bytes> },
 *   "ciphertext": <base64>
 * }
 *
 * key        = scrypt(utf8(password), salt, keyLength, { N, r, p })
 * ciphertext = AES-256-GCM(key, iv, utf8(JSON.stringify(payload)), aad = "cheqd-studio-key-export:v1")
 *
 * The KDF parameters are stored in the envelope so they can be raised later without breaking old exports.
 */
export const KEY_EXPORT_FORMAT = 'cheqd-studio-key-export' as const;
export const KEY_EXPORT_VERSION = 1 as const;

const AAD = Buffer.from(`${KEY_EXPORT_FORMAT}:v${KEY_EXPORT_VERSION}`, 'utf8');
const SALT_BYTES = 16;
const IV_BYTES = 12;
const KEY_BYTES = 32;
const SCRYPT_N = 2 ** 17;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
// Bounds accepted when decrypting, so a hostile envelope cannot request unbounded work or memory.
const MAX_SCRYPT_N = 2 ** 20;
const MAX_PASSWORD_LENGTH = 1024;
const DEFAULT_MIN_PASSWORD_LENGTH = 12;

export interface EncryptedKeyExport {
	format: typeof KEY_EXPORT_FORMAT;
	version: typeof KEY_EXPORT_VERSION;
	kdf: { name: 'scrypt'; salt: string; N: number; r: number; p: number; keyLength: number };
	cipher: { name: 'aes-256-gcm'; iv: string; tag: string };
	ciphertext: string;
}

export type ExportPasswordErrorCode = 'PASSWORD_REQUIRED' | 'WEAK_PASSWORD';

export type ExportPasswordValidation =
	| { ok: true; password: string }
	| { ok: false; code: ExportPasswordErrorCode; error: string };

export function getMinPasswordLength(): number {
	const parsed = Number.parseInt(process.env.KEY_EXPORT_MIN_PASSWORD_LENGTH || '', 10);
	// Never below the default: the setting can raise the bar but not lower it.
	return Number.isInteger(parsed) ? Math.max(DEFAULT_MIN_PASSWORD_LENGTH, parsed) : DEFAULT_MIN_PASSWORD_LENGTH;
}

export function validateExportPassword(value: unknown): ExportPasswordValidation {
	if (typeof value !== 'string' || value.length === 0) {
		return { ok: false, code: 'PASSWORD_REQUIRED', error: 'A password is required to encrypt the exported keys.' };
	}
	const min = getMinPasswordLength();
	if (value.length > MAX_PASSWORD_LENGTH) {
		return {
			ok: false,
			code: 'WEAK_PASSWORD',
			error: `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`,
		};
	}
	if (value.trim().length < min) {
		return { ok: false, code: 'WEAK_PASSWORD', error: `Password must be at least ${min} characters long.` };
	}
	if (new Set(value).size < 5) {
		return { ok: false, code: 'WEAK_PASSWORD', error: 'Password must contain at least 5 different characters.' };
	}
	if (/^(password|passw0rd|qwerty|letmein|12345678|abcdefgh)/i.test(value) && value.length < min + 8) {
		return { ok: false, code: 'WEAK_PASSWORD', error: 'Password is too easy to guess.' };
	}
	return { ok: true, password: value };
}

// Type-only view as Uint8Array: with this repo's TypeScript and @types/node versions, Buffer does not unify with
// the ES Uint8Array type. Runtime value is unchanged.
const u8 = (b: unknown): Uint8Array => b as Uint8Array;

function deriveKey(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		scrypt(u8(Buffer.from(password, 'utf8')), u8(salt), keyLength, options, (error, key) =>
			error ? reject(error) : resolve(key)
		);
	});
}

const scryptOptions = (N: number, r: number, p: number): ScryptOptions => ({
	N,
	r,
	p,
	maxmem: 256 * N * r + 32 * 1024 * 1024,
});

export async function encryptKeyExport(payload: unknown, password: string): Promise<EncryptedKeyExport> {
	const salt = randomBytes(SALT_BYTES);
	const iv = randomBytes(IV_BYTES);
	const key = await deriveKey(password, salt, KEY_BYTES, scryptOptions(SCRYPT_N, SCRYPT_R, SCRYPT_P));
	const cipher = createCipheriv('aes-256-gcm', u8(key), u8(iv));
	cipher.setAAD(u8(AAD));
	const ciphertext = Buffer.concat([
		u8(cipher.update(u8(Buffer.from(JSON.stringify(payload), 'utf8')))),
		u8(cipher.final()),
	]);
	return {
		format: KEY_EXPORT_FORMAT,
		version: KEY_EXPORT_VERSION,
		kdf: {
			name: 'scrypt',
			salt: salt.toString('base64'),
			N: SCRYPT_N,
			r: SCRYPT_R,
			p: SCRYPT_P,
			keyLength: KEY_BYTES,
		},
		cipher: { name: 'aes-256-gcm', iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64') },
		ciphertext: ciphertext.toString('base64'),
	};
}

export async function decryptKeyExport(envelope: EncryptedKeyExport, password: string): Promise<unknown> {
	if (
		envelope?.format !== KEY_EXPORT_FORMAT ||
		envelope.version !== KEY_EXPORT_VERSION ||
		envelope.kdf?.name !== 'scrypt' ||
		envelope.cipher?.name !== 'aes-256-gcm'
	) {
		throw new Error('Unsupported key export format or version.');
	}
	const { N, r, p, keyLength } = envelope.kdf;
	if (
		!Number.isInteger(N) ||
		N < 2 ||
		N > MAX_SCRYPT_N ||
		(N & (N - 1)) !== 0 ||
		r !== SCRYPT_R ||
		p !== SCRYPT_P ||
		keyLength !== KEY_BYTES
	) {
		throw new Error('Unsupported key export format or version: KDF parameters out of range.');
	}
	try {
		const key = await deriveKey(
			password,
			Buffer.from(envelope.kdf.salt, 'base64'),
			keyLength,
			scryptOptions(N, r, p)
		);
		const decipher = createDecipheriv('aes-256-gcm', u8(key), u8(Buffer.from(envelope.cipher.iv, 'base64')));
		decipher.setAAD(u8(AAD));
		decipher.setAuthTag(u8(Buffer.from(envelope.cipher.tag, 'base64')));
		const plaintext = Buffer.concat([
			u8(decipher.update(u8(Buffer.from(envelope.ciphertext, 'base64')))),
			u8(decipher.final()),
		]);
		return JSON.parse(plaintext.toString('utf8'));
	} catch {
		throw new Error('Could not decrypt the key export: wrong password or corrupted data.');
	}
}

/**
 * Validates the `password` in the request body, runs `produce` to gather the key material, and answers with the
 * encrypted envelope. The plaintext never leaves this function. The password is validated before any keys are
 * read, so a bad request never touches key storage.
 */
export async function respondWithEncryptedExport(
	request: Request,
	response: Response,
	produce: () => Promise<unknown>
): Promise<Response> {
	const validation = validateExportPassword(request.body?.password);
	if (!validation.ok) {
		return response.status(StatusCodes.BAD_REQUEST).json({ error: validation.error, code: validation.code });
	}
	const customerId: unknown = response.locals?.customer?.customerId;
	const release = tryAcquireExportSlot(typeof customerId === 'string' ? customerId : undefined);
	if (!release) {
		response.setHeader('Retry-After', '5');
		return response
			.status(StatusCodes.TOO_MANY_REQUESTS)
			.json({ error: 'Too many export requests, try again shortly', code: 'EXPORT_BUSY' });
	}
	try {
		const envelope = await encryptKeyExport(await produce(), validation.password);
		return response.status(StatusCodes.OK).json(envelope);
	} catch (error) {
		// Typed engine errors (for example a missing Credo tenant) keep their mapped status and body.
		const engineError = engineErrorResponse(response, error);
		if (engineError) return engineError;
		return response.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
			error: `Internal error: ${(error as Error)?.message || error}`,
		});
	} finally {
		release();
	}
}
