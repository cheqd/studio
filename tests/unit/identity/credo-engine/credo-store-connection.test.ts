import { beforeAll, describe, expect, it } from '@jest/globals';
import {
	ASKAR_CONSUMED_POSTGRES_PARAMETERS,
	assertAskarSafePostgresUri,
	credoPostgresConnection,
} from '../../../../src/services/identity/engine/credo/credo-runtime.js';
import type { CredoStorageConfig } from '../../../../src/services/identity/engine/credo/config.js';

// Credo's own URI builder for the Askar module. The package does not export it, nor declare it in its types, so it is
// loaded by path (a variable, so the compiler does not look for types).
const askarStoreConfigPath = '../../../../node_modules/@credo-ts/askar/build/utils/askarStoreConfig.mjs';
let uriFromStoreConfig: (storeConfig: unknown) => { uri: string };
beforeAll(async () => {
	({ uriFromStoreConfig } = await import(askarStoreConfigPath));
});

const caPath = '/tmp/credo-ca-AbC123/ca.pem';
const database: CredoStorageConfig['database'] = {
	host: 'db.internal',
	port: 25060,
	name: 'studio_credo',
	user: 'credo_app',
	password: 'p@ss/word&more',
	sslMode: 'verify-ca',
	caCertificate: '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----',
};
const pool = { maxConnections: 5, idleTimeout: 30, connectTimeout: 10 };

/** The query parameters Askar would pass on to the Postgres driver (the ones it does not consume itself) */
function passedOn(uri: string) {
	const query = new URLSearchParams(uri.slice(uri.indexOf('?') + 1));
	return Array.from(query.entries()).filter(([key]) => !ASKAR_CONSUMED_POSTGRES_PARAMETERS.includes(key));
}

/** The URI Credo's Askar module opens, built by Credo itself from the runtime's module configuration */
function moduleUri(connectionParameters: Record<string, string>) {
	return uriFromStoreConfig({
		id: database.name,
		key: 'key',
		database: {
			type: 'postgres',
			config: {
				host: `${database.host}:${database.port}`,
				...pool,
				connectionParameters,
			},
			credentials: { account: database.user, password: database.password },
		},
	}).uri;
}

describe('Credo store connection for verify-ca with a CA (U-68)', () => {
	const connection = credoPostgresConnection(database, caPath);

	it('builds a well-formed provisioning URI whose only driver parameter is sslmode', () => {
		const url = new URL(connection.uri);
		expect(url.protocol).toBe('postgres:');
		expect(decodeURIComponent(url.username)).toBe(database.user);
		expect(decodeURIComponent(url.password)).toBe(database.password);
		expect(url.host).toBe('db.internal:25060');
		expect(url.pathname).toBe('/studio_credo');
		expect(passedOn(connection.uri)).toEqual([['sslmode', 'verify-ca']]);
		expect(connection.uri).not.toContain('sslrootcert');
	});

	it('gives the CA to the driver through PGSSLROOTCERT', () => {
		expect(connection.environment).toEqual({ PGSSLROOTCERT: caPath });
	});

	it('gives the Askar module one driver parameter, so the URI Credo builds survives Askar intact', () => {
		expect(connection.connectionParameters).toEqual({ sslmode: 'verify-ca' });
		const uri = moduleUri(connection.connectionParameters);
		expect(passedOn(uri)).toEqual([['sslmode', 'verify-ca']]);
		expect(new URLSearchParams(uri.slice(uri.indexOf('?') + 1)).get('max_connections')).toBe('5');
		expect(() => assertAskarSafePostgresUri(uri)).not.toThrow();
		expect(() => assertAskarSafePostgresUri(connection.uri)).not.toThrow();
	});

	it('refuses the old form, which Askar glued into "sslmode=verify-casslrootcert=..."', () => {
		const old = moduleUri({ sslmode: 'verify-ca', sslrootcert: caPath });
		expect(passedOn(old)).toHaveLength(2);
		expect(() => assertAskarSafePostgresUri(old)).toThrow(/sslmode, sslrootcert/);
	});

	it('needs no CA settings for require or disable', () => {
		for (const sslMode of ['require', 'disable'] as const) {
			const plain = credoPostgresConnection({ ...database, sslMode, caCertificate: undefined });
			expect(plain.environment).toEqual({});
			expect(passedOn(plain.uri)).toEqual([['sslmode', sslMode]]);
		}
	});
});
