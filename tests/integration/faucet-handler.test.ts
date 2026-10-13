import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { toBech32 } from '@cosmjs/encoding';

/**
 * Handler-level tests for POST /account/faucet and GET /account/balances. They call the real controller methods
 * against a real Postgres, with Stripe, the faucet, the account lookup and the on-chain balance faked.
 *
 * They use Node's own test runner, not jest: the controller imports Veramo and a dependency that only load on Node 20
 * (the version CI uses), and under jest that dependency fails to import. They live outside `tests/unit`, so
 * `npm run test:unit` never picks them up. Run them against a disposable Postgres (the `customer` table is created and
 * `faucetRequest` is dropped and recreated):
 *
 *   docker run -d --rm --name faucet-test-db -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=studio -p 55432:5432 postgres:16
 *   FAUCET_TEST_DATABASE_URL=postgres://postgres:pw@localhost:55432/studio \
 *     npx -y -p node@20 node --import tsx --import ./tests/integration/hooks/register.mjs \
 *     --test tests/integration/faucet-handler.test.ts
 *
 * Without FAUCET_TEST_DATABASE_URL the suite is skipped. The hook in `hooks/` swaps in the fake on-chain balance.
 */
const databaseUrl = process.env.FAUCET_TEST_DATABASE_URL;
const cheq = (amount: number) => BigInt(amount) * 1_000_000_000n;
const ADDRESS = 'cheqd1testaddress';
const OTHER_ADDRESS = toBech32('cheqd', new Uint8Array(20).fill(7));

/** Asserts that every field in `expected` is present, recursively, with the same value. */
function assertSubset(actual: any, expected: any, path = 'value'): void {
	if (expected !== null && typeof expected === 'object') {
		assert.ok(
			actual !== null && typeof actual === 'object',
			`${path} should be an object, got ${JSON.stringify(actual)}`
		);
		for (const [key, value] of Object.entries(expected)) assertSubset(actual[key], value, `${path}.${key}`);
		return;
	}
	assert.equal(actual, expected, `${path} should be ${String(expected)}, got ${String(actual)}`);
}

describe('POST /account/faucet and GET /account/balances (Postgres, faked externals)', { skip: !databaseUrl }, () => {
	// Filled in by `before`, once the environment is set and the modules have been imported
	let dataSource: DataSource;
	let controller: any;
	let ledger: any;
	let CustomerEntityClass: any;
	let AccountControllerRef: any;
	let PaymentAccountServiceRef: any;
	let topupTestnet: any;

	// Controls and counters for the faked externals
	let balanceNcheq = '0';
	let faucetMode: 'ok' | 'fail500' | 'throw' = 'ok';
	let balanceCalls = 0;
	let stripeCalls = 0;
	let faucetCalls = 0;
	let lastFaucetAddress: string | undefined;
	const resetCounters = () => {
		balanceCalls = 0;
		stripeCalls = 0;
		faucetCalls = 0;
	};
	const reset = () => {
		balanceNcheq = '0';
		faucetMode = 'ok';
		resetCounters();
	};

	let uniqueCounter = 0;
	const newCustomer = async (): Promise<any> =>
		dataSource
			.getRepository(CustomerEntityClass)
			.save(new CustomerEntityClass(undefined, 'Test', `handler-${Date.now()}-${uniqueCounter++}@example.com`));

	const call = async (customer: any, body: Record<string, unknown> = {}, headers: Record<string, string> = {}) => {
		let status = 0;
		let json: any;
		const responseHeaders: Record<string, string> = {};
		const stripe = {
			subscriptions: {
				retrieve: async () => {
					stripeCalls++;
					return { status: 'active', items: { data: [{ plan: { product: 'prod_build' } }] } };
				},
			},
		};
		const res: any = {
			locals: { user: customer ? { id: 'user' } : undefined, customer, stripe },
			status(code: number) {
				status = code;
				return res;
			},
			set(key: string, value: string) {
				responseHeaders[key] = value;
				return res;
			},
			json(payload: unknown) {
				json = payload;
				return res;
			},
		};
		const req = { headers, body };
		// the router runs the validators before the handler; do the same so the handler's 400s are exercised
		for (const chain of AccountControllerRef.faucetValidator) await chain.run(req);
		await controller.requestFaucetTokens(req, res);
		return { status, json, headers: responseHeaders };
	};

	const used = (customer: any): Promise<bigint> => ledger.getUsedNcheq(customer);
	const rows = (customer: any): Promise<{ status: string; completedAt: Date | null }[]> =>
		dataSource.query(
			`SELECT status, "completedAt" FROM "faucetRequest" WHERE "customerId" = $1 ORDER BY "createdAt"`,
			[customer.customerId]
		);
	// Make the customer's earlier requests old enough to be outside the minimum interval and the settle window
	const settle = (customer: any) =>
		dataSource.query(
			`UPDATE "faucetRequest" SET "createdAt" = "createdAt" - interval '1 minute' WHERE "customerId" = $1`,
			[customer.customerId]
		);
	const backdate = (customer: any, interval: string) =>
		dataSource.query(`UPDATE "faucetRequest" SET "createdAt" = now() - $1::interval WHERE "customerId" = $2`, [
			interval,
			customer.customerId,
		]);

	before(async () => {
		Object.assign(process.env, {
			ENABLE_EXTERNAL_DB: 'true',
			EXTERNAL_DB_CONNECTION_URL: databaseUrl,
			EXTERNAL_DB_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
			STRIPE_ENABLED: 'true',
			STRIPE_SECRET_KEY: 'sk_test_unused',
			STRIPE_BUILD_PLAN_ID: 'prod_build',
			TESTNET_RPC_URL: 'http://localhost:1',
		});
		(globalThis as any).__checkBalance = async () => {
			balanceCalls++;
			return [{ denom: 'ncheq', amount: balanceNcheq }];
		};

		const { CustomerEntity } = await import('../../src/database/entities/customer.entity.js');
		CustomerEntityClass = CustomerEntity;
		const migrations = [
			(await import('../../src/database/migrations/1791500000000-studio-migrations.js'))
				.StudioMigrations1791500000000,
			(await import('../../src/database/migrations/1791500000001-studio-migrations.js'))
				.StudioMigrations1791500000001,
			(await import('../../src/database/migrations/1791500000002-studio-migrations.js'))
				.StudioMigrations1791500000002,
		];

		const bootstrap = new DataSource({
			type: 'postgres',
			url: databaseUrl,
			entities: [CustomerEntity],
			synchronize: true,
		});
		await bootstrap.initialize();
		await bootstrap.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
		await bootstrap.query('DROP TABLE IF EXISTS "faucetRequest"');
		await bootstrap.destroy();

		const { Connection } = await import('../../src/database/connection/connection.js');
		await Connection.instance.connect();
		dataSource = Connection.instance.dbConnection;
		for (const Migration of migrations) await new Migration().up(dataSource.createQueryRunner());

		const accountModule = await import('../../src/controllers/api/account.js');
		const { AccountController } = accountModule;
		AccountControllerRef = AccountController;
		topupTestnet = accountModule.topupTestnet;
		const { FaucetHelper } = await import('../../src/helpers/faucet.js');
		const { SubscriptionService } = await import('../../src/services/admin/subscription.js');
		const { PaymentAccountService } = await import('../../src/services/api/payment-account.js');
		const { FaucetRequestService } = await import('../../src/services/api/faucet-request.js');

		(FaucetHelper as any).delegateTokens = async (address: string) => {
			faucetCalls++;
			lastFaucetAddress = address;
			if (faucetMode === 'throw') throw new Error('network timeout');
			return { status: faucetMode === 'ok' ? 200 : 500, error: faucetMode === 'ok' ? '' : 'boom', data: {} };
		};
		(SubscriptionService.instance as any).findCurrent = async () => ({ subscriptionId: 'sub_1' });
		PaymentAccountServiceRef = PaymentAccountService;
		(PaymentAccountService.instance as any).findOne = async (query: { address?: string }) =>
			!query.address || query.address === ADDRESS ? { address: ADDRESS } : null;
		(PaymentAccountService.instance as any).find = async () => [{ namespace: 'testnet', address: ADDRESS }];

		controller = new AccountController();
		ledger = FaucetRequestService.instance;
	});

	after(async () => {
		await dataSource?.destroy();
	});

	describe('who can call it', () => {
		it('funds a request from a user session', async () => {
			reset();
			const result = await call(await newCustomer(), { amount: 1000 });
			assert.equal(result.status, 200);
			assertSubset(result.json, { funded: true, amount: { cheq: 1000 } });
		});

		it('funds a request made with an API key (x-api-key)', async () => {
			reset();
			const result = await call(await newCustomer(), { amount: 1000 }, { 'x-api-key': 'a-key' });
			assert.equal(result.status, 200);
			assertSubset(result.json, { funded: true });
		});

		it('funds a request made with a machine-to-machine token (customer-id)', async () => {
			reset();
			const result = await call(
				await newCustomer(),
				{ amount: 1000 },
				{ 'customer-id': 'a-customer', authorization: 'Bearer m2m' }
			);
			assert.equal(result.status, 200);
			assertSubset(result.json, { funded: true });
		});

		it('answers 401 when the auth guard did not resolve a user', async () => {
			reset();
			assert.equal((await call(undefined, { amount: 1000 })).status, 401);
		});
	});

	describe('monthly quota', () => {
		it('funds up to the quota and then answers 429 with Retry-After and the quota details', async () => {
			reset();
			const customer = await newCustomer();
			const first = await call(customer, { amount: 30000 });
			assert.equal(first.json.quota.used.cheq, 30000);
			await settle(customer);
			assert.equal((await call(customer, { amount: 70000 })).status, 200);
			await settle(customer);

			const blocked = await call(customer, { amount: 1 });

			assert.equal(blocked.status, 429);
			assert.ok(Number(blocked.headers['Retry-After']) > 0);
			assertSubset(blocked.json.quota, { period: 'month', remaining: { cheq: 0 } });
		});

		it('with no amount, tops up by whatever quota is left, then answers 429 once it is used up', async () => {
			reset();
			const customer = await newCustomer();
			await ledger.reserve(customer, ADDRESS, cheq(95000), { limitNcheq: cheq(100000) });
			await settle(customer);

			const clamped = await call(customer, {});
			assert.equal(clamped.status, 200);
			assert.equal(clamped.json.amount.cheq, 5000);

			await settle(customer);
			assert.equal((await call(customer, {})).status, 429);
		});

		it('refuses an explicit amount that does not fit the quota left', async () => {
			reset();
			const customer = await newCustomer();
			await ledger.reserve(customer, ADDRESS, cheq(70000), { limitNcheq: cheq(100000) });
			await settle(customer);
			balanceNcheq = String(cheq(10000));

			assert.equal((await call(customer, { amount: 40000 })).status, 429);
			await settle(customer);
			assert.equal((await call(customer, { amount: 20000 })).status, 200);
		});

		it('answers 429 without reading the balance or calling the faucet once the quota is used up', async () => {
			reset();
			const customer = await newCustomer();
			await call(customer, { amount: 100000 });
			await settle(customer);
			resetCounters();

			const result = await call(customer, { amount: 1 });

			assert.equal(result.status, 429);
			assert.deepEqual({ balanceCalls, faucetCalls }, { balanceCalls: 0, faucetCalls: 0 });
		});
	});

	describe('faucet failures', () => {
		it('answers 502 and gives the quota back when the faucet reports a failure', async () => {
			reset();
			faucetMode = 'fail500';
			const customer = await newCustomer();

			assert.equal((await call(customer, { amount: 5000 })).status, 502);
			assert.deepEqual(await rows(customer), []);
			assert.equal(await used(customer), 0n);
		});

		it('keeps the quota, marked unknown, when the faucet call throws', async () => {
			reset();
			faucetMode = 'throw';
			const customer = await newCustomer();

			assert.equal((await call(customer, { amount: 5000 })).status, 500);
			assert.deepEqual(
				(await rows(customer)).map((r) => r.status),
				['unknown']
			);
			await backdate(customer, '2 days');
			assert.equal(await used(customer), cheq(5000));
		});
	});

	describe('address cap', () => {
		it('refuses an explicit amount above the room under the cap, and reports what can be requested', async () => {
			reset();
			balanceNcheq = String(cheq(60000));

			const result = await call(await newCustomer(), { amount: 50000 });

			assert.equal(result.status, 400);
			assert.equal(result.json.balance.maxRequestable.cheq, 40000);
			assert.ok(String(result.json.requestMore.mailtoHref).startsWith('mailto:'));
		});

		it('tops up to the cap with no amount, then answers cap_reached without using quota', async () => {
			reset();
			balanceNcheq = String(cheq(60000));
			const customer = await newCustomer();
			assert.equal((await call(customer, {})).json.amount.cheq, 40000);
			await settle(customer);

			balanceNcheq = String(cheq(100000));
			const atCap = await call(customer, {});

			assert.equal(atCap.status, 200);
			assertSubset(atCap.json, {
				funded: false,
				reason: 'cap_reached',
				balance: { maxRequestable: { cheq: 0 } },
			});
			assert.equal(await used(customer), cheq(40000));
		});

		it('lets only one of several simultaneous requests through when they would overshoot the cap', async () => {
			reset();
			balanceNcheq = String(cheq(60000)); // room for 40,000
			const customer = await newCustomer();

			const results = await Promise.all(Array.from({ length: 4 }, () => call(customer, { amount: 30000 })));

			// the minimum interval also rejects some; either way exactly one is funded and the cap is not overshot
			assert.equal(results.filter((r) => r.status === 200).length, 1);
			assert.equal(faucetCalls, 1);
			assert.equal(await used(customer), cheq(30000));
		});
	});

	describe('input and address', () => {
		it('answers 400 for an absurd amount and a sub-ncheq amount', async () => {
			reset();
			const customer = await newCustomer();
			assert.equal((await call(customer, { amount: 1e30 })).status, 400);
			assert.equal((await call(customer, { amount: 0.0000000001 })).status, 400);
		});

		it('funds a valid cheqd address the customer does not own, and charges the customer quota', async () => {
			reset();
			const customer = await newCustomer();
			const result = await call(customer, { address: OTHER_ADDRESS, amount: 1000 });
			assert.equal(result.status, 200);
			assert.equal(result.json.funded, true);
			assert.equal(result.json.address, OTHER_ADDRESS);
			assert.equal(lastFaucetAddress, OTHER_ADDRESS);
			assert.equal(await used(customer), cheq(1000));
		});

		it('answers 400 for a malformed, wrong-prefix, non-account or uppercase address, without calling the faucet', async () => {
			reset();
			const customer = await newCustomer();
			const wrongPrefix = toBech32('cosmos', new Uint8Array(20).fill(7));
			const contractAddress = toBech32('cheqd', new Uint8Array(32).fill(7));
			for (const address of ['cheqd1someoneelse', wrongPrefix, contractAddress, OTHER_ADDRESS.toUpperCase()]) {
				assert.equal((await call(customer, { address, amount: 1 })).status, 400, address);
			}
			assert.equal(faucetCalls, 0);
		});
	});

	describe('cost per request', () => {
		it('calls Stripe once for repeated requests', async () => {
			reset();
			const customer = await newCustomer();
			for (let i = 0; i < 3; i++) {
				assert.equal((await call(customer, { amount: 1000 })).status, 200);
				await settle(customer);
			}
			assert.ok(stripeCalls <= 1, `Stripe was called ${stripeCalls} times`);
		});
	});

	describe('minimum interval between requests', () => {
		it('rejects an immediate second request with 429 and Retry-After, before Stripe, the balance or the faucet', async () => {
			reset();
			const customer = await newCustomer();
			assert.equal((await call(customer, { amount: 1000 })).status, 200);
			resetCounters();

			const second = await call(customer, { amount: 1000 });

			assert.equal(second.status, 429);
			const retryAfter = Number(second.headers['Retry-After']);
			assert.ok(retryAfter >= 1 && retryAfter <= 10, `Retry-After was ${retryAfter}`);
			assert.deepEqual(
				{ stripeCalls, balanceCalls, faucetCalls },
				{ stripeCalls: 0, balanceCalls: 0, faucetCalls: 0 }
			);
			assert.equal(await used(customer), cheq(1000));
		});

		it('lets exactly one of several simultaneous requests through', async () => {
			reset();
			const customer = await newCustomer();
			const results = await Promise.all(Array.from({ length: 5 }, () => call(customer, { amount: 1000 })));
			assert.equal(results.filter((r) => r.status === 200).length, 1);
			assert.equal(results.filter((r) => r.status === 429).length, 4);
			assert.equal(faucetCalls, 1);
		});

		it('does not let a failed faucet attempt block a retry', async () => {
			reset();
			faucetMode = 'fail500';
			const customer = await newCustomer();
			await call(customer, { amount: 1000 });
			faucetMode = 'ok';
			assert.equal((await call(customer, { amount: 1000 })).status, 200);
		});
	});

	describe('reservation status', () => {
		it('records a successful request as completed', async () => {
			reset();
			const customer = await newCustomer();
			await call(customer, { amount: 1000 });
			const [row] = await rows(customer);
			assert.equal(row.status, 'completed');
			assert.notEqual(row.completedAt, null);
		});

		it('stops counting a reservation left pending by a crash once it times out', async () => {
			reset();
			const customer = await newCustomer();
			await ledger.reserve(customer, ADDRESS, cheq(95000), { limitNcheq: cheq(100000) }); // never settled
			await settle(customer);
			assert.equal((await call(customer, { amount: 20000 })).status, 429);

			await backdate(customer, '11 minutes');

			assert.equal((await call(customer, { amount: 20000 })).status, 200);
			assert.deepEqual((await rows(customer)).map((r) => r.status).sort(), ['abandoned', 'completed']);
		});
	});

	describe('initial top-up for a new testnet account', () => {
		const originalTopup = process.env.ENABLE_ACCOUNT_TOPUP;
		let originalFind: any;
		let originalProvision: any;

		before(() => {
			process.env.ENABLE_ACCOUNT_TOPUP = 'true';
			originalFind = PaymentAccountServiceRef.instance.find;
			originalProvision = AccountControllerRef.provisionCustomerAccount;
			AccountControllerRef.provisionCustomerAccount = async () => ({
				success: true,
				status: 200,
				data: { address: ADDRESS },
			});
		});

		after(() => {
			if (originalTopup === undefined) delete process.env.ENABLE_ACCOUNT_TOPUP;
			else process.env.ENABLE_ACCOUNT_TOPUP = originalTopup;
			PaymentAccountServiceRef.instance.find = originalFind;
			AccountControllerRef.provisionCustomerAccount = originalProvision;
		});

		// POST /account. `existingTestnet` is whether the customer already had a testnet payment account before the call
		const createAccount = async (customer: any, existingTestnet: boolean) => {
			PaymentAccountServiceRef.instance.find = async () =>
				existingTestnet ? [{ namespace: 'testnet', address: ADDRESS }] : [];
			// a customer that already has a payment provider id skips the Stripe account step
			customer.paymentProviderId = 'cus_test';
			let status = 0;
			const res: any = {
				locals: { customer },
				status(code: number) {
					status = code;
					return res;
				},
				json() {
					return res;
				},
			};
			await controller.create({ headers: {}, body: { primaryEmail: customer.email } }, res);
			return status;
		};

		const bootstrapStatus = () => ({ errors: [] as string[], testnetMinimumBalance: false });
		const runBootstrapTopup = async (customer: any, isNew: boolean, status: any) => {
			await topupTestnet(customer, { data: { address: ADDRESS } }, status, isNew, 'Test', 'User');
		};

		describe('POST /account', () => {
			it('tops a newly created testnet account up to 10,000 CHEQ, counted against the quota', async () => {
				reset();
				const customer = await newCustomer();

				assert.equal(await createAccount(customer, false), 201);

				assert.equal(faucetCalls, 1);
				assert.equal(lastFaucetAddress, ADDRESS);
				assert.equal(await used(customer), cheq(10000));
			});

			it('requests only the difference when the new account already holds some CHEQ', async () => {
				reset();
				balanceNcheq = String(cheq(4000));
				const customer = await newCustomer();

				assert.equal(await createAccount(customer, false), 201);

				assert.equal(await used(customer), cheq(6000));
			});

			it('does not call the faucet when the new account already holds 10,000 CHEQ or more', async () => {
				reset();
				balanceNcheq = String(cheq(10000));
				const customer = await newCustomer();

				assert.equal(await createAccount(customer, false), 201);

				assert.equal(faucetCalls, 0);
			});

			it('does not top up a testnet account that already existed, and does not read its balance', async () => {
				reset();
				const customer = await newCustomer();

				assert.equal(await createAccount(customer, true), 201);

				assert.deepEqual({ faucetCalls, balanceCalls }, { faucetCalls: 0, balanceCalls: 0 });
				assert.equal(await used(customer), 0n);
			});

			it('does not top up when ENABLE_ACCOUNT_TOPUP is not true', async () => {
				reset();
				process.env.ENABLE_ACCOUNT_TOPUP = 'false';
				try {
					const customer = await newCustomer();
					assert.equal(await createAccount(customer, false), 201);
					assert.equal(faucetCalls, 0);
				} finally {
					process.env.ENABLE_ACCOUNT_TOPUP = 'true';
				}
			});

			it('still creates the account, without calling the faucet, when the monthly quota is used up', async () => {
				reset();
				const customer = await newCustomer();
				await ledger.reserve(customer, ADDRESS, cheq(95000), { limitNcheq: cheq(100000) });

				assert.equal(await createAccount(customer, false), 201);

				assert.equal(faucetCalls, 0);
			});

			it('answers 502 and gives the quota back when the faucet reports a failure', async () => {
				reset();
				faucetMode = 'fail500';
				const customer = await newCustomer();

				assert.equal(await createAccount(customer, false), 502);
				assert.equal(await used(customer), 0n);
			});
		});

		describe('bootstrap', () => {
			it('tops a newly created testnet account up to 10,000 CHEQ and reports the minimum balance', async () => {
				reset();
				const customer = await newCustomer();
				const status = bootstrapStatus();

				await runBootstrapTopup(customer, true, status);

				assert.equal(faucetCalls, 1);
				assert.equal(await used(customer), cheq(10000));
				assert.deepEqual(status, { errors: [], testnetMinimumBalance: true });
			});

			it('does nothing for a testnet account that already existed', async () => {
				reset();
				const customer = await newCustomer();
				const status = bootstrapStatus();

				await runBootstrapTopup(customer, false, status);

				assert.deepEqual({ faucetCalls, balanceCalls }, { faucetCalls: 0, balanceCalls: 0 });
				assert.deepEqual(status, { errors: [], testnetMinimumBalance: false });
			});

			it('skips the top-up without recording an error when the monthly quota is used up', async () => {
				reset();
				const customer = await newCustomer();
				await ledger.reserve(customer, ADDRESS, cheq(95000), { limitNcheq: cheq(100000) });
				const status = bootstrapStatus();

				await runBootstrapTopup(customer, true, status);

				assert.equal(faucetCalls, 0);
				assert.deepEqual(status, { errors: [], testnetMinimumBalance: false });
			});

			it('records an error when the faucet reports a failure', async () => {
				reset();
				faucetMode = 'fail500';
				const customer = await newCustomer();
				const status = bootstrapStatus();

				await runBootstrapTopup(customer, true, status);

				assert.equal(status.errors.length, 1);
				assert.equal(status.testnetMinimumBalance, false);
			});

			it('does nothing when ENABLE_ACCOUNT_TOPUP is not true', async () => {
				reset();
				process.env.ENABLE_ACCOUNT_TOPUP = 'false';
				try {
					const customer = await newCustomer();
					const status = bootstrapStatus();
					await runBootstrapTopup(customer, true, status);
					assert.equal(faucetCalls, 0);
					assert.deepEqual(status, { errors: [], testnetMinimumBalance: false });
				} finally {
					process.env.ENABLE_ACCOUNT_TOPUP = 'true';
				}
			});
		});
	});

	describe('GET /account/balances', () => {
		it('returns the address cap and the quota used', async () => {
			reset();
			const customer = await newCustomer();
			await call(customer, { amount: 30000 });
			let body: any;
			const res: any = {
				locals: { customer },
				status: () => res,
				json: (payload: unknown) => {
					body = payload;
					return res;
				},
			};

			await controller.getBalances({}, res);

			assert.equal(body.faucet.cap.cheq, 100000);
			assertSubset(body.faucet.quota, { period: 'month', used: { cheq: 30000 }, remaining: { cheq: 70000 } });
		});
	});
});
