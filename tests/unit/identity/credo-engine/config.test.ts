import { describe, expect, it } from '@jest/globals';
import { loadCredoStorageConfig, parseStoreKey } from '../../../../src/services/identity/engine/credo/config.js';
import { CredoConfigurationError } from '../../../../src/services/identity/engine/credo/errors.js';

// Obviously fake values: none of these is a secret
const HEX_KEY = 'ab'.repeat(32);
const valid = (): Record<string, string | undefined> => ({
	EXTERNAL_DB_CONNECTION_URL: 'postgres://studio:studio-pw@db.example.invalid:25060/studio?sslmode=require',
	CREDO_DB_USER: 'studio_credo_app',
	CREDO_DB_PASSWORD: 'fake-credo-password',
	CREDO_STORE_KEY: HEX_KEY,
});

describe('Credo storage configuration', () => {
	it('reads a complete configuration, defaulting the database name and the pool', () => {
		const config = loadCredoStorageConfig(valid());
		expect(config.database).toMatchObject({
			host: 'db.example.invalid',
			port: 25060,
			name: 'studio_credo',
			user: 'studio_credo_app',
			password: 'fake-credo-password',
		});
		expect(config.pool).toEqual({ maxConnections: 5, idleTimeout: 30, connectTimeout: 10 });
	});

	it('takes the database name and pool settings from the environment', () => {
		const config = loadCredoStorageConfig({
			...valid(),
			CREDO_DB_NAME: 'studio_credo_staging',
			CREDO_DB_MAX_CONNECTIONS: '8',
			CREDO_DB_IDLE_TIMEOUT: '60',
			CREDO_DB_CONNECT_TIMEOUT: '5',
		});
		expect(config.database.name).toBe('studio_credo_staging');
		expect(config.pool).toEqual({ maxConnections: 8, idleTimeout: 60, connectTimeout: 5 });
	});

	it('never falls back to Studio’s database user, password or EXTERNAL_DB_ENCRYPTION_KEY', () => {
		const env = valid();
		delete env.CREDO_DB_USER;
		delete env.CREDO_DB_PASSWORD;
		delete env.CREDO_STORE_KEY;
		env.EXTERNAL_DB_ENCRYPTION_KEY = '0'.repeat(64);
		try {
			loadCredoStorageConfig(env);
			throw new Error('must have thrown');
		} catch (error) {
			expect(error).toBeInstanceOf(CredoConfigurationError);
			const message = (error as Error).message;
			expect(message).toContain('CREDO_DB_USER is not set');
			expect(message).toContain('CREDO_DB_PASSWORD is not set');
			expect(message).toContain('CREDO_STORE_KEY is not set');
			expect(message).toContain('docs/credo-database-provisioning.md');
		}
	});

	it('refuses Studio’s own database as the Credo database', () => {
		expect(() => loadCredoStorageConfig({ ...valid(), CREDO_DB_NAME: 'studio' })).toThrow(/Studio's own database/);
	});

	it('refuses a database name that is not a plain identifier', () => {
		expect(() => loadCredoStorageConfig({ ...valid(), CREDO_DB_NAME: 'x"; DROP DATABASE y' })).toThrow(
			/CREDO_DB_NAME/
		);
	});

	it('names an unusable cluster URL', () => {
		expect(() => loadCredoStorageConfig({ ...valid(), EXTERNAL_DB_CONNECTION_URL: '' })).toThrow(
			/EXTERNAL_DB_CONNECTION_URL/
		);
	});

	it.each(['0', '-1', 'ten', '1.5'])('rejects %s as a pool setting', (value) => {
		expect(() => loadCredoStorageConfig({ ...valid(), CREDO_DB_MAX_CONNECTIONS: value })).toThrow(
			/CREDO_DB_MAX_CONNECTIONS must be a positive whole number/
		);
	});

	it('reports the failure as a message without stack frames', () => {
		let error: Error | undefined;
		try {
			loadCredoStorageConfig({});
		} catch (e) {
			error = e as Error;
		}
		expect(error?.name).toBe('CredoConfigurationError');
		expect(error?.stack).not.toMatch(/\n\s+at /);
	});

	it('uses TLS settings from the cluster URL and the CA certificate when given', () => {
		expect(loadCredoStorageConfig(valid()).database.sslMode).toBe('require');
		expect(loadCredoStorageConfig({ ...valid(), EXTERNAL_DB_CERT: 'fake-ca' }).database).toMatchObject({
			sslMode: 'verify-ca',
			caCertificate: 'fake-ca',
		});
		const plain = { ...valid(), EXTERNAL_DB_CONNECTION_URL: 'postgres://u:p@localhost:5432/studio' };
		expect(loadCredoStorageConfig(plain).database.sslMode).toBe('disable');
	});
});

describe('Credo store key', () => {
	it('accepts 64 hex characters and the same key as base64, and gives the same raw key', () => {
		const fromHex = parseStoreKey(HEX_KEY);
		const fromBase64 = parseStoreKey(Buffer.from(HEX_KEY, 'hex').toString('base64'));
		const fromBase64Url = parseStoreKey(Buffer.from(HEX_KEY, 'hex').toString('base64url'));
		expect(fromHex).toHaveProperty('key');
		expect(fromBase64).toEqual(fromHex);
		expect(fromBase64Url).toEqual(fromHex);
	});

	it('produces the base58 form Askar’s raw method takes', () => {
		const parsed = parseStoreKey(HEX_KEY) as { key: string };
		expect(parsed.key).toMatch(/^[1-9A-HJ-NP-Za-km-z]{40,50}$/);
	});

	it.each([
		['too short hex', 'ab'.repeat(16)],
		['too long hex', 'ab'.repeat(33)],
		['a passphrase', 'correct horse battery staple'],
		['base64 of 16 bytes', Buffer.alloc(16, 1).toString('base64')],
		['empty', ''],
	])('rejects %s without repeating it', (_label, value) => {
		const result = parseStoreKey(value);
		expect(result).toHaveProperty('error');
		expect(JSON.stringify(result)).not.toContain(value || '\u0000');
	});

	it('is rejected by the loader with a message that does not repeat the key', () => {
		const secret = 'not-a-valid-key-value';
		try {
			loadCredoStorageConfig({ ...valid(), CREDO_STORE_KEY: secret });
			throw new Error('must have thrown');
		} catch (error) {
			expect((error as Error).message).toContain('CREDO_STORE_KEY must be a raw 32-byte key');
			expect((error as Error).message).not.toContain(secret);
		}
	});
});
