import { randomBytes } from 'node:crypto';
import { Client } from 'pg';

/**
 * Shared set-up for the Credo engine integration tests: a throwaway Studio database, Credo's own database
 * (`studio_credo`) and app role created the way docs/credo-database-provisioning.md describes, Studio's tables built
 * from its entities, and Studio's own configuration pointed at them.
 *
 * Studio reads its configuration when a module is first imported, so everything under `src/` is imported here,
 * after the environment is set, and handed back.
 */

export const CREDO_DATABASE = 'studio_credo';
const CREDO_ROLE = 'studio_credo_app';
/** An obviously fake raw 32-byte key (hex). Never a real secret. */
export const FAKE_STORE_KEY = '11'.repeat(32);
export const OTHER_FAKE_STORE_KEY = '22'.repeat(32);

export interface TestDatabase {
	databaseName: string;
	credoDatabase: string;
	adminUrl: string;
	/** Runs SQL as the admin user against the named database (default: Credo's) */
	adminQuery<T = Record<string, unknown>>(sql: string, database?: string): Promise<T[]>;
	// biome-ignore lint/suspicious/noExplicitAny: the Studio modules are imported dynamically, after the environment is set
	studio: any;
	query<T = Record<string, unknown>>(sql: string, parameters?: unknown[]): Promise<T[]>;
	insertCustomer(customerId: string, name: string): Promise<void>;
	teardown(): Promise<void>;
}

async function admin<T>(
	adminUrl: string,
	database: string | undefined,
	work: (client: Client) => Promise<T>
): Promise<T> {
	const url = new URL(adminUrl);
	if (database) url.pathname = `/${database}`;
	const client = new Client({ connectionString: url.toString() });
	await client.connect();
	try {
		return await work(client);
	} finally {
		await client.end();
	}
}

export async function createTestDatabase(adminUrl: string, options: { rpcUrl?: string } = {}): Promise<TestDatabase> {
	const databaseName = `credo_it_${randomBytes(4).toString('hex')}`;
	const password = randomBytes(12).toString('hex');

	await admin(adminUrl, undefined, async (client) => {
		await client.query(`CREATE DATABASE "${databaseName}"`);
		// What scripts/credo-database-provisioning.sql does, run once by the admin user: Credo's own database and
		// app role. The role can connect and create in that database only, and has nothing in Studio's database.
		await client.query(`DROP DATABASE IF EXISTS "${CREDO_DATABASE}" WITH (FORCE)`);
		await client.query(`DO $$ BEGIN
			IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '${CREDO_ROLE}') THEN
				CREATE ROLE ${CREDO_ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE;
			END IF;
		END $$`);
		await client.query(`ALTER ROLE ${CREDO_ROLE} PASSWORD '${password}'`);
		await client.query(`CREATE DATABASE "${CREDO_DATABASE}"`);
		await client.query(`REVOKE ALL ON DATABASE "${CREDO_DATABASE}" FROM PUBLIC`);
		await client.query(`GRANT CONNECT, CREATE ON DATABASE "${CREDO_DATABASE}" TO ${CREDO_ROLE}`);
	});

	const url = new URL(adminUrl);
	url.pathname = `/${databaseName}`;
	process.env.ENABLE_EXTERNAL_DB = 'true';
	process.env.EXTERNAL_DB_CONNECTION_URL = url.toString();
	process.env.EXTERNAL_DB_ENCRYPTION_KEY = '0'.repeat(64);
	process.env.CREDO_DB_NAME = CREDO_DATABASE;
	process.env.CREDO_DB_USER = CREDO_ROLE;
	process.env.CREDO_STORE_KEY = FAKE_STORE_KEY;
	process.env.CREDO_DB_PASSWORD = password;
	// Nothing listens on port 9 by default: no write can reach a ledger unless the test passes a real RPC address
	process.env.TESTNET_RPC_URL = options.rpcUrl ?? 'http://127.0.0.1:9';
	process.env.MAINNET_RPC_URL = 'http://127.0.0.1:9';

	const { Connection } = await import('../../../src/database/connection/connection.js');
	await Connection.instance.connect();
	// The legacy migration chain assumes data from the old deployments and cannot run on an empty database, so
	// build the tables from the entities, which carry every column the Credo migrations add
	await Connection.instance.dbConnection.synchronize();

	const runtimeModule = await import('../../../src/services/identity/engine/credo/credo-runtime.js');
	const engineModule = await import('../../../src/services/identity/engine/credo/index.js');
	const storeModule = await import('../../../src/services/identity/engine/credo/typeorm-store.js');
	const lockModule = await import('../../../src/services/identity/ledger-lock.js');
	const idempotency = await import('../../../src/services/idempotency/idempotency.js');
	const idempotencyStore = await import('../../../src/services/idempotency/typeorm-idempotency-store.js');
	const dataStore = await import('@veramo/data-store');
	const kmsLocal = await import('@veramo/kms-local');
	const adapter = await import('../../../src/services/identity/credo/index.js');
	const accounts = await import('../../../src/services/api/payment-account.js');
	const keyEntity = await import('../../../src/database/entities/key.entity.js');

	const studio = {
		Connection,
		...engineModule,
		createCredoRuntime: runtimeModule.createCredoRuntime,
		...storeModule,
		...lockModule,
		...idempotency,
		...idempotencyStore,
		...adapter,
		PrivateKeyStore: dataStore.PrivateKeyStore,
		SecretBox: kmsLocal.SecretBox,
		KeyManagementSystem: kmsLocal.KeyManagementSystem,
		PaymentAccountService: accounts.PaymentAccountService,
		KeyEntity: keyEntity.KeyEntity,
		engine: engineModule.getCredoEngine(),
	};

	const query = <T = Record<string, unknown>>(sql: string, parameters: unknown[] = []): Promise<T[]> =>
		Connection.instance.dbConnection.query(sql, parameters);

	return {
		databaseName,
		credoDatabase: CREDO_DATABASE,
		adminUrl,
		adminQuery: <T = Record<string, unknown>>(sql: string, database: string = CREDO_DATABASE) =>
			admin(adminUrl, database, async (client) => (await client.query(sql)).rows as T[]),
		studio,
		query,
		insertCustomer: async (customerId, name) => {
			await query(
				`INSERT INTO "customer" ("customerId", "name", "email", "createdAt") VALUES ($1, $2, $3, now())`,
				[customerId, name, `${name}-${customerId}@example.invalid`]
			);
		},
		teardown: async () => {
			try {
				await Connection.instance.dbConnection.destroy();
			} finally {
				await admin(adminUrl, undefined, async (client) => {
					await client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
					await client.query(`DROP DATABASE IF EXISTS "${CREDO_DATABASE}" WITH (FORCE)`);
					await client.query(`DROP ROLE IF EXISTS ${CREDO_ROLE}`);
				});
			}
			// Credo keeps native handles open; end the process rather than wait for them
			setImmediate(() => process.exit(process.exitCode ?? 0));
		},
	};
}
