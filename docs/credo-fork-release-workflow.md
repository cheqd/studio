# Publishing the Credo fork (`cheqd/credo-ts`) as `@cheqd/credo-*`

Status: draft. Nothing here is published or enabled. The workflow draft is [credo-fork-release-workflow.yml.draft](credo-fork-release-workflow.yml.draft). It belongs at `.github/workflows/release-packages.yml` in `cheqd/credo-ts` (migration plan, phase 1, step 3 and decision D6).

## What Fraser must do

1. **npm scope.** Confirm the `@cheqd` npm organisation exists and that the publishing account (or a granular token) can publish public packages to it. The scope covers `@cheqd/credo-core`, `-node`, `-askar`, `-anoncreds`, `-cheqd`, `-tenants` and `-didcomm`.
2. **`NPM_TOKEN` secret.** Create a granular, automation-class npm token limited to `@cheqd/credo-*` with publish rights. Add it as an **environment secret** in a new `npm-publish` environment on `cheqd/credo-ts` with required reviewers. Never commit it.
3. **Provenance.** Publishing from GitHub-hosted runners with `id-token: write` is enough. The npm package settings must not restrict publishing to a different repository. The first publish of each new package name creates it; later, optionally switch the packages to npm trusted publishing and drop the token.
4. **Copy the draft** to `cheqd/credo-ts` on a branch, open a PR, pin the actions to commit SHAs, and run it once with `dry_run: true`.
5. **Settle the open design point below**, then publish a first version (suggested `0.7.1-cheqd.1` on the `next` tag).
6. **Studio switch.** After publish, in `cheqd/studio` replace the `file:vendor/credo/*.tgz` dependencies and overrides with exact registry versions, using npm aliases so source imports stay `@credo-ts/*`:
   `"@credo-ts/core": "npm:@cheqd/credo-core@0.7.1-cheqd.1"` (same for the others and in `overrides`). Delete `vendor/credo`, remove the `COPY vendor` line from the Dockerfile, run `npm install`, commit the lock file.

## Open design point (needs a decision before the first publish)

The fork's source imports `@credo-ts/core` and friends. If the published packages are renamed to `@cheqd/credo-*`, their built output still imports `@credo-ts/core` unless the build rewrites those specifiers. Options:

- **A. Rewrite specifiers at build time** (a `sed` or tsdown alias over the built `.mjs` and `.d.mts` files, plus a check that no `@credo-ts/` string remains). Cleanest for consumers.
- **B. Keep `@credo-ts/*` names inside the tarballs and rely on consumer-side aliases.** Not viable: the internal imports would resolve to the upstream packages.

The draft renames metadata only and leaves a comment where option A's rewrite step goes. It is not safe to enable until that step is written and tested (install the packed tarballs into an empty project and run `scripts/credo-runtime-smoke.mjs` from cheqd/studio).

## Checks the draft performs

- Only runs on the `cheqd` branch, on manual dispatch, with a reviewer-gated environment.
- Version must be exact semver and is passed through an environment variable, never interpolated into shell.
- Fails if a tarball still contains `workspace:` or `catalog:` ranges, or secret-like files.
- Generates a CycloneDX SBOM per package with `npm sbom` and uploads it with the tarballs as a workflow artefact.
- Publishes with `--provenance`, dependencies first.

## Rebuilding the vendored tarballs by hand (until the publish workflow runs)

The tarballs in `vendor/credo/` are `0.7.1-cheqd.<fork commit>`. To change them: commit the fork change on a branch of the
fork clone, build each package with its own `tsdown` (`node_modules/.bin/tsdown --config-loader unrun` in `packages/<name>`),
then for each of core, node, askar, anoncreds, cheqd, tenants and didcomm take the previous tarball, replace its `build/`
with the fresh one, replace the old version string in its `package.json` with the new one (the dependencies between the
packages are exact versions), and `tar czf` it as `credo-ts-<name>-<version>.tgz` with a top-level `package/` folder.
Delete the old tarballs, update the seven `file:vendor/credo/...` entries in `package.json` (dependencies and overrides)
and the lock file (version strings and the `sha512` integrity of each tarball), then `npm ci --force --ignore-scripts`
and run `scripts/credo-runtime-smoke.mjs` (`PG_PORT` selects the Postgres port).

Version `0.7.1-cheqd.09ad0fb` adds `CheqdModuleConfig.resolvePayer`: the fee payer is resolved per write from the tenant
context, there is no random-payer fallback, `disconnect()` closes connections, a raw hex payer key is decoded to its 32
bytes, and registrars return payer, ledger and start-up failure reasons.
