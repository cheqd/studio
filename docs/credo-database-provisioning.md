# Credo database provisioning (runbook)

Credo's Askar store lives in a **database of its own** on the same Postgres cluster as Studio's, with its own app
role. It is not a schema in Studio's database. Design: knowledge-base `engineering/architecture/credo-tenancy-and-storage.md`
(sections 2 and 4), plan decision D12 and open item O15.

Provisioning is a **one-off step per environment, done by a person with the cluster admin user**. Neither the
application nor a migration does it, and CI does not run it. The Studio migration `1791700100000` is a no-op for
this reason.

## What Askar does (tested)

- The store id is the **database name**. Askar keeps its tables (`config`, `profiles`, `items`, `items_tags`) in a
  **schema named after the connecting database user**, for example `studio_credo_app`.
- Do not use Askar's `schema` URL parameter (it hits a bug in the bundled native library) or `search_path`
  (it fails).
- When the database exists but holds no Askar schema, Askar does not provision it. Studio's runtime does, on the
  first Credo call, using **only the app role**, and writes the storage-version record Credo expects. The runtime
  never uses admin credentials and never creates a database.
- With `enableKms: false`, Askar holds records only. Signing keys stay in Studio's `private-key` table.

## Before you start

You need:

- the cluster admin URL (DigitalOcean: the `doadmin` user), connecting to the maintenance database
  (`defaultdb`, or `postgres` locally);
- a strong password for the new role, generated and stored in the secrets manager, not typed into shell history;
- a store key for this environment (below).

## 1. Create the database and role

```sh
export CREDO_DB_PASSWORD="$(openssl rand -hex 24)"   # keep it: it goes into the app's secrets
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 \
  -v db=studio_credo -v role=studio_credo_app -v password="$CREDO_DB_PASSWORD" \
  -f scripts/credo-database-provisioning.sql
```

`db` is `CREDO_DB_NAME`, `role` is `CREDO_DB_USER`. The script is idempotent: it creates the role and database if
absent, sets the role's password (so re-running it with a new password rotates it), revokes access for everyone
else (`PUBLIC`) and grants the role `CONNECT` and `CREATE` on that database only. The role is not a superuser and
cannot create databases or roles. It gets nothing in Studio's own database.

`CREATE` on the database is required: Askar creates the schema named after the role, and its tables, on first run.
Staging and production each have their own database and role; use different names or clusters, and different
passwords.

## 2. Generate and escrow the store key

```sh
openssl rand -hex 32     # 64 hex characters: a raw 32-byte key. Base64 of 32 bytes is also accepted.
```

- Set it as the encrypted environment variable `CREDO_STORE_KEY`, separately for each environment. **Staging and
  production must never share it.**
- Escrow it out of band (password manager or vault, two named people), separately from database backups.
  Escrow `EXTERNAL_DB_ENCRYPTION_KEY` the same way first: losing that loses every customer's keys.
- If `CREDO_STORE_KEY` is lost, the Askar records are unreadable (keys are safe, in `private-key`). If it is wrong,
  the engine fails closed and changes nothing.
- Rotation (`rotateStoreKey`) is not scripted yet: rehearse it on staging before production (secrets runbook, R7).

## 3. Set the application's variables

| Variable | Required | Notes |
|---|---|---|
| `CREDO_DB_NAME` | no | Default `studio_credo`. Must not be Studio's own database. |
| `CREDO_DB_USER` | yes | The app role. No fallback to Studio's user. |
| `CREDO_DB_PASSWORD` | yes | The app role's password. No fallback. |
| `CREDO_STORE_KEY` | yes | Raw 32-byte key, hex or base64. No fallback, no derivation. |
| `CREDO_DB_MAX_CONNECTIONS` | no | Default 5. Askar's own pool, on top of Studio's. |
| `CREDO_DB_IDLE_TIMEOUT` | no | Default 30 (seconds). |
| `CREDO_DB_CONNECT_TIMEOUT` | no | Default 10 (seconds). |

Host, port and TLS (and `EXTERNAL_DB_CERT`) come from `EXTERNAL_DB_CONNECTION_URL`, as the cluster is shared.

Add `CREDO_DB_MAX_CONNECTIONS` to the cluster's connection budget: there are two pools in one process.

**Connection mode:** point Credo at the cluster **directly, or through a session-mode pool, not a transaction-mode
pool.** Askar's Postgres driver (sqlx) uses prepared statements, which transaction-mode pooling can break. On
DigitalOcean, use the database's direct connection host and port, or a pool created in *session* mode.

Settings fixed in code: `multiWalletDatabaseScheme: ProfilePerWallet` (one store, one profile per customer; the
default `DatabasePerWallet` would need database-creation rights) and `enableKms: false`.

## 4. Check it

1. Start Studio. With the Credo engine not selected, nothing above is read and Studio starts either way.
2. Select the Credo engine for a test customer and make one call (for example create a key). The first call
   provisions the store.
3. Confirm, as the admin user:

```sql
\c studio_credo
SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema = 'studio_credo_app';
-- expect config, items, items_tags, profiles
SELECT kind, count(*) FROM studio_credo_app.items GROUP BY kind;
-- expect only kind 2 (records). A row with kind 1 would mean Askar is holding keys: stop and investigate.
```

4. Restart Studio and repeat the call: the store reopens with the same key.

## If Credo storage is not configured

A Credo call fails with `CredoConfigurationError`, a one-line message that names each missing or invalid variable
(or the missing database) and points back here. It is not retried and not cached: set the variable and the next call
works. A wrong `CREDO_STORE_KEY` against an existing store fails with Askar's error and writes nothing.

## Backup and restore

The cluster's point-in-time recovery covers both databases if enabled, but a restore must bring back **both** to
the same point. Restore drills must also confirm Askar opens the restored store with the escrowed key.

## Checking the provisioning script locally

```sh
docker run -d --rm --name credo-db -e POSTGRES_PASSWORD=postgres -p 54335:5432 postgres:16
psql postgres://postgres:postgres@localhost:54335/postgres -v ON_ERROR_STOP=1 \
  -v db=studio_credo -v role=studio_credo_app -v password=fake-local-password \
  -f scripts/credo-database-provisioning.sql
```

The integration test (`tests/integration/credo-engine.test.ts`) creates the same database and role itself.
