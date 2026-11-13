# Tenant isolation suite (gate T2, risk R-012)

Two accounts, A and B. Every tenant-scoped route is exercised, and account B must never read or change account A's
DIDs, keys, resources, status lists, credentials, API keys, payment accounts, provider configuration or operations.

## Tiers

**Hermetic** (runs in CI, no secrets). The real Express app runs in-process with its real route table, validators, auth
guard, auth rules, TypeORM entities and migrations, against a throwaway Postgres database. Only the outside world is
stubbed: LogTo and JOSE (stub tokens only), Stripe (a recording ledger), and Veramo and the ledger (every call is
recorded, so a test can see whether a request got far enough to sign or broadcast).

```sh
docker run -d --rm --name studio-isolation-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=studio_test -p 54329:5432 postgres:16-alpine
npx cross-env NODE_OPTIONS=--experimental-vm-modules jest -c tests/tenant-isolation/jest.config.cjs
```

The database is dropped and rebuilt from the migrations at the start of each test file. Point at another Postgres with
`EXTERNAL_DB_CONNECTION_URL` (default `postgres://postgres:test@localhost:54329/studio_test`). Use a disposable
database: it is wiped.

**Staging** (optional, skipped when the environment is absent). The same assertions, black-box, against a real
deployment: `tests/tenant-isolation/staging/staging.test.ts`. It needs `STUDIO_STAGING_BASE_URL`,
`STUDIO_STAGING_API_KEY_A` and `STUDIO_STAGING_API_KEY_B`. It is read-only unless `STUDIO_STAGING_ALLOW_MUTATION=1`,
which also needs `STUDIO_STAGING_A_DISPOSABLE_DID` and `STUDIO_STAGING_A_CREDENTIAL` (disposable testnet data owned by
A). Never commit real values.

## How a case works

`cases.ts` and `cases-extra.ts` describe requests that name one of A's resources. Each runs twice: as the owner (the
control, which must be authorised, so the payload is known to be valid) and as B (the attack, which must be refused,
leak nothing and change nothing; A's rows are compared before and after).

`route-inventory.json` lists every route in `src/app.ts` with its classification, the OpenAPI flag and the test files
that cover it. `inventory.test.ts` fails if the route table, the OpenAPI specs, the auth rules and the inventory drift
apart.

## Known bugs

A case that fails today because of a real defect is kept as `it.failing` and labelled `[KNOWN BUG <id>]`. The ids and
descriptions are in `helpers.ts` (`KNOWN_BUGS`). Such a case passes while the bug exists and fails the moment the bug
is fixed, which tells you to drop the marker. To see each bug's real failure message, or to prove a fix, run with
`ISOLATION_ENFORCE_KNOWN_BUGS=1`: the cases then run as ordinary tests and must pass.
