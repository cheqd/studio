import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Client } from 'pg';

/**
 * Integration test for the staff analytics back end against a real Postgres 16 and the real migrations. It uses
 * Node's test runner, not jest, and lives outside `tests/unit`, so `npm run test:unit` never picks it up. Run it
 * against a disposable Postgres on port 54340:
 *
 *   docker run -d --rm --name admin-it-db -e POSTGRES_PASSWORD=test -p 54340:5432 postgres:16
 *   ADMIN_ANALYTICS_TEST_DATABASE_URL=postgresql://postgres:test@localhost:54340/postgres \
 *     npx tsx --import ./tests/integration/hooks/register-credo.mjs --test tests/integration/admin-analytics.test.ts
 *
 * Without ADMIN_ANALYTICS_TEST_DATABASE_URL the suite is skipped. It creates its own database, runs every migration
 * on it from empty, and drops it afterwards. The URL must be a superuser.
 */
const adminUrl = process.env.ADMIN_ANALYTICS_TEST_DATABASE_URL;
const skip = adminUrl
	? false
	: 'set ADMIN_ANALYTICS_TEST_DATABASE_URL to run (see the comment at the top of this file)';

const DAY = 86_400_000;
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
const id = () => randomUUID();

describe('staff analytics on Postgres', { skip }, () => {
	const databaseName = `admin_it_${randomBytes(4).toString('hex')}`;
	// biome-ignore lint/suspicious/noExplicitAny: Studio's modules are imported dynamically, after the environment is set
	let studio: any;
	let query: <T = Record<string, unknown>>(sql: string, parameters?: unknown[]) => Promise<T[]>;

	// Customers: agents (A1, A2), people (P1), unclassified (U1, U2), and one whose only agent was deleted (D1, people)
	const c = { A1: id(), A2: id(), P1: id(), U1: id(), U2: id(), D1: id() };
	const staff = id();
	const roles = { build: id(), basic: id() };
	const agent = { A1: id(), A2: id(), D1: id() };

	before(async () => {
		const adminClient = new Client({ connectionString: adminUrl });
		await adminClient.connect();
		await adminClient.query(`CREATE DATABASE "${databaseName}"`);
		await adminClient.end();

		const url = new URL(adminUrl as string);
		url.pathname = `/${databaseName}`;
		process.env.ENABLE_EXTERNAL_DB = 'true';
		process.env.EXTERNAL_DB_CONNECTION_URL = url.toString();
		process.env.EXTERNAL_DB_ENCRYPTION_KEY = '0'.repeat(64);
		process.env.LOGTO_DEFAULT_ROLE_ID = 'placeholder';

		const { Connection } = await import('../../src/database/connection/connection.js');
		await Connection.instance.connect();
		// Every migration, from an empty database. The last three are this feature's.
		await Connection.instance.dbConnection.runMigrations();
		query = (sql, parameters = []) => Connection.instance.dbConnection.query(sql, parameters);

		studio = {
			Connection,
			...(await import('../../src/services/admin/admin-analytics.js')),
			...(await import('../../src/services/analytics/activation.js')),
			...(await import('../../src/services/admin/staff-deletion.js')),
			...(await import('../../src/services/agent/agent-store.js')),
			FaucetRequestService: (await import('../../src/services/api/faucet-request.js')).FaucetRequestService,
		};

		await seed();
	});

	after(async () => {
		try {
			await studio?.Connection.instance.dbConnection.destroy();
		} finally {
			const adminClient = new Client({ connectionString: adminUrl });
			await adminClient.connect();
			await adminClient.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
			await adminClient.end();
		}
		setImmediate(() => process.exit(process.exitCode ?? 0));
	});

	async function customer(customerId: string, name: string, createdDaysAgo: number, source?: string) {
		await query(
			`INSERT INTO "customer" ("customerId", "name", "email", "createdAt", "source") VALUES ($1, $2, $3, $4, $5)`,
			[
				customerId,
				name,
				`${name.toLowerCase().replace(/\W+/g, '')}@example.invalid`,
				ago(createdDaysAgo * DAY),
				source ?? null,
			]
		);
	}
	async function operation(
		customerId: string | null,
		name: string,
		daysAgo: number,
		extra: { successful?: boolean; outcome?: string; durationMs?: number } = {}
	) {
		await query(
			`INSERT INTO "operation" ("category", "operationName", "createdAt", "customerId", "successful", "outcome", "durationMs")
			 VALUES ('did', $1, $2, $3, $4, $5, $6)`,
			[
				name,
				ago(daysAgo * DAY),
				customerId,
				extra.successful ?? true,
				extra.outcome ?? null,
				extra.durationMs ?? null,
			]
		);
	}
	async function role(roleTypeId: string, name: string) {
		await query(`INSERT INTO "role" ("roleTypeId", "name") VALUES ($1, $2)`, [roleTypeId, name]);
	}
	async function user(customerId: string, roleTypeId: string) {
		await query(
			`INSERT INTO "user" ("logToId", "customerId", "roleTypeId", "createdAt") VALUES ($1, $2, $3, now())`,
			[`logto-${customerId}`, customerId, roleTypeId]
		);
	}
	async function newAgent(agentId: string, customerId: string, createdDaysAgo: number, deleted = false) {
		const did = `did:cheqd:testnet:${agentId}`;
		await query(
			`INSERT INTO "identifier" ("did", "customerId", "saveDate", "updateDate") VALUES ($1, $2, now(), now())`,
			[did, customerId]
		);
		await query(
			`INSERT INTO "agent" ("agentId", "customerId", "did", "name", "createdAt", "updatedAt", "deletedAt") VALUES ($1, $2, $3, $4, $5, $5, $6)`,
			[
				agentId,
				customerId,
				did,
				`agent-${agentId.slice(0, 4)}`,
				ago(createdDaysAgo * DAY),
				deleted ? ago(DAY) : null,
			]
		);
	}
	async function faucet(customerId: string, daysAgo: number, cheq: number, status = 'completed', source?: string) {
		await query(
			`INSERT INTO "faucetRequest" ("customerId", "address", "amountNcheq", "status", "createdAt", "source") VALUES ($1, $2, $3, $4, $5, $6)`,
			[
				customerId,
				`cheqd1${randomBytes(8).toString('hex')}`,
				BigInt(cheq) * 1_000_000_000n,
				status,
				ago(daysAgo * DAY),
				source ?? null,
			]
		);
	}
	async function credential(customerId: string, daysAgo: number) {
		await query(
			`INSERT INTO "issuedCredential" ("issuedCredentialId", "providerId", "format", "category", "type", "issuedAt", "customerId")
			 VALUES ($1, 'studio', 'jwt', 'credential', '["VerifiableCredential"]', $2, $3)`,
			[id(), ago(daysAgo * DAY), customerId]
		);
	}

	async function seed() {
		await query(
			`INSERT INTO "credentialProvider" ("providerId", "name", "providerType", "metadata", "createdAt") VALUES ('studio', 'Studio', 'studio', '{}', now())`
		);
		await role(roles.build, 'Build');
		await role(roles.basic, 'Basic');

		await customer(c.A1, 'Acme Agents', 10, 'agent-quickstart');
		await customer(c.A2, 'Nova Agents', 5, 'studio');
		await customer(c.P1, 'Brightpath Schools', 20, 'sdk');
		await customer(c.U1, 'Dormant One', 3);
		await customer(c.U2, 'Dormant Two', 200);
		await customer(c.D1, 'Deleted Agent Co', 8);
		await customer(staff, 'Staff Member', 400);
		await user(c.A1, roles.build);
		await user(c.A2, roles.basic);
		await user(c.P1, roles.build);
		await user(staff, roles.build);

		await newAgent(agent.A1, c.A1, 9);
		await newAgent(agent.A2, c.A2, 4);
		await newAgent(agent.D1, c.D1, 7, true);

		await credential(c.P1, 18);
		await credential(c.D1, 6);

		// Operations. A1: 4 calls (1 failed, 1 outcome error), P1: 2, A2: 1, D1: 1, one unattributed, one old (100 days)
		await operation(c.A1, 'did-create', 9, { durationMs: 100, outcome: 'ok' });
		await operation(c.A1, 'did-create', 2, { durationMs: 300, outcome: 'error' });
		await operation(c.A1, 'credential-verify', 1, { successful: false, durationMs: 50 });
		await operation(c.A1, 'credential-verify', 0.5, { durationMs: 70 });
		await operation(c.P1, 'credential-issue', 3, { durationMs: 200 });
		await operation(c.P1, 'credential-issue', 40, { durationMs: 220 });
		await operation(c.A2, 'did-create', 4);
		await operation(c.D1, 'credential-issue', 6);
		await operation(null, 'did-search', 1);
		await operation(c.A1, 'did-create', 100, { durationMs: 10 });

		await faucet(c.A1, 9.5, 10000);
		await faucet(c.A2, 4.5, 10000);
		await faucet(c.P1, 19, 5000);
		await faucet(c.U1, 2, 7000, 'abandoned');
		await faucet(c.D1, 7.5, 2500, 'completed', 'sdk');

		// Activation milestones, with known gaps: A1 funded 0.5d after sign-up, DID 1d later, agent 1d later, card 2d later
		const stamp = (customerId: string, column: string, daysAgo: number) =>
			query(
				`INSERT INTO "customerActivation" ("customerId", "${column}") VALUES ($1, $2)
				 ON CONFLICT ("customerId") DO UPDATE SET "${column}" = EXCLUDED."${column}"`,
				[customerId, ago(daysAgo * DAY)]
			);
		await stamp(c.A1, 'firstDidCreatedAt', 8.5);
		await stamp(c.A1, 'firstAgentRegisteredAt', 7.5);
		await stamp(c.A2, 'firstDidCreatedAt', 4.25);
		await stamp(c.A2, 'firstAgentRegisteredAt', 4);
		await stamp(c.P1, 'firstDidCreatedAt', 17);
		await stamp(c.P1, 'firstCredentialIssuedAt', 16);
		await stamp(c.D1, 'firstCredentialIssuedAt', 6);
		await query(
			`INSERT INTO "agentCard" ("agentId", "customerId", "version", "card", "jws", "createdAt") VALUES ($1, $2, 1, '{}', 'x.y.z', $3)`,
			[agent.A1, c.A1, ago(5.5 * DAY)]
		);
		// A card that was never signed does not count as "card signed"
		await query(
			`INSERT INTO "agentCard" ("agentId", "customerId", "version", "card", "createdAt") VALUES ($1, $2, 1, '{}', $3)`,
			[agent.A2, c.A2, ago(3 * DAY)]
		);
	}

	const near = (actual: number, expected: number, tolerance = 5) =>
		assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

	it('runs every migration from empty, and the new tables, columns and indexes exist', async () => {
		const tables = await query<{ n: string }>(
			`SELECT table_name AS n FROM information_schema.tables WHERE table_name = 'customerActivation'`
		);
		assert.equal(tables.length, 1);
		const columns = await query<{ t: string }>(
			`SELECT table_name AS t FROM information_schema.columns WHERE column_name = 'source' AND table_name IN ('customer', 'faucetRequest') ORDER BY 1`
		);
		assert.deepEqual(
			columns.map((r) => r.t),
			['customer', 'faucetRequest']
		);
		const indexes = await query<{ indexname: string }>(
			`SELECT indexname FROM pg_indexes WHERE indexname IN ('IDX_operation_customerId_createdAt', 'IDX_operation_createdAt', 'IDX_key_customerId') ORDER BY 1`
		);
		assert.equal(indexes.length, 3);
	});

	it('checks the source pattern in the database too', async () => {
		await assert.rejects(
			query(`UPDATE "customer" SET "source" = 'Bad Value' WHERE "customerId" = $1`, [c.U1]),
			/CHK_customer_source/
		);
		await assert.rejects(
			query(
				`INSERT INTO "faucetRequest" ("customerId", "address", "amountNcheq", "status", "source") VALUES ($1, 'a', 1, 'completed', 'x y')`,
				[c.U1]
			),
			/CHK_faucetRequest_source/
		);
	});

	it('segments customers by the rule: agents, people, unclassified (a deleted agent does not count)', async () => {
		const seg = async (segment: string) =>
			(await studio.AdminAnalyticsService.instance.overview(90, segment)).tiles.signUps;
		assert.equal(await seg('all'), 5); // U2 (200 days) and the staff customer (400 days) signed up outside 90 days
		assert.equal(await seg('agents'), 2);
		assert.equal(await seg('people'), 2); // P1 and D1 (its only agent was deleted, but it issued a credential)
		assert.equal(await seg('unclassified'), 1); // U1
		const detail = await studio.AdminAnalyticsService.instance.getCustomer(c.D1);
		assert.equal(detail.segment, 'people');
		assert.equal(detail.agentCount, 0);
		assert.equal((await studio.AdminAnalyticsService.instance.getCustomer(c.A1)).segment, 'agents');
		assert.equal((await studio.AdminAnalyticsService.instance.getCustomer(c.U1)).segment, 'unclassified');
	});

	it('overview: tiles and per-day series agree with the data', async () => {
		const service = studio.AdminAnalyticsService.instance;
		const all30 = await service.overview(30, 'all');
		// sign-ups in 30 days: A1, A2, P1, U1, D1 (U2 at 200 days and staff at 400 are outside)
		assert.equal(all30.tiles.signUps, 5);
		// active in 30 days: A1, A2, P1, D1 (the unattributed call and the old calls do not count)
		assert.equal(all30.tiles.activeAccounts, 4);
		assert.equal(all30.tiles.registeredAnAgent, 2);
		assert.equal(all30.tiles.issuedACredential, 2);
		// calls in 30 days: 4 (A1) + 1 (P1) + 1 (A2) + 1 (D1) + 1 unattributed = 8, the 40 and 100 day ones excluded
		assert.equal(all30.tiles.apiCalls, 8);
		// completed faucet: 10000 + 10000 + 5000 + 2500 (the abandoned one does not count)
		assert.equal(all30.tiles.testCheqSent, 27500);
		assert.equal(all30.series.signUpsPerDay.length, 30);
		assert.equal(all30.series.apiCallsPerDay.length, 30);
		assert.equal(
			all30.series.signUpsPerDay.reduce((s: number, d: { count: number }) => s + d.count, 0),
			5
		);
		assert.equal(
			all30.series.apiCallsPerDay.reduce((s: number, d: { count: number }) => s + d.count, 0),
			8
		);
		assert.match(all30.series.apiCallsPerDay[0].date, /^\d{4}-\d{2}-\d{2}$/);
		const dates = all30.series.apiCallsPerDay.map((d: { date: string }) => d.date);
		assert.deepEqual([...dates].sort(), dates);
		assert.equal(new Set(dates).size, 30);

		const week = await service.overview(7, 'all');
		assert.equal(week.series.signUpsPerDay.length, 7);
		assert.equal(week.tiles.signUps, 2); // A2 (5 days) and U1 (3 days)

		const ninety = await service.overview(90, 'all');
		assert.equal(ninety.series.apiCallsPerDay.length, 90);
		assert.equal(ninety.tiles.apiCalls, 9); // the 40-day call is now inside

		const agents = await service.overview(30, 'agents');
		assert.equal(agents.tiles.apiCalls, 5);
		assert.equal(agents.tiles.registeredAnAgent, 2);
		assert.equal(agents.tiles.testCheqSent, 20000);
		const people = await service.overview(30, 'people');
		assert.equal(people.tiles.issuedACredential, 2);
		assert.equal(people.tiles.apiCalls, 2);
	});

	it('endpoints: calls, error rate and average duration, using outcome and durationMs where present', async () => {
		const rows = await studio.AdminAnalyticsService.instance.endpoints(30, 'all');
		const byRoute = Object.fromEntries(
			rows.map((r: { method: string; route: string }) => [`${r.method} ${r.route}`, r])
		);
		const didCreate = byRoute['POST /did/create'];
		assert.equal(didCreate.calls, 3);
		near(didCreate.errorRate, 0.3333, 0.001); // one outcome=error of three
		assert.equal(didCreate.avgMs, 200); // (100 + 300) / 2, rows without a duration are ignored
		const verify = byRoute['POST /credential/verify'];
		assert.equal(verify.calls, 2);
		assert.equal(verify.errorRate, 0.5); // one successful=false
		assert.equal(verify.avgMs, 60);
		assert.equal(byRoute['POST /credential/issue'].calls, 2);
		assert.equal(byRoute['GET /did/search/:did'].calls, 1);
		assert.equal(byRoute['GET /did/search/:did'].avgMs, 0);
		assert.deepEqual(
			rows.map((r: { calls: number }) => r.calls),
			[...rows.map((r: { calls: number }) => r.calls)].sort((a, b) => b - a)
		);
		const agentsOnly = await studio.AdminAnalyticsService.instance.endpoints(30, 'agents');
		assert.ok(!agentsOnly.some((r: { route: string }) => r.route === '/credential/issue'));
	});

	it('top accounts: most calls first, with plan and name', async () => {
		const rows = await studio.AdminAnalyticsService.instance.topAccounts(30, 'all', 3);
		assert.equal(rows.length, 3);
		assert.deepEqual(rows[0], { customerId: c.A1, name: 'Acme Agents', plan: 'Build', calls: 4 });
		assert.equal(rows[1].calls, 1);
		const limited = await studio.AdminAnalyticsService.instance.topAccounts(90, 'people', 1);
		assert.equal(limited.length, 1);
		assert.equal(limited[0].customerId, c.P1);
		assert.equal(limited[0].calls, 2);
	});

	it('plan mix: accounts per plan and the paid percentage', async () => {
		const mix = await studio.AdminAnalyticsService.instance.planMix();
		const accounts = Object.fromEntries(
			mix.plans.map((p: { plan: string; accounts: number }) => [p.plan, p.accounts])
		);
		assert.deepEqual(accounts, { Build: 3, Basic: 1, none: 3 });
		assert.equal(mix.paidPercent, 42.9); // 3 of 7
	});

	it('funnels: steps computed from Studio tables, counts never rise, medians from the gaps', async () => {
		const service = studio.AdminAnalyticsService.instance;
		const a = await service.funnel('first-credential', 90, 'all');
		assert.deepEqual(
			a.steps.map((s: { key: string }) => s.key),
			['signed-up', 'funded', 'first-did', 'first-credential']
		);
		// signed up in 90 days: A1, A2, P1, U1, D1. Funded (completed): A1, A2, P1, D1. First DID among those: A1, A2, P1.
		// First credential among those: P1.
		assert.deepEqual(
			a.steps.map((s: { accounts: number }) => s.accounts),
			[5, 4, 3, 1]
		);
		assert.equal(a.steps[0].medianSecondsFromPrevious, null);
		// funded gaps: A1 0.5d, A2 0.5d, P1 1d, D1 0.5d -> median 0.5d
		near(a.steps[1].medianSecondsFromPrevious, 0.5 * 86400, 120);
		// DID after funding: A1 1d, A2 0.25d... A2: funded 4.5d ago, DID 4.25d ago = 0.25d; P1: funded 19d, DID 17d = 2d -> median 1d
		near(a.steps[2].medianSecondsFromPrevious, 1 * 86400, 120);
		// credential after DID, P1 only: 1d
		near(a.steps[3].medianSecondsFromPrevious, 86400, 120);

		const b = await service.funnel('first-agent', 90, 'all');
		assert.deepEqual(
			b.steps.map((s: { key: string }) => s.key),
			['signed-up', 'funded', 'first-did', 'registered-agent', 'card-signed']
		);
		// registered an agent after first DID: A1, A2. A signed card: A1 only (A2's card has no signature)
		assert.deepEqual(
			b.steps.map((s: { accounts: number }) => s.accounts),
			[5, 4, 3, 2, 1]
		);

		for (const funnel of [a, b]) {
			const counts = funnel.steps.map((s: { accounts: number }) => s.accounts);
			assert.deepEqual(
				counts,
				[...counts].sort((x: number, y: number) => y - x)
			);
		}

		const week = await service.funnel('first-credential', 7, 'all');
		assert.deepEqual(
			week.steps.map((s: { accounts: number }) => s.accounts),
			[2, 1, 1, 0]
		); // A2 and U1 signed up; only A2 funded and has a DID
		assert.equal(week.steps[3].medianSecondsFromPrevious, null);
		const peopleFunnel = await service.funnel('first-credential', 90, 'people');
		assert.deepEqual(
			peopleFunnel.steps.map((s: { accounts: number }) => s.accounts),
			[2, 2, 1, 1]
		);
	});

	it('customers: search by name, email and id, plan and status filters, pagination, usage counts', async () => {
		const service = studio.AdminAnalyticsService.instance;
		const all = await service.listCustomers({ page: 1, limit: 25 });
		assert.equal(all.total, 7);
		assert.equal(all.customers.length, 7);
		assert.deepEqual(all.customers.map((x: { id: string }) => x.id).slice(0, 2), [c.U1, c.A2]); // newest first

		assert.deepEqual(
			(await service.listCustomers({ q: 'acme', page: 1, limit: 25 })).customers.map((x: { id: string }) => x.id),
			[c.A1]
		);
		assert.deepEqual(
			(await service.listCustomers({ q: 'BRIGHTPATH', page: 1, limit: 25 })).customers.map(
				(x: { id: string }) => x.id
			),
			[c.P1]
		);
		assert.deepEqual(
			(await service.listCustomers({ q: 'novaagents@example', page: 1, limit: 25 })).customers.map(
				(x: { id: string }) => x.id
			),
			[c.A2]
		);
		assert.deepEqual(
			(await service.listCustomers({ q: c.U2, page: 1, limit: 25 })).customers.map((x: { id: string }) => x.id),
			[c.U2]
		);
		assert.equal((await service.listCustomers({ q: '%', page: 1, limit: 25 })).total, 0); // wildcards are literal
		assert.equal((await service.listCustomers({ plan: 'build', page: 1, limit: 25 })).total, 3);
		assert.equal((await service.listCustomers({ plan: 'none', page: 1, limit: 25 })).total, 3);
		assert.equal((await service.listCustomers({ status: 'active', page: 1, limit: 25 })).total, 4);
		assert.equal((await service.listCustomers({ status: 'inactive', page: 1, limit: 25 })).total, 3);
		assert.equal((await service.listCustomers({ plan: 'build', status: 'active', page: 1, limit: 25 })).total, 2);

		const first = await service.listCustomers({ page: 1, limit: 3 });
		const second = await service.listCustomers({ page: 2, limit: 3 });
		const third = await service.listCustomers({ page: 3, limit: 3 });
		assert.deepEqual([first.customers.length, second.customers.length, third.customers.length], [3, 3, 1]);
		assert.equal(first.total, 7);
		assert.equal(
			new Set([...first.customers, ...second.customers, ...third.customers].map((x: { id: string }) => x.id))
				.size,
			7
		);
		assert.equal((await service.listCustomers({ page: 9, limit: 3 })).customers.length, 0);

		const a1 = all.customers.find((x: { id: string }) => x.id === c.A1);
		assert.equal(a1.plan, 'Build');
		assert.equal(a1.status, 'active');
		assert.equal(a1.network, 'testnet');
		assert.deepEqual(a1.usage, { apiCalls30d: 4, identifiers: 1, credentials: 0, keys: 0 });
		assert.ok(a1.lastActiveAt);
		const p1 = all.customers.find((x: { id: string }) => x.id === c.P1);
		assert.equal(p1.usage.credentials, 1);
		assert.equal(p1.usage.apiCalls30d, 1); // the 40-day-old call is outside the window
		assert.equal(all.customers.find((x: { id: string }) => x.id === c.U2).lastActiveAt, null);

		const detail = await service.getCustomer(c.A1);
		assert.equal(detail.agentCount, 1);
		assert.equal(detail.paymentPlan, 'none');
		assert.equal(await service.getCustomer(id()), null);
	});

	it('customer data never carries keys, credential contents or API keys', async () => {
		await query(
			`INSERT INTO "key" ("kid", "kms", "type", "publicKeyHex", "privateKeyHex", "customerId") VALUES ('kid-secret', 'local', 'Ed25519', 'ab', 'cd', $1)`,
			[c.A1]
		).catch(async () => {
			await query(
				`INSERT INTO "key" ("kid", "kms", "type", "publicKeyHex", "customerId") VALUES ('kid-secret', 'local', 'Ed25519', 'ab', $1)`,
				[c.A1]
			);
		});
		const service = studio.AdminAnalyticsService.instance;
		const text = JSON.stringify([
			await service.listCustomers({ page: 1, limit: 100 }),
			await service.getCustomer(c.A1),
			await service.overview(90, 'all'),
			await service.endpoints(90, 'all'),
			await service.topAccounts(90, 'all', 100),
			await service.funnel('first-agent', 90, 'all'),
			await service.auditLog(1, 100),
		]);
		assert.ok(!text.includes('kid-secret'));
		assert.ok(!/"cd"|publicKeyHex|privateKey|apiKey|VerifiableCredential|did:cheqd/.test(text));
		assert.equal((await service.getCustomer(c.A1)).usage.keys, 1); // counted, never shown
	});

	it('recordActivation is idempotent and keeps the first timestamp', async () => {
		const customerId = c.U1;
		assert.equal(await studio.recordActivation(customerId, 'first_did_created'), true);
		const [first] = await query<{ t: Date }>(
			`SELECT "firstDidCreatedAt" AS t FROM "customerActivation" WHERE "customerId" = $1`,
			[customerId]
		);
		assert.ok(first.t);
		assert.equal(await studio.recordActivation(customerId, 'first_did_created'), false);
		const [again] = await query<{ t: Date }>(
			`SELECT "firstDidCreatedAt" AS t FROM "customerActivation" WHERE "customerId" = $1`,
			[customerId]
		);
		assert.equal(again.t.getTime(), first.t.getTime());
		// a second milestone fills its own column without touching the first
		assert.equal(await studio.recordActivation(customerId, 'first_status_list_created'), true);
		const [row] = await query<Record<string, Date | null>>(
			`SELECT * FROM "customerActivation" WHERE "customerId" = $1`,
			[customerId]
		);
		assert.equal(row.firstDidCreatedAt?.getTime(), first.t.getTime());
		assert.ok(row.firstStatusListCreatedAt);
		assert.equal(row.firstAgentRegisteredAt, null);
		// an unknown customer fails quietly
		const warn = console.warn;
		console.warn = () => undefined;
		try {
			assert.equal(await studio.recordActivation(id(), 'first_did_created'), false);
		} finally {
			console.warn = warn;
		}
		// undo, so later tests see the seeded state
		await query(`DELETE FROM "customerActivation" WHERE "customerId" = $1`, [customerId]);
	});

	it('the agent store records the DID, agent and status list milestones', async () => {
		const store = new studio.TypeormAgentStore();
		const customerId = c.U2;
		await query(
			`INSERT INTO "identifier" ("did", "customerId", "saveDate", "updateDate") VALUES ('did:cheqd:testnet:u2', $1, now(), now())`,
			[customerId]
		);
		await store.createAgent({ customerId, did: 'did:cheqd:testnet:u2', name: 'u2 agent' });
		await store.createStatusList({
			customerId,
			issuerDid: 'did:cheqd:testnet:u2',
			uri: 'https://example.invalid/list',
			name: 'list',
			size: 16,
		});
		const [row] = await query<Record<string, Date | null>>(
			`SELECT * FROM "customerActivation" WHERE "customerId" = $1`,
			[customerId]
		);
		assert.ok(row.firstDidCreatedAt && row.firstAgentRegisteredAt && row.firstStatusListCreatedAt);
		assert.equal(row.firstCredentialIssuedAt, null);
		await query(`DELETE FROM "agent" WHERE "customerId" = $1`, [customerId]);
		await query(`DELETE FROM "statusRegistry" WHERE "customerId" = $1`, [customerId]);
		await query(`DELETE FROM "customerActivation" WHERE "customerId" = $1`, [customerId]);
	});

	it('a faucet request stores the source it was given', async () => {
		const customerEntity = { customerId: c.A2 };
		const reservation = await studio.FaucetRequestService.instance.reserve(customerEntity, 'cheqd1source', 1000n, {
			limitNcheq: 10n ** 15n,
			source: 'agent-quickstart',
		});
		assert.equal(reservation.reserved, true);
		const [row] = await query<{ source: string }>(
			`SELECT "source" FROM "faucetRequest" WHERE "faucetRequestId" = $1`,
			[reservation.faucetRequestId]
		);
		assert.equal(row.source, 'agent-quickstart');
		await query(`DELETE FROM "faucetRequest" WHERE "faucetRequestId" = $1`, [reservation.faucetRequestId]);
	});

	it('agent grants are listed per tenant, without the credential', async () => {
		const store = new studio.TypeormAgentStore();
		await query(
			`INSERT INTO "authorityGrant" ("agentId", "customerId", "grantType", "expiresAt") VALUES ($1, $2, 'tool-scope', now() + interval '1 day')`,
			[agent.A1, c.A1]
		);
		await query(
			`INSERT INTO "authorityGrant" ("agentId", "customerId", "grantType", "revokedAt") VALUES ($1, $2, 'acts-for', now())`,
			[agent.A1, c.A1]
		);
		const own = await store.listGrants(c.A1, agent.A1);
		assert.equal(own.length, 2);
		assert.deepEqual(own.map((g: { grantType: string }) => g.grantType).sort(), ['acts-for', 'tool-scope']);
		for (const grant of own) assert.ok(!('issuedCredentialId' in grant) && !('credential' in grant));
		assert.deepEqual(await store.listGrants(c.A2, agent.A1), []); // another tenant sees nothing
		assert.deepEqual(await store.listGrants(c.A1, agent.A2), []); // wrong agent for this tenant
	});

	it('staff deletion writes the audit row in the same transaction, and removes the customer and its activation row', async () => {
		const Connection = studio.Connection;
		const victim = id();
		await customer(victim, 'Delete Me', 2);
		await query(`INSERT INTO "customerActivation" ("customerId", "firstDidCreatedAt") VALUES ($1, now())`, [
			victim,
		]);
		const base = { deleteCustomer: async () => false } as never;
		const deps = studio.withAuditedCustomerDelete(
			base,
			{
				actorUserId: 'logto-staff-1',
				reason: 'User request',
				ticketRef: 'SUP-1031',
				metadata: { plan: 'none', paid: false },
			},
			(work: never) => Connection.instance.dbConnection.transaction(work)
		);
		assert.equal(await deps.deleteCustomer({ customerId: victim }), true);
		assert.equal((await query(`SELECT 1 FROM "customer" WHERE "customerId" = $1`, [victim])).length, 0);
		assert.equal((await query(`SELECT 1 FROM "customerActivation" WHERE "customerId" = $1`, [victim])).length, 0);
		const audit = await query<Record<string, unknown>>(
			`SELECT * FROM "adminAuditLog" WHERE "targetCustomerId" = $1`,
			[victim]
		);
		assert.equal(audit.length, 1);
		assert.equal(audit[0].actorUserId, 'logto-staff-1');
		assert.equal(audit[0].action, 'customer.delete');
		assert.equal(audit[0].reason, 'User request');
		assert.equal(audit[0].ticketRef, 'SUP-1031');
		assert.ok(!JSON.stringify(audit[0]).includes('deleteme@'));

		// the row outlives the customer and shows in the staff audit log
		const log = await studio.AdminAnalyticsService.instance.auditLog(1, 25);
		const entry = log.entries.find((e: { target: string }) => e.target === victim);
		assert.deepEqual(
			{ ...entry, id: undefined, when: undefined },
			{
				id: undefined,
				when: undefined,
				staff: 'logto-staff-1',
				action: 'customer.delete',
				target: victim,
				reason: 'User request',
				ticketRef: 'SUP-1031',
			}
		);
		assert.ok(log.total >= 1);
	});

	it('rolls the customer delete back when the audit write fails', async () => {
		const Connection = studio.Connection;
		const survivor = id();
		await customer(survivor, 'Survivor', 2);
		const before = (await query<{ n: string }>(`SELECT COUNT(*) AS n FROM "adminAuditLog"`))[0].n;
		const deps = studio.withAuditedCustomerDelete(
			{} as never,
			// a null actor violates NOT NULL, so the audit insert throws
			{ actorUserId: null as never, reason: 'x', metadata: {} },
			(work: never) => Connection.instance.dbConnection.transaction(work)
		);
		await assert.rejects(deps.deleteCustomer({ customerId: survivor }), /actorUserId|null value/i);
		assert.equal((await query(`SELECT 1 FROM "customer" WHERE "customerId" = $1`, [survivor])).length, 1);
		assert.equal((await query<{ n: string }>(`SELECT COUNT(*) AS n FROM "adminAuditLog"`))[0].n, before);

		// and a customer that is already gone leaves no audit row either
		const gone = studio.withAuditedCustomerDelete(
			{} as never,
			{ actorUserId: 's', reason: 'x', metadata: {} },
			(work: never) => Connection.instance.dbConnection.transaction(work)
		);
		assert.equal(await gone.deleteCustomer({ customerId: id() }), false);
		assert.equal((await query<{ n: string }>(`SELECT COUNT(*) AS n FROM "adminAuditLog"`))[0].n, before);
	});

	it('audit log pages newest first with a total', async () => {
		for (let i = 0; i < 3; i++) {
			await query(
				`INSERT INTO "adminAuditLog" ("actorUserId", "action", "reason", "createdAt") VALUES ($1, 'flag.set', $2, now() + ($3 || ' seconds')::interval)`,
				[`logto-${c.A1}`, `reason ${i}`, String(i + 1)]
			);
		}
		const service = studio.AdminAnalyticsService.instance;
		const page = await service.auditLog(1, 2);
		assert.equal(page.entries.length, 2);
		assert.equal(page.entries[0].reason, 'reason 2');
		assert.equal(page.entries[0].staff.includes('@'), true); // a known user shows as the staff member's email
		const next = await service.auditLog(2, 2);
		assert.equal(next.entries[0].reason, 'reason 0');
		assert.equal(page.total, next.total);
		assert.ok(page.total >= 4);
	});

	it('the backfill fills milestones from existing data when the migration runs on a populated database', async () => {
		const Connection = studio.Connection;
		const backfilled = id();
		await customer(backfilled, 'Backfill Co', 30);
		await operation(backfilled, 'did-create', 20);
		await operation(backfilled, 'did-create', 10);
		await operation(backfilled, 'did-create', 25, { successful: false });
		await credential(backfilled, 5);
		const sinceDid = (
			await query<{ t: Date }>(
				`SELECT MIN("createdAt") AS t FROM "operation" WHERE "customerId" = $1 AND "successful"`,
				[backfilled]
			)
		)[0].t;
		// revert only the activation migration and run it again, over data that now exists
		await Connection.instance.dbConnection.undoLastMigration();
		assert.equal(
			(await query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'customerActivation'`)).length,
			0
		);
		await Connection.instance.dbConnection.runMigrations();
		const [row] = await query<Record<string, Date | null>>(
			`SELECT * FROM "customerActivation" WHERE "customerId" = $1`,
			[backfilled]
		);
		assert.equal(row.firstDidCreatedAt?.getTime(), sinceDid.getTime()); // the earliest successful did-create
		assert.ok(row.firstCredentialIssuedAt);
		assert.equal(row.firstAgentRegisteredAt, null);
		// agents seeded earlier were picked up too
		const [a1] = await query<Record<string, Date | null>>(
			`SELECT * FROM "customerActivation" WHERE "customerId" = $1`,
			[c.A1]
		);
		assert.ok(a1.firstAgentRegisteredAt && a1.firstDidCreatedAt);
		// customers with nothing to backfill get no row
		assert.equal((await query(`SELECT 1 FROM "customerActivation" WHERE "customerId" = $1`, [c.U2])).length, 0);
	});

	it('reverts and re-runs the three new migrations cleanly', async () => {
		const Connection = studio.Connection;
		for (let i = 0; i < 3; i++) await Connection.instance.dbConnection.undoLastMigration();
		assert.equal(
			(
				await query(
					`SELECT 1 FROM information_schema.columns WHERE column_name = 'source' AND table_name = 'customer'`
				)
			).length,
			0
		);
		assert.equal((await query(`SELECT 1 FROM pg_indexes WHERE indexname = 'IDX_operation_createdAt'`)).length, 0);
		assert.equal(
			(await query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'customerActivation'`)).length,
			0
		);
		await Connection.instance.dbConnection.runMigrations();
		assert.equal(
			(
				await query(
					`SELECT 1 FROM information_schema.columns WHERE column_name = 'source' AND table_name = 'customer'`
				)
			).length,
			1
		);
		assert.equal((await query(`SELECT 1 FROM pg_indexes WHERE indexname = 'IDX_operation_createdAt'`)).length, 1);
		assert.equal(
			(await query(`SELECT 1 FROM information_schema.tables WHERE table_name = 'customerActivation'`)).length,
			1
		);
	});
});
