-- One-off provisioning of Credo's Askar store database and app role. Idempotent: safe to re-run.
-- NOT run automatically (not by the application, not by a migration, not by CI). Run it once per environment, as
-- the cluster's admin user, against the maintenance database (for example `postgres`, or `defaultdb` on
-- DigitalOcean). See docs/credo-database-provisioning.md.
--
--   psql "$ADMIN_URL" -v ON_ERROR_STOP=1 \
--     -v db=studio_credo -v role=studio_credo_app -v password="$CREDO_DB_PASSWORD" \
--     -f scripts/credo-database-provisioning.sql
--
-- `db` must equal CREDO_DB_NAME, `role` CREDO_DB_USER and `password` CREDO_DB_PASSWORD in the application.
-- Re-running resets the role's password to the value given, which is how the password is rotated.

-- The app role: can log in, cannot create databases or roles, owns nothing outside its own database
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE', :'role')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'role')
\gexec

SELECT format('ALTER ROLE %I PASSWORD %L', :'role', :'password')
\gexec

-- The database is owned by the admin user, not by the app role
SELECT format('CREATE DATABASE %I', :'db')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db')
\gexec

-- Only the app role (and the admin user) may connect. CREATE on the database lets Askar create the schema it
-- names after the role, and its tables inside that schema. The app role gets nothing in Studio's own database.
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', :'db')
\gexec

SELECT format('GRANT CONNECT, CREATE ON DATABASE %I TO %I', :'db', :'role')
\gexec
