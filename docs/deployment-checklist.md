# Staging and production checklist

## Authentication

- [ ] `ENABLE_AUTHENTICATION="true"` and `ENABLE_EXTERNAL_DB="true"`, with the Logto variables and `COOKIE_SECRET` set.
      The image is built with `NODE_ENV=production`, and the build arguments default to `false`, so pass both as `true`
      when building or set them in the runtime environment.
- [ ] `ALLOW_INSECURE_PRODUCTION_WITHOUT_AUTHENTICATION` is **not** set.
- [ ] `PORTAL_APP_IDS` is set to the portal's Logto application id (the value the portal calls `LOGTO_APP_ID`; a comma
      list if there is more than one portal application). **Set it before the deploy**: in production the process
      refuses to start without it. The portal path then accepts an ID token only when its `aud` includes one of these
      ids; a token issued to any other application in the tenant answers `401`. Smoke test: sign in through the portal
      (works), and a token from another Logto application is refused.

## Startup guard

With `NODE_ENV=production` the process exits at start-up, with a one-line reason on stderr, unless authentication and
the external database are both on and `PORTAL_APP_IDS` is set. Values are compared strictly: only the exact string
`true` counts as on. Outside production an unset `PORTAL_APP_IDS` means the portal ID token audience is not enforced,
with a warning in the log.

`ALLOW_INSECURE_PRODUCTION_WITHOUT_AUTHENTICATION=true` is the single override for a deliberate exception, for example
the no-database sample in `docker/no-external-db`. When it is used, start-up logs a warning with the same reason. Do not
set it on a shared or internet-facing deployment. Development, test and the local end-to-end harness run with
`NODE_ENV` unset and are not affected.

## Askar native library

Start-up opens the Askar native library (`LIB_ASKAR_PATH`, or the package's own `native/` directory, or the system
library directories) with its version call. If it is missing or incompatible the process exits at once with a one-line
reason that names `LIB_ASKAR_PATH`; check that first. Without this check the first DID creation would answer `500`.

## CORS origin rejected

Symptom: every call from the portal (or any browser client) fails with `401` that looks like an authentication error,
while the same call without an `Origin` header works. Cause: the browser's origin is not in `CORS_ALLOWED_ORIGINS`.
The log carries one line per rejected origin per minute, `CORS: origin <origin> is not in CORS_ALLOWED_ORIGINS`. Fix:
add that exact origin (scheme and host, no trailing slash) to `CORS_ALLOWED_ORIGINS` and restart.

## Graceful shutdown

On `SIGTERM` or `SIGINT` the process stops accepting connections, makes `/ready` (also `/readyz`, `/readiness`) answer
`503` at once so the platform stops routing, waits for in-flight requests and queued per-payer ledger writes, then shuts
down the Credo runtime, closes the lock pool (which releases the advisory locks) and the database pool, and exits `0`.
If the work has not finished within `SHUTDOWN_GRACE_SECONDS` (default `25`) it logs the reason, cleans up and exits `1`.
A second signal exits `1` immediately. Background work (the opportunistic ledger indexer and faucet retention cleanup)
does not start once shutdown has begun. `/health` (also `/healthz`, `/live`, `/livez`) stays `200`.

- [ ] The platform's termination grace period is at least `SHUTDOWN_GRACE_SECONDS` plus a few seconds (platforms usually
      kill at 30 seconds, hence the default of 25). If you raise `SHUTDOWN_GRACE_SECONDS`, raise the platform's period too.
- [ ] The platform's readiness probe uses `/ready` and the liveness probe uses `/health`.
- [ ] The container receives the signal itself (the process is PID 1 or the init forwards `SIGTERM`).

## Request limits

- [ ] `TRUST_PROXY` is set when the service runs behind a reverse proxy or load balancer (number of hops, or an Express
      trust-proxy value). Without it every client shares one per-IP counter, the proxy's.
- [ ] Rate limits fit the traffic: `RATE_LIMIT_IP_MAX` (default 1000 per window), `RATE_LIMIT_CUSTOMER_MAX` (default 600),
      `RATE_LIMIT_WINDOW_SECONDS` (default 60). Over the limit the API answers `429` with `Retry-After`.
      Counters are in memory and per instance: with N instances the effective limit is up to N times higher. Use an
      ingress or shared-store limit if an exact global figure matters. `RATE_LIMIT_ENABLED=false` turns the in-app
      limits off for a deployment that limits at the ingress.
- [ ] JSON bodies are limited to `JSON_BODY_LIMIT` (default `1mb`). Only `POST /resource/create/:did`,
      `POST /credentials/import` and `POST /admin/webhook` use `JSON_BODY_LIMIT_LARGE` (default `10mb`); larger bodies
      answer `413`.
- [ ] `STATUS_LIST_MAX_LENGTH` (default 1048576 entries) suits the status lists customers create.
- [ ] Database connection budget. Each instance can open up to 20 Postgres connections by default: the main pool
      (`EXTERNAL_DB_POOL_MAX`, default 10) and the ledger-lock pool (`EXTERNAL_DB_LOCK_POOL_MAX`, default 10). With N
      instances that is up to 20 x N connections, so check it against the database's `max_connections` and any
      pooler (for example PgBouncer in transaction mode must not sit in front of the lock pool, because the locks are
      session-level advisory locks). Lower either value if the budget is tight. Related timeouts:
      `EXTERNAL_DB_POOL_IDLE_TIMEOUT_MS`, `EXTERNAL_DB_POOL_CONNECTION_TIMEOUT_MS`,
      `EXTERNAL_DB_LOCK_POOL_IDLE_TIMEOUT_MS`, `EXTERNAL_DB_LOCK_POOL_CONNECTION_TIMEOUT_MS`.
- [ ] Ledger indexer (optional, off by default). `LEDGER_INDEXER_ENABLED=true` fills the staff faucet-to-ledger
      ledger figures. Steps: run the migration `1791702200000` (new table `ledgerAddressActivity`, reversible); check the
      pod can reach `LEDGER_INDEXER_SOURCE_URL` (default `https://data-api.cheqd.io`, outbound HTTPS, no key); set
      `LEDGER_INDEXER_ENABLED=true`; the first batches start on the next faucet request or staff view of the analytics.
      With `LEDGER_INDEXER_BATCH_SIZE=25` and the default 10-minute interval, expect about 150 addresses an hour per
      busy instance, so a large backlog takes a while; the route stays on "not available" until
      `LEDGER_INDEXER_MIN_COVERAGE_PERCENT` of the funded addresses are checked. The source is a public cheqd service
      with no published rate limit or SLA: if it is down the sync backs off and the route keeps its previous answer.
      Rollback: set `LEDGER_INDEXER_ENABLED=false` (the route reverts to Studio-recorded figures at once); the table
      can stay.
- [ ] On-ledger analytics (same switch). Run the migration `1791702300000` after `1791702200000`: it adds the table
      `ledgerAddressDaily` and two nullable columns on `ledgerAddressActivity` (expand-only, additive, reversible with
      its `down`). The sync now stores per-day writes and fees for each funded address, so each address check does one
      more statement of the same size and the first full pass after the deploy re-checks every address (existing rows
      have no per-day data yet): expect the staff route `/admin/analytics/ledger-writes` to answer `supported: false`
      until `LEDGER_INDEXER_MIN_COVERAGE_PERCENT` of the funded addresses are covered. The customer route
      `/account/analytics/ledger` calls the data API on demand (cached 5 minutes per customer, bounded by
      `LEDGER_INDEXER_MAX_PAGES`, `LEDGER_INDEXER_PAGE_SIZE`, `LEDGER_INDEXER_TIMEOUT_SECONDS`) for the customer's own
      payer addresses on testnet and mainnet, so with `LEDGER_INDEXER_ENABLED=true` the pod needs outbound HTTPS to
      `LEDGER_INDEXER_SOURCE_URL`; with it off the route answers `supported: false`. No new variable, no new scope
      (`read:account` and `admin:analytics:read`). Rollback: `LEDGER_INDEXER_ENABLED=false`; the table and columns can
      stay, or run the migration `down`.

Health, readiness (`/health`, `/healthz`, `/ready`, `/readyz`, `/readiness`, `/live`, `/livez`) and the Swagger paths
are never rate limited.

## API key expiry

API key expiry is now enforced on every request (see `docs/api-key-expiry.md`). Before this release the expiry was
stored but ignored, so keys whose expiry has already passed were still working. They stop working at rollout, with `401`.

- [ ] List the keys that will stop working, and tell their owners (or extend them with `POST /admin/api-key/update`):

      ```sql
      SELECT "customerId", "name", "expiresAt", "revoked"
      FROM "apiKey"
      WHERE "revoked" = false AND "expiresAt" <= now()
      ORDER BY "expiresAt";
      ```

      To see the keys that will lapse soon, change the condition to `"expiresAt" <= now() + interval '30 days'`.
- [ ] `API_KEY_MAX_EXPIRATION_DAYS` (default 730) is the longest expiry the create and update routes accept. Keys created
      without an expiry now expire 30 days after creation (previously a date roughly 30 months out).

## Machine-to-machine customer path

Disabled by default; enable only for a named internal service, add its client to `M2M_CLIENT_CUSTOMER_MAP`, and plan to bind audience and client first.

- [ ] `ENABLE_M2M_CUSTOMER_PATH` is unset or not exactly `true` in every environment, unless a named internal service needs it.
- [ ] Only the exact string `true` enables it; `TRUE`, `1` or anything else leaves it off.
- [ ] While it is off, a request with a `customer-id` header and a Bearer token (and no `x-api-key`) answers `401` before any token is checked, and the log shows `m2m-customer-path-disabled`. The portal never sends `customer-id`, so it is unaffected, as are API keys and ID-token sessions.
- [ ] If it is enabled, the startup log carries a warning. Treat that as a finding to close, not a steady state.
- [ ] Callers that sent `customer-id` with a Bearer token (for example faucet scripts) have moved to an API key or a user session before the release is deployed.

## Staff access

See `docs/staff-access.md`.

- [ ] A Logto role named as in `STAFF_ROLE_NAMES` (default `cheqd admin`) exists, with the staff scopes (`admin:customers:read`, `admin:analytics:read`, `admin:audit:read`, `admin:organisation:delete`, `admin:flags:update`) on the Studio admin resource, assigned only to named staff.
- [ ] No staff scope is on a customer role, the portal M2M application or any other M2M client.
- [ ] The portal's Logto application requests the ID-token scopes `email` and `roles`.
- [ ] `STAFF_EMAIL_DOMAINS` and `STAFF_ROLE_NAMES` are set deliberately (or left at the defaults `cheqd.io` and `cheqd admin`).
- [ ] Smoke test: a staff member with the role and a verified cheqd address gets `200` from `GET /admin/customers`; a non-staff user, a user without the role, a user with an unverified or other-domain email, an M2M client and an API key each get `403`.

