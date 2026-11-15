# Staging and production checklist

## Authentication

- [ ] `ENABLE_AUTHENTICATION="true"` and `ENABLE_EXTERNAL_DB="true"`, with the Logto variables and `COOKIE_SECRET` set.
      The image is built with `NODE_ENV=production`, and the build arguments default to `false`, so pass both as `true`
      when building or set them in the runtime environment.
- [ ] `ALLOW_INSECURE_PRODUCTION_WITHOUT_AUTHENTICATION` is **not** set.

## Startup guard

With `NODE_ENV=production` the process exits at start-up, with a one-line reason on stderr, unless authentication and
the external database are both on. Values are compared strictly: only the exact string `true` counts as on.

`ALLOW_INSECURE_PRODUCTION_WITHOUT_AUTHENTICATION=true` is the single override for a deliberate exception, for example
the no-database sample in `docker/no-external-db`. When it is used, start-up logs a warning with the same reason. Do not
set it on a shared or internet-facing deployment. Development, test and the local end-to-end harness run with
`NODE_ENV` unset and are not affected.

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

Health, readiness (`/health`, `/healthz`, `/ready`, `/readyz`, `/readiness`, `/live`, `/livez`) and the Swagger paths
are never rate limited.
