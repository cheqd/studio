import pkg from 'pg-connection-string';
import { bases } from 'multiformats/basics';
import { CredoConfigurationError } from './errors.js';

/** Where Credo's Askar store lives, and how to connect to it. Read from the environment, validated in one place. */
export interface CredoStorageConfig {
	database: {
		host: string;
		port: number;
		/** Database name. It is also the Askar store id and default profile. */
		name: string;
		/** The app role. Askar keeps its tables in a schema named after this user. Never an admin account. */
		user: string;
		password: string;
		/** `disable`, `require`, or `verify-ca` (with `caCertificate`) */
		sslMode: 'disable' | 'require' | 'verify-ca';
		caCertificate?: string;
	};
	/** The Askar store key in the form Askar's `raw` method expects (base58 of 32 bytes). Never log it. */
	storeKey: string;
	pool: {
		maxConnections: number;
		/** Seconds */
		idleTimeout: number;
		/** Seconds */
		connectTimeout: number;
	};
}

/** The variables the loader reads. `process.env` satisfies it, and so does a plain object in a test. */
export type Environment = Record<string, string | undefined>;

export const DEFAULT_CREDO_DB_NAME = 'studio_credo';
export const DEFAULT_CREDO_POOL = { maxConnections: 5, idleTimeout: 30, connectTimeout: 10 } as const;

const RAW_KEY_BYTES = 32;

/**
 * Decodes `CREDO_STORE_KEY`: exactly 32 bytes, as 64 hex characters or as base64 (standard or URL-safe).
 * Returns the key in Askar's raw form, or an error message that never repeats the value.
 */
export function parseStoreKey(value: string): { key: string } | { error: string } {
	const text = value.trim();
	let bytes: Buffer | undefined;
	if (/^[0-9a-fA-F]{64}$/.test(text)) bytes = Buffer.from(text, 'hex');
	else if (/^[A-Za-z0-9+/_-]+={0,2}$/.test(text)) bytes = Buffer.from(text, 'base64');
	if (!bytes || bytes.length !== RAW_KEY_BYTES) {
		return { error: 'CREDO_STORE_KEY must be a raw 32-byte key, as 64 hex characters or base64' };
	}
	return { key: bases.base58btc.encode(new Uint8Array(bytes)).slice(1) };
}

function positiveInteger(env: Environment, name: string, fallback: number, problems: string[]): number {
	const value = env[name];
	if (value === undefined || value.trim() === '') return fallback;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1) {
		problems.push(`${name} must be a positive whole number (got "${value}")`);
		return fallback;
	}
	return parsed;
}

/**
 * Reads and validates Credo's storage settings. Throws `CredoConfigurationError` naming every missing or invalid
 * variable. It is only called when the Credo engine is used, so Studio starts without any of these while the
 * engine is not selected.
 *
 * The host, port and TLS settings come from `EXTERNAL_DB_CONNECTION_URL`: Credo's database is on the same cluster.
 * The database name, role and password are Credo's own and have no fallback to Studio's, so Credo can never end up
 * writing into Studio's database or running as Studio's role by omission.
 */
export function loadCredoStorageConfig(env: Environment = process.env as Environment): CredoStorageConfig {
	const problems: string[] = [];

	const { parse } = pkg;
	const cluster = parse(env.EXTERNAL_DB_CONNECTION_URL ?? '');
	if (!(cluster.host && cluster.port)) {
		problems.push('EXTERNAL_DB_CONNECTION_URL is missing or invalid (it supplies the cluster host and port)');
	}

	const name = env.CREDO_DB_NAME?.trim() || DEFAULT_CREDO_DB_NAME;
	if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name)) {
		problems.push(`CREDO_DB_NAME "${name}" is not a plain Postgres database name`);
	}
	if (cluster.database && name === cluster.database) {
		problems.push(
			`CREDO_DB_NAME "${name}" is Studio's own database: Credo's store needs a database of its own, e.g. ${DEFAULT_CREDO_DB_NAME}`
		);
	}

	const user = env.CREDO_DB_USER?.trim();
	if (!user) problems.push(`CREDO_DB_USER is not set (the app role that owns the "${name}" database)`);
	const password = env.CREDO_DB_PASSWORD;
	if (!password) problems.push('CREDO_DB_PASSWORD is not set');

	let storeKey = '';
	if (!env.CREDO_STORE_KEY?.trim()) {
		problems.push('CREDO_STORE_KEY is not set (a raw 32-byte key, as 64 hex characters or base64)');
	} else {
		const parsed = parseStoreKey(env.CREDO_STORE_KEY);
		if ('error' in parsed) problems.push(parsed.error);
		else storeKey = parsed.key;
	}

	const pool = {
		maxConnections: positiveInteger(env, 'CREDO_DB_MAX_CONNECTIONS', DEFAULT_CREDO_POOL.maxConnections, problems),
		idleTimeout: positiveInteger(env, 'CREDO_DB_IDLE_TIMEOUT', DEFAULT_CREDO_POOL.idleTimeout, problems),
		connectTimeout: positiveInteger(env, 'CREDO_DB_CONNECT_TIMEOUT', DEFAULT_CREDO_POOL.connectTimeout, problems),
	};

	if (problems.length > 0) throw new CredoConfigurationError(problems);

	const caCertificate = env.EXTERNAL_DB_CERT || undefined;
	return {
		database: {
			host: cluster.host as string,
			port: Number(cluster.port),
			name,
			user: user as string,
			password: password as string,
			sslMode: cluster.ssl ? (caCertificate ? 'verify-ca' : 'require') : 'disable',
			caCertificate,
		},
		storeKey,
		pool,
	};
}
