/**
 * Hermetic tier harness.
 *
 * Boots the real Express app (real route table, real validators, real auth guard and auth rules, real TypeORM entities
 * and migrations) in-process, against a throwaway Postgres database. Only the outside world is replaced:
 *   - LogTo / JOSE: `jwtVerify` accepts stub tokens only, LogTo scope lookups return every scope.
 *   - Stripe: a recording ledger.
 *   - Veramo and the ledger: every `Veramo.instance` method is a recorder, so a test can see whether a request got far
 *     enough to sign or broadcast anything, without a chain.
 */
import { jest } from '@jest/globals';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { StripeLedger } from './stripe-stub.js';
import { verifyStubToken, stubToken, type StubClaims } from './tokens.js';

export type VeramoCall = { method: string; args: unknown[] };
export type AuthMode = 'apikey' | 'portal' | 'idtoken' | 'm2m' | 'none';

export const stripeLedger = new StripeLedger();
/** Set once the harness is up: every scope any auth rule asks for. Machine-to-machine tokens carry them all. */
let allScopes: string[] = [];
export const veramoCalls: VeramoCall[] = [];
const veramoOverrides = new Map<string, unknown>();

/** Veramo methods that sign, broadcast or persist something on behalf of a tenant. */
export const VERAMO_WRITE_METHODS = [
	'createDid',
	'createKey',
	'updateDid',
	'deactivateDid',
	'importDid',
	'importKey',
	'createResource',
	'issueCredential',
	'createPresentation',
	'createUnencryptedBitstringStatusList',
	'createUnencryptedStatusList2021',
	'createEncryptedStatusList2021',
	'broadcastStatusList2021',
	'remunerateStatusList2021',
	'createEncryptedBitstringStatusList',
	'broadcastBitstringStatusList',
	'revokeCredentials',
	'suspendCredentials',
	'unsuspendCredentials',
	'updateUnencryptedStatusList',
	'updateEncryptedStatusList',
	'saveCredentialToDataStore',
	'deleteCredentialFromDataStore',
];

export type Tenant = {
	name: string;
	customerId: string;
	logToId: string;
	apiKey: string;
	/** A second key, so a case can revoke or edit a key without cutting off the tenant's main credential. */
	spareApiKey: string;
	paymentProviderId: string;
	paymentAddress: string;
	did: string;
	kid: string;
	publicKeyHex: string;
	resourceId: string;
	resourceName: string;
	statusRegistryId: string;
	statusListName: string;
	issuedCredentialId: string;
	/** An issued credential in `unknown` status, the only state that can be re-issued. */
	unknownCredentialId: string;
	operationId: string;
	subscriptionId: string;
	checkoutSessionId: string;
	providerTenantId: string;
	/** An offered credential addressed to this tenant's DID, issued by tenant C. */
	offerId: string;
	/** Strings that must never appear in another tenant's response. */
	markers: string[];
};

export type Harness = {
	baseUrl: string;
	tenantA: Tenant;
	tenantB: Tenant;
	/** A third tenant with no Stripe customer, for the unscoped-Stripe-list case. */
	tenantC: Tenant;
	/** A tenant-shaped set of fresh identifiers that exist nowhere: what "not found" looks like for each artefact. */
	ghost: () => Tenant;
	scopes: string[];
	request: (method: string, path: string, options?: RequestOptions) => Promise<ApiResponse>;
	snapshot: (tenant: Tenant) => Promise<Record<string, unknown>>;
	resetRecorders: () => void;
	/** Undo any ownership transfer a known bug let through, so one case cannot poison the next. */
	restoreOwnership: (tenant: Tenant) => Promise<void>;
	/** Replace what one Veramo method returns until the next `resetRecorders()`. */
	stubVeramo: (method: string, result: unknown | ((...args: unknown[]) => unknown)) => void;
	writesTouching: (tenant: Tenant) => VeramoCall[];
	allWrites: () => VeramoCall[];
	query: (sql: string, params?: unknown[]) => Promise<any[]>;
	close: () => Promise<void>;
};

export type RequestOptions = {
	as?: Tenant;
	mode?: AuthMode;
	query?: Record<string, string>;
	body?: unknown;
	headers?: Record<string, string>;
	/** Send the body form-encoded rather than as JSON. */
	form?: boolean;
};

export type ApiResponse = { status: number; body: any; text: string; headers: Headers };

const TESTNET = 'testnet';

function randomHex(bytes: number) {
	return randomBytes(bytes).toString('hex');
}

export function makeTenant(name: string, withStripeCustomer = true): Tenant {
	const uuid = randomUUID();
	const did = `did:cheqd:${TESTNET}:${uuid}`;
	return {
		name,
		customerId: randomUUID(),
		logToId: `logto-user-${name}-${randomHex(4)}`,
		apiKey: `caas_${name}_${randomHex(24)}`,
		spareApiKey: `caas_${name}_spare_${randomHex(24)}`,
		paymentProviderId: withStripeCustomer ? `cus_${name}${randomHex(4)}` : '',
		paymentAddress: `cheqd1${name.toLowerCase()}${randomHex(18)}`,
		did,
		kid: randomHex(32),
		publicKeyHex: randomHex(32),
		resourceId: randomUUID(),
		resourceName: `resource-${name}-${randomHex(3)}`,
		statusRegistryId: randomUUID(),
		statusListName: `statuslist-${name}-${randomHex(3)}`,
		issuedCredentialId: randomUUID(),
		unknownCredentialId: randomUUID(),
		operationId: randomUUID(),
		subscriptionId: `sub_${name}${randomHex(6)}`,
		checkoutSessionId: `cs_test_${name}${randomHex(6)}`,
		providerTenantId: `provider-tenant-${name}-${randomHex(4)}`,
		offerId: randomUUID(),
		markers: [],
	};
}

export async function startHarness(): Promise<Harness> {
	// ---- stubs for the outside world (must be registered before the app is imported) ----
	jest.unstable_mockModule('jose', () => ({
		createRemoteJWKSet: () => ({}),
		jwtVerify: async (token: string, _key: unknown, options: any) => verifyStubToken(token, options),
	}));
	jest.unstable_mockModule('@logto/express', () => {
		const passThrough = () => (req: any, _res: unknown, next: () => void) => {
			req.user = { isAuthenticated: false };
			next();
		};
		return { handleAuthRoutes: passThrough, withLogto: passThrough };
	});
	jest.unstable_mockModule('stripe', () => ({
		default: class FakeStripe {
			constructor() {
				return stripeLedger.build() as FakeStripe;
			}
		},
	}));

	// ---- fresh schema, created by the real migrations ----
	const { Postgres } = await import('../../../src/database/types/types.js');
	const migrator = new Postgres().setup();
	await migrator.initialize();
	await migrator.dropDatabase();
	await migrator.runMigrations();
	await migrator.destroy();

	// ---- real app ----
	const { Connection } = await import('../../../src/database/connection/connection.js');
	const { default: app } = await import('../../../src/app.js');
	for (let i = 0; i < 100 && !Connection.instance.dbConnection.isInitialized; i++) {
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	if (!Connection.instance.dbConnection.isInitialized) throw new Error('Database did not initialise');
	const db = Connection.instance.dbConnection;

	// ---- stub auth provider lookups: every authenticated user holds every scope ----
	const { LogToHelper } = await import('../../../src/middleware/auth/logto-helper.js');
	const { LogToProvider } = await import('../../../src/middleware/auth/oauth/logto-provider.js');
	const { allRuleScopes } = await import('./scopes.js');
	const scopes = await allRuleScopes();
	allScopes = scopes;
	jest.spyOn(LogToHelper.prototype, 'setup').mockResolvedValue({ status: 200, error: '', data: {} } as never);
	jest.spyOn(LogToHelper.prototype, 'getAllResourcesWithNames').mockReturnValue([]);
	jest.spyOn(LogToProvider.prototype, 'getUserScopes').mockResolvedValue({
		status: 200,
		error: '',
		data: scopes,
	} as never);
	jest.spyOn(LogToProvider.prototype, 'getScopesForRoles').mockResolvedValue(scopes as never);

	// ---- stub Veramo / ledger: record everything ----
	const { Veramo } = await import('../../../src/services/identity/providers/studio/agent.js');
	const { PostgresIdentityService } = await import('../../../src/services/identity/providers/index.js');
	const veramo = Veramo.instance as any;
	const proto = Object.getPrototypeOf(veramo);
	for (const method of Object.getOwnPropertyNames(proto)) {
		if (method === 'constructor' || typeof veramo[method] !== 'function') continue;
		veramo[method] = async (...args: unknown[]) => {
			veramoCalls.push({ method, args: args.slice(1) });
			if (veramoOverrides.has(method)) {
				const override = veramoOverrides.get(method);
				return typeof override === 'function' ? (override as (...a: unknown[]) => unknown)(...args) : override;
			}
			return stubVeramoResult(method, args);
		};
	}
	jest.spyOn(PostgresIdentityService.prototype, 'createAgent').mockResolvedValue({} as never);

	// The app seeds the provider catalogue itself once its database connection is up; wait for it.
	for (let i = 0; i < 100; i++) {
		const [{ count }] = await db.query('SELECT count(*)::int AS count FROM "credentialProvider"');
		if (count >= 1) break;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	// ---- seed two tenants ----
	const tenantA = makeTenant('A');
	const tenantB = makeTenant('B');
	const tenantC = makeTenant('C', false);
	await seedTenant(db, tenantA);
	await seedTenant(db, tenantB);
	await seedTenant(db, tenantC);
	// Offers come from tenant C, so neither A nor B is the issuer of the other's offer.
	await seedOffer(db, tenantA, tenantC);
	await seedOffer(db, tenantB, tenantC);
	for (const tenant of [tenantA, tenantB, tenantC]) {
		stripeLedger.subscriptions.set(tenant.subscriptionId, tenant.paymentProviderId || 'cus_none');
		stripeLedger.sessions.set(tenant.checkoutSessionId, tenant.paymentProviderId || 'cus_none');
		tenant.markers = [
			tenant.customerId,
			tenant.logToId,
			tenant.apiKey,
			tenant.spareApiKey,
			tenant.paymentProviderId,
			tenant.paymentAddress,
			tenant.did,
			tenant.kid,
			tenant.publicKeyHex,
			tenant.resourceId,
			tenant.resourceName,
			tenant.statusRegistryId,
			tenant.statusListName,
			tenant.issuedCredentialId,
			tenant.unknownCredentialId,
			tenant.operationId,
			tenant.subscriptionId,
			tenant.providerTenantId,
			tenant.offerId,
		].filter(Boolean);
	}

	// ---- serve ----
	const server = http.createServer(app);
	await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
	const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

	const request = async (method: string, path: string, options: RequestOptions = {}): Promise<ApiResponse> => {
		const { as, mode = as ? 'apikey' : 'none', query, body, headers = {}, form } = options;
		const url = new URL(path, baseUrl);
		for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);
		const sent: Record<string, string> = { ...authHeaders(as, mode), ...headers };
		let payload: string | undefined;
		if (body !== undefined) {
			if (form) {
				sent['content-type'] = 'application/x-www-form-urlencoded';
				payload = new URLSearchParams(
					Object.entries(body as Record<string, unknown>).map(([k, v]) => [
						k,
						typeof v === 'string' ? v : JSON.stringify(v),
					])
				).toString();
			} else {
				sent['content-type'] = 'application/json';
				payload = JSON.stringify(body);
			}
		}
		const response = await fetch(url, { method, headers: sent, body: payload, redirect: 'manual' });
		const text = await response.text();
		let parsed: any = text;
		try {
			parsed = JSON.parse(text);
		} catch {
			// not JSON
		}
		return { status: response.status, body: parsed, text, headers: response.headers };
	};

	return {
		baseUrl,
		tenantA,
		tenantB,
		tenantC,
		ghost: () => makeTenant('G'),
		scopes,
		request,
		snapshot: (tenant) => snapshotTenant(db, tenant),
		restoreOwnership: async (tenant) => {
			await db.query('UPDATE "identifier" SET "customerId" = $1 WHERE "did" = $2', [
				tenant.customerId,
				tenant.did,
			]);
			await db.query('UPDATE "key" SET "customerId" = $1 WHERE "kid" = $2', [tenant.customerId, tenant.kid]);
		},
		stubVeramo: (method, result) => {
			veramoOverrides.set(method, result);
		},
		resetRecorders: () => {
			veramoOverrides.clear();
			veramoCalls.length = 0;
			stripeLedger.calls.length = 0;
		},
		writesTouching: (tenant) =>
			veramoCalls.filter(
				(call) =>
					VERAMO_WRITE_METHODS.includes(call.method) &&
					tenant.markers.some((marker) => JSON.stringify(call.args).includes(marker))
			),
		allWrites: () => veramoCalls.filter((call) => VERAMO_WRITE_METHODS.includes(call.method)),
		query: (sql, params) => db.query(sql, params),
		close: async () => {
			await new Promise<void>((resolve) => server.close(() => resolve()));
			jest.restoreAllMocks();
			if (db.isInitialized) await db.destroy();
		},
	};
}

/** Headers for each way a caller can identify itself to the guard. */
export function authHeaders(tenant: Tenant | undefined, mode: AuthMode): Record<string, string> {
	if (!tenant || mode === 'none') return {};
	const userToken = (extra: Partial<StubClaims> = {}) =>
		stubToken({ sub: tenant.logToId, roles: ['studio-user'], ...extra });
	const m2m = stubToken({ sub: 'm2m-app', scope: allScopes.join(' ') });
	switch (mode) {
		case 'apikey':
			return { 'x-api-key': tenant.apiKey };
		case 'idtoken':
			return { authorization: `Bearer ${userToken()}` };
		case 'portal':
			return { authorization: `Bearer ${m2m}`, 'id-token': userToken() };
		case 'm2m':
			return { authorization: `Bearer ${m2m}`, 'customer-id': tenant.customerId };
	}
}

function stubVeramoResult(method: string, args: unknown[]): unknown {
	switch (method) {
		case 'resolveDid': {
			const did = args[1] as string;
			return {
				didDocument: {
					'@context': ['https://www.w3.org/ns/did/v1'],
					id: did,
					controller: [did],
					verificationMethod: [],
				},
				didDocumentMetadata: {},
				didResolutionMetadata: {},
			};
		}
		case 'searchStatusList':
			return { error: 'notFound' };
		case 'listDids':
			return [];
		default:
			return undefined;
	}
}

async function seedTenant(db: import('typeorm').DataSource, t: Tenant) {
	const { APIKeyService } = await import('../../../src/services/admin/api-key.js');
	const roleId = randomUUID();
	await db.query(
		`INSERT INTO "customer" ("customerId","name","email","paymentProviderId","createdAt") VALUES ($1,$2,$3,$4,$5)`,
		[
			t.customerId,
			`Tenant ${t.name}`,
			`${t.name.toLowerCase()}-${randomHex(3)}@isolation.invalid`,
			t.paymentProviderId || null,
			new Date(),
		]
	);
	await db.query(`INSERT INTO "role" ("roleTypeId","name","logToRoleIds") VALUES ($1,$2,'{}')`, [
		roleId,
		`role-${t.name}`,
	]);
	await db.query(`INSERT INTO "user" ("logToId","customerId","roleTypeId","createdAt") VALUES ($1,$2,$3,$4)`, [
		t.logToId,
		t.customerId,
		roleId,
		new Date(),
	]);
	const { CustomerEntity } = await import('../../../src/database/entities/customer.entity.js');
	const { UserEntity } = await import('../../../src/database/entities/user.entity.js');
	const customerEntity = (await db
		.getRepository(CustomerEntity)
		.findOneByOrFail({ customerId: t.customerId })) as any;
	const userEntity = (await db
		.getRepository(UserEntity)
		.findOneOrFail({ where: { logToId: t.logToId }, relations: { customer: true } })) as any;
	const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000);
	await APIKeyService.instance.create(t.apiKey, `key-${t.name}`, userEntity, customerEntity, expires);
	await APIKeyService.instance.create(t.spareApiKey, `spare-${t.name}`, userEntity, customerEntity, expires);

	// key, identifier, payment account, resource, status registry, issued credential, operation
	await db.query(
		`INSERT INTO "key" ("kid","kms","type","publicKeyHex","meta","publicKeyAlias","customerId") VALUES ($1,'postgres','Ed25519',$2,'{}',$3,$4)`,
		[t.kid, t.publicKeyHex, `alias-${t.name}`, t.customerId]
	);
	await db.query(
		`INSERT INTO "identifier" ("did","provider","alias","saveDate","updateDate","controllerKeyId","customerId") VALUES ($1,'did:cheqd:testnet',$2,now(),now(),$3,$4)`,
		[t.did, `alias-${t.name}`, t.kid, t.customerId]
	);
	await db.query(
		`INSERT INTO "paymentAccount" ("address","namespace","isDefault","createdAt","customerId","kid") VALUES ($1,'testnet',true,now(),$2,$3)`,
		[t.paymentAddress, t.customerId, t.kid]
	);
	await db.query(
		`INSERT INTO "resource" ("resourceId","resourceName","resourceType","mediaType","encrypted","createdAt","identifierDid","kid","customerId") VALUES ($1,$2,'TestResource','application/json',false,now(),$3,$4,$5)`,
		[t.resourceId, t.resourceName, t.did, t.kid, t.customerId]
	);
	await db.query(
		`INSERT INTO "statusRegistry" ("registryId","uri","registryType","storageType","registryName","encrypted","credentialCategory","version","registrySize","writeCursor","threshold_percentage","state","deprecated","issuerId","customerId")
		 VALUES ($1,$2,'BitstringStatusListCredential','cheqd',$3,false,'credential',0,131072,0,80,'active',false,$4,$5)`,
		[t.statusRegistryId, `${t.did}?resourceName=${t.statusListName}`, t.statusListName, t.did, t.customerId]
	);
	await db.query(
		`INSERT INTO "issuedCredential" ("issuedCredentialId","providerId","providerCredentialId","issuerId","subjectId","format","category","type","status","retryCount","issuedAt","customerId","statusRegistryId","statusIndex","deprecated")
		 VALUES ($1,'studio',$2,$3,'did:key:z6MkSubject','jwt','credential','["VerifiableCredential"]','issued',0,now(),$4,$5,7,false)`,
		[t.issuedCredentialId, `provider-cred-${t.name}`, t.did, t.customerId, t.statusRegistryId]
	);
	await db.query(
		`INSERT INTO "issuedCredential" ("issuedCredentialId","providerId","providerCredentialId","issuerId","subjectId","format","category","type","status","retryCount","issuedAt","customerId","deprecated")
		 VALUES ($1,'studio',$2,$3,'did:key:z6MkSubject','jwt','credential','["VerifiableCredential"]','unknown',0,now(),$4,false)`,
		[t.unknownCredentialId, `unknown-cred-${t.name}`, t.did, t.customerId]
	);
	await db.query(
		`INSERT INTO "providerConfiguration" ("providerId","tenantId","encryptedApiKey","apiEndpoint","validated","active","deprecated","createdAt","customerId")
		 VALUES ('dock',$1,$2,'http://provider.invalid',true,true,false,now(),$3)`,
		[t.providerTenantId, `encrypted-provider-secret-${t.name}-${randomHex(6)}`, t.customerId]
	);
	await db.query(
		`INSERT INTO "operation" ("operationId","category","operationName","deprecated","successful","createdAt","customerId") VALUES ($1,'did',$2,false,true,now(),$3)`,
		[t.operationId, `did-create-${t.name}`, t.customerId]
	);
}

/** `recipient` has an offered credential, issued by `issuer`, waiting to be accepted. */
async function seedOffer(db: import('typeorm').DataSource, recipient: Tenant, issuer: Tenant) {
	await db.query(
		`INSERT INTO "issuedCredential" ("issuedCredentialId","providerId","providerCredentialId","issuerId","subjectId","format","category","type","status","retryCount","issuedAt","offerExpiresAt","customerId","deprecated")
		 VALUES ($1,'studio',$2,$3,$4,'jwt','credential','["VerifiableCredential"]','offered',0,now(),now() + interval '1 day',$5,false)`,
		[recipient.offerId, `offer-${recipient.name}`, issuer.did, recipient.did, issuer.customerId]
	);
}

const SNAPSHOT_TABLES: Record<string, string> = {
	customer: `SELECT * FROM "customer" WHERE "customerId" = $1`,
	user: `SELECT * FROM "user" WHERE "customerId" = $1`,
	apiKey: `SELECT * FROM "apiKey" WHERE "customerId" = $1`,
	key: `SELECT * FROM "key" WHERE "customerId" = $1`,
	identifier: `SELECT * FROM "identifier" WHERE "customerId" = $1`,
	paymentAccount: `SELECT * FROM "paymentAccount" WHERE "customerId" = $1`,
	resource: `SELECT * FROM "resource" WHERE "customerId" = $1`,
	statusRegistry: `SELECT * FROM "statusRegistry" WHERE "customerId" = $1`,
	issuedCredential: `SELECT * FROM "issuedCredential" WHERE "customerId" = $1`,
	operation: `SELECT * FROM "operation" WHERE "customerId" = $1`,
	providerConfiguration: `SELECT * FROM "providerConfiguration" WHERE "customerId" = $1`,
	subscription: `SELECT * FROM "subscription" WHERE "customerId" = $1`,
	faucetRequest: `SELECT * FROM "faucetRequest" WHERE "customerId" = $1`,
};

/** Every row a tenant owns, so a test can prove an attack left it byte-for-byte unchanged. */
async function snapshotTenant(db: import('typeorm').DataSource, tenant: Tenant) {
	const out: Record<string, unknown> = {};
	for (const [table, sql] of Object.entries(SNAPSHOT_TABLES)) {
		out[table] = await db.query(sql, [tenant.customerId]);
	}
	return out;
}
