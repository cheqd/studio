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
