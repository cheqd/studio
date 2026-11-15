import { SecretBox } from '@veramo/kms-local';

/**
 * Encrypts the response stored for idempotent replay. Some responses carry bearer credentials (a signed mandate or
 * delegation) that the API documents as "returned once"; kept in plaintext in `idempotencyKey.response` they would
 * stay readable in the database and its backups for the whole retention. Stored sealed, the column holds only
 * ciphertext, and the key is the one that already protects Studio's private keys (`EXTERNAL_DB_ENCRYPTION_KEY`).
 *
 * Trade-off: a replay within the retention still returns the original body (clients keep the retry-safe behaviour),
 * so the credential is recoverable by anyone holding both the database and that key, which is no weaker than the
 * private keys themselves. The alternative, answering a replay with 409 and the resource id only, is safer at rest
 * but breaks the "same request, same answer" contract for a client that lost the first response. Rotating the key
 * makes older stored responses unreadable; a replay then fails closed (see `open`).
 */
export interface ResponseCipher {
	seal(response: Record<string, unknown>): Promise<Record<string, unknown>>;
	/** Returns the plaintext response, or null when it cannot be read (wrong key, damaged). */
	open(stored: Record<string, unknown>): Promise<Record<string, unknown> | null>;
}

const ENVELOPE_VERSION = 1;

interface Envelope {
	v: number;
	enc: string;
}

const isEnvelope = (value: unknown): value is Envelope =>
	!!value &&
	typeof value === 'object' &&
	(value as Envelope).v === ENVELOPE_VERSION &&
	typeof (value as Envelope).enc === 'string';

export function createSecretBoxCipher(
	secretKey: string | undefined = process.env.EXTERNAL_DB_ENCRYPTION_KEY
): ResponseCipher {
	if (!secretKey) throw new Error('EXTERNAL_DB_ENCRYPTION_KEY is required to store idempotent responses');
	const box = new SecretBox(secretKey);
	return {
		async seal(response) {
			return { v: ENVELOPE_VERSION, enc: await box.encrypt(JSON.stringify(response)) };
		},
		async open(stored) {
			// A row written before responses were sealed holds the plain body; it expires with its retention
			if (!isEnvelope(stored)) return stored;
			try {
				return JSON.parse(await box.decrypt(stored.enc)) as Record<string, unknown>;
			} catch {
				return null;
			}
		},
	};
}
