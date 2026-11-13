# Studio contract suite (gate T1)

This suite defines "backward compatible" for the Veramo to Credo migration (migration plan, section 5 phase 0 step 2
and section 9 gate T1). Golden request and response fixtures are recorded from current `main` on testnet, then replayed
against any Studio build, and the normalised responses are diffed.

**Status: the machinery is built and tested; no golden fixtures have been recorded yet.** Nothing here was recorded
against a live Studio, so `fixtures/` is empty and `coverage.md` shows every step as "to record". Recording needs testnet
credentials and a running Studio.

## What is in here

| Path | Purpose |
|---|---|
| `inventory/routes.json` | Every route: method, path, auth kind, scopes, tier, side effect, whether it is in the route table and the OpenAPI specs. Generated, checked in, drift-tested. |
| `lib/route-metadata.ts` | The only hand-maintained part of the inventory: tier 1 list and side-effect overrides. |
| `lib/normaliser.ts` | Turns responses into a deterministic form (rules below). |
| `lib/diff.ts` | Structural diff: `strict` or `additive`. |
| `lib/scenario.ts` | The scripted scenario: ordered steps, each tied to an inventory route. |
| `lib/engine.ts` | Runs a scenario against a base URL, stores and compares fixtures. |
| `scripts/record.ts` | RECORDER (CLI). |
| `__tests__/replay.test.ts` | REPLAYER (jest). Skips cleanly with no env or no fixtures. |
| `__tests__/hermetic-replay.test.ts` | Records and replays against local stub servers. Runs anywhere. |
| `__tests__/normaliser.test.ts`, `diff.test.ts`, `inventory.test.ts` | Hermetic unit tests, including inventory and coverage drift checks. |
| `coverage.md` | Per-route coverage table (generated). Rows marked "to record" or "no scenario step" still need fixtures. |
| `fixtures/` | Golden fixtures, one JSON file per scenario step. Empty until recorded. |

## Tiers

- **Tier 1:** `POST /account/faucet`, `GET /account/balances`, `POST /account/create`, the encrypted status-list create
  and update routes (they carry payment conditions), and every Stripe billing route under `/admin/subscription/`,
  `/admin/checkout/`, `/admin/price/`, `/admin/product/` and `/admin/webhook`. There is no separate top-up route in the
  route table on `main` (new accounts are no longer topped up; users call the faucet), so the faucet is the top-up path.
  Edit `TIER_1_IDS` and `TIER_1_PREFIXES` in `lib/route-metadata.ts` if you want a different cut, then regenerate.
- **Tier 2:** everything else.

Run only tier 1 with `CONTRACT_TIER=1`.

## Hermetic tests (no testnet, run in CI)

```sh
NODE_OPTIONS=--experimental-vm-modules npx jest -c tests/contract/jest.config.cjs
```

This exercises the normaliser, the diff, the recorder and replayer against stub servers (ids, timestamps, hashes,
signatures and JWTs differ per stub instance; a removed, re-typed, changed or added field and a changed status are all
caught), the safety gates, and drift between the inventory/coverage files and `src/app.ts`, the auth rules and the OpenAPI
specs. The stubs are not Studio. The live replay test appears as one skipped test.

After changing routes, auth rules, the scenario or fixtures, regenerate:

```sh
npx tsx tests/contract/scripts/generate-inventory.ts
npx tsx tests/contract/scripts/generate-coverage.ts
```

## Recording fixtures (Fraser)

### What you need

- A running Studio built from current `main`, on **staging or local, pointing at testnet**. Confirm staging's
  ledger network is testnet before you start; the recorder refuses `CONTRACT_NETWORK` other than `testnet` and refuses
  hosts listed in `CONTRACT_PRODUCTION_HOSTS` (default `studio-api.cheqd.net`) but cannot see which network the server
  uses. Staging is `https://studio-api-staging.cheqd.net` according to `.github/workflows/staging.yml`.
- A staging API key (`x-api-key`) for an account with testnet scopes: `read:account`, `list:did:testnet`,
  `list:resource:testnet`, `list:event:testnet`, `list:credential:testnet`, `list:credential-status:testnet`,
  `list:providers:testnet`, `list-accreditation:trust-registry:testnet`, `check:credential-status`, and for the write
  steps `create:did:testnet`, `update:did:testnet`, `deactivate:did:testnet`, `create:resource:testnet`,
  `create-unencrypted:credential-status:testnet`, `update-unencrypted:credential-status:testnet`,
  `issue:credential:testnet`, `verify:credential:testnet`, `create:presentation`, `create:key`, `read:key`,
  `request:faucet:testnet`. A step that fails with 403 shows which scope is missing.
- Never put the key in a file in the repo. Export it in your shell only. The recorder never writes the key into a
  fixture and aborts if it finds it in one.

### Step 1: read-only subset first (free, no state change)

```sh
export CONTRACT_BASE_URL=https://studio-api-staging.cheqd.net
export CONTRACT_API_KEY=...            # from your shell, not a file
npx tsx tests/contract/scripts/record.ts --dry-run   # sends the read-only steps only (never a state-changing one, even with CONTRACT_ALLOW_* set) and writes no fixtures
npx tsx tests/contract/scripts/record.ts             # writes tests/contract/fixtures/*.json
git diff --stat tests/contract/fixtures
```

With no `CONTRACT_ALLOW_*` flags this runs only `read-only` steps: public DID, resource and status-list reads against the
public testnet fixtures already used by the e2e tests, the authenticated account and listing routes, the status-list
check (a POST that does not write), and the negative cases (no credential, invalid faucet address, invalid DID body),
which are rejected before any side effect. Check each fixture by eye: the status code should be what you expect (a 4xx
from a missing scope is not golden), then regenerate coverage and commit.

Defaults for the targets are in `lib/config.ts` (the testnet DID, status list and resource used in `tests/e2e`). Override
with `CONTRACT_KNOWN_DID`, `CONTRACT_KNOWN_STATUS_LIST_NAME`, `CONTRACT_SUBJECT_DID` if those no longer exist.

### Step 2: steps that change state (opt in, one flag per cost class)

| Flag | Steps it enables | Cost or effect |
|---|---|---|
| `CONTRACT_ALLOW_MUTATIONS=true` | `key-create`, `key-read`, `key-verification-method`, `credential-issue-jwt`, `credential-verify-jwt`, `presentation-create` | Writes to Studio's database on that account (a key, an issued credential record). No ledger fee. |
| `CONTRACT_ALLOW_LEDGER_WRITES=true` | `did-create`, `did-update`, `resource-create`, `status-list-create-unencrypted`, `status-list-update-unencrypted`, `did-deactivate` | Ledger writes on testnet. **Each pays a network fee from the account's testnet balance**, and the DID created is permanently deactivated at the end. Fund the account via the faucet first. |
| `CONTRACT_ALLOW_FAUCET=true` | `faucet-own-account` (tier 1) | Sends 10,000 testnet CHEQ to the account. Counts against the per-customer monthly faucet quota and per-address cap. |

The chain is ordered: `did-create` captures `did`, later steps use it. If you enable the credential steps without the ledger
steps they are skipped (missing variable `did`). Run the ledger and database flags together for the full chain:

```sh
CONTRACT_ALLOW_FAUCET=true CONTRACT_ALLOW_LEDGER_WRITES=true CONTRACT_ALLOW_MUTATIONS=true \
  npx tsx tests/contract/scripts/record.ts
```

Use `CONTRACT_STEPS=did-create,did-update` to run named steps only, or `CONTRACT_TIER=1`.

### Routes the recorder never mutates

- **Stripe mutations** (`/admin/subscription/create|update|cancel|resume`, `/admin/webhook`): `billing`, not scripted.
  Record by hand against Stripe test mode. The three read-only Stripe GETs run with `CONTRACT_FEATURE_STRIPE=true`.
- `POST /did/export/:did` and the secret-bearing key responses: key material must never be committed. `key-create` and
  `key-read` keep only the shape of `privateKeyHex` and `publicKeyHex`. `did/export` has no step.
- Status-list encrypted create and update, accreditation issue, revoke, suspend, reinstate, credential revoke, suspend,
  reinstate, provider configuration and import, and the credential offer routes have no scenario step yet (see
  `coverage.md`). Add steps in `lib/scenario.ts`, record, regenerate coverage.

### Step 3: commit

```sh
npx tsx tests/contract/scripts/generate-coverage.ts
git add tests/contract && git commit
```

Fixtures are reviewed like code: a fixture records what `main` does today, so look for a status or field you would not
want frozen. The recorder refuses to write HTTP 5xx responses.

## Replaying

```sh
export CONTRACT_BASE_URL=http://localhost:3000   # the build under test
export CONTRACT_API_KEY=...
ENGINE=veramo NODE_OPTIONS=--experimental-vm-modules npx jest -c tests/contract/jest.config.cjs replay
```

- Without `CONTRACT_BASE_URL`, or with no fixtures, the replay test is one skipped test and the run passes.
- Only steps allowed by the `CONTRACT_ALLOW_*` flags run; the rest are skipped and not counted as failures. In CI against
  staging use the read-only subset; run the full chain by hand before releases.
- `ENGINE` labels the run (default `veramo`) and is printed in the suite name. The same fixtures are meant to be
  replayed against both engines. How a target is told to use an engine is not defined yet (the `EngineRouter` is
  unbuilt), so the runner sends the label as a request header only if you set `CONTRACT_ENGINE_HEADER=<header-name>`.
  Until the router exists, point `CONTRACT_BASE_URL` at the deployment running the engine you want to test.
- `CONTRACT_DIFF_MODE=strict` (default): any difference fails, including new fields. `additive`: new fields in the
  response are tolerated; removed, changed and re-typed fields and status changes still fail. Pick `additive` for the
  Credo comparison if you accept additive response fields as compatible.
- A failing step prints the path and kind of each difference (`changed`, `missing`, `extra`, `type`). A difference
  under `[scenario-drift]` means the scenario request no longer matches the one recorded: re-record that step.

## Normalisation rules

Applied to responses and to the stored request. Placeholders keep the shape of the value, so a field that changes type or
vanishes still fails. Numbering (`<uuid:1>`, `<uuid:2>`) is by first appearance within one request/response exchange, so two
fields holding the same id still match each other.

| Input | Output |
|---|---|
| Pinned scenario values (target DIDs, subject DID, run id) | `<var:NAME>` |
| Compact JWT | `{ "$jwt": { header, payload } }` with the payload normalised recursively; the signature is dropped |
| ISO 8601 timestamps | `<timestamp>` |
| UUIDs | `<uuid:N>` |
| `did:cheqd:<net>:<short id>` | `did:cheqd:<net>:<did-id:N>` |
| 64-character hex (tx and content hashes) | `<hash:N>` |
| `cheqd1...` addresses | `<address:N>` |
| Keys `proofValue`, `signature`, `signatureValue`, `jws` | `<signature>` (`proofValue` keeps its first character, e.g. `<signature:z>`) |
| Key `encodedList` | `<encodedList:X>`, X the first character (so the "no `u` prefix" encoding is still checked) |
| Keys `txHash`, `transactionHash` | `<hash:N>` |
| Keys `nonce`, `challenge`, `jti` | `<random>` |
| Numeric `iat`, `exp`, `nbf`, `timestamp`, `created*`, `updated*`, `*At` | `<epoch>` |
| Per-step `ignorePaths` | `<ignored>` |
| Per-step `shapeOnlyPaths` | `<string>`, `<number>`, `<array>`, `<null>`... |

Object keys are sorted; array order is kept (an order change counts as a change). Only `content-type` (media type) and the
status code are compared from the HTTP envelope; other headers are not.

## Known limits

- The request bodies and capture paths in the mutating steps, and the `shapeOnlyPaths` guesses for account, balance and
  listing responses, are written from the OpenAPI spec and the e2e payloads and have not been run against a live Studio.
  Expect to correct a few on the first recording.
- The recorder cannot tell which network the server is on; it only controls the network the scenario asks for.
- The inventory's `auth` field reflects the auth rules in code. It flags documentation and rule drift that exists on `main`:
  `DELETE /admin/subscription/cancel` has no matching auth rule (the rule is registered for POST) and OpenAPI documents
  it as POST; `DELETE /admin/api-key/revoke` is documented as POST. `POST /admin/webhook` has no auth rule.
