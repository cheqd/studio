# Engine routing

Every identity operation that signs, verifies, reads the ledger or stores a key reaches its engine through the
`EngineRouter` (`src/services/identity/engine/engine-router.ts`).

**Veramo is retired for new artefacts (decision of 15 November 2026).** Existing artefacts keep working on Veramo, and
the engine recorded on an artefact always decides. A NEW DID, key, status list or credential goes to Credo, whatever
the `featureFlag` table says (see "Veramo retired for new artefacts" below). The migration design is in
`docs/veramo-retirement.md`.

## How a call site selects an engine

```ts
const setup = new IdentityServiceStrategySetup(customer.customerId);
const engine = await setup.engine(route, artifact, hints); // IdentityEngine
const service = await setup.routed(route, artifact, hints); // same engine, typed as Veramo-shaped RoutedService
```

- `route` is the route family (the unit a feature flag switches): `key`, `did`, `resource`, `credential`,
  `presentation`, `status-list`. The `agent` families are Credo only and are routed in `src/services/agent/index.ts`.
- `artifact` is an existing artifact, so its recorded engine wins and flags are ignored:
  - `{ kind: 'did', id: <did> }` reads `identifier.engine`
  - `{ kind: 'status-list', id: <statusRegistry.registryId> }` reads `statusRegistry.engine`
  - `{ kind: 'credential', id: <issuedCredential.issuedCredentialId> }` reads `issuedCredential.engine`
  - No artifact and `hints.creates` means a new artifact: Credo (unless the temporary override below is on).
  - No artifact and no `creates` means a call that creates nothing and names nothing (verify, list, key read,
    presentation, received credentials): the legacy choice, the `featureFlag`, else `veramo`. Those calls cannot be
    moved to Credo before the artefacts they act on have moved.
- `hints.creates` is set by every call site that creates a new artefact: `POST /key/create`, `POST /key/import`, the key
  made inside `POST /did/create`, `POST /did/create`, `POST /did/import`, and status-list creation. A credential is
  signed by its issuer DID's engine, and an issuer DID Studio has no record of (`flagWhenUnrecorded`) counts as new.
- `hints` also carries what the router needs for its exceptions: `keyType` (P-256 / `Secp256r1` / `JsonWebKey` always goes
  to Credo) and `encryptedStatusList` (creation answers `Gone`, 410, on every engine).
- `src/services/identity/engine/artifact-refs.ts` turns what a caller knows (a DID and a status-list name, or a
  credential) into the artifact reference. With no external database, no row, or a schema that predates the table they
  return nothing and the router uses the default. A query that fails is not "no record": the artifact may be Credo's,
  so the request is refused with `EngineRoutingUnavailable` (503, retryable) instead of being answered by Veramo.
- The same holds in the router: a failed artifact-engine lookup, an unrecognised recorded engine, or a failed flag
  read with no last-known value is refused with 503 (and logged as `engine-routing-failed`). A flag read that fails
  while a last-known value exists keeps using that value (logged as `flag-read-failed`). For an existing record the
  legacy default (`veramo`) applies only when the lookup worked and found a row with an empty `engine` column.
- A new artefact does not read the flag table at all while the override is off, so a flag outage cannot fail a create.

## Veramo retired for new artefacts

| Situation | Engine |
|---|---|
| New DID, key, status list; credential or resource under an issuer or DID Studio has no record of | `credo` |
| Existing artefact with `engine = 'credo'` | `credo` |
| Existing artefact with `engine = 'veramo'` (update, deactivate, revoke, suspend, reinstate, verify, export) | `veramo` |
| Existing artefact with an empty `engine` column (legacy row) | `veramo` |
| `featureFlag` row of `credo` for a new artefact | `credo` (same as the default) |
| `featureFlag` row of `veramo` for a new artefact | `credo`, unless the temporary override is on |

**Temporary escape hatch (one release).** Removing the Veramo option entirely could strand a customer whose Credo
tenant, payer key or database is not provisioned yet, so it is kept as an explicit, logged, off-by-default override. It
needs both:

1. the environment variable `VERAMO_NEW_ARTEFACT_OVERRIDE=true` on the instances, and
2. a `featureFlag` engine row of `veramo` for the customer and route (`PUT /admin/flags`).

Each new artefact the override sends to Veramo writes a `veramo-new-artefact-override` warning (route family and
customer id) to the log. Without the variable a `veramo` row is stored but ignored; `PUT /admin/flags` answers with a
`warning` saying so, and `GET /flags` shows `credo`. The override never moves an existing artefact. Remove the variable,
`src/services/identity/engine/new-artefact-policy.ts` and the `veramo` option from `validateFlagWrite` after the release.

**Still created on Veramo, not through the router** (listed so none is missed; each needs a Credo-side decision first,
see `docs/veramo-retirement.md`): the customer's payment-account key (Secp256k1) made in `customer.ts` and the account
bootstrap; the Dock hand-off DID import (`dock/identity.ts`); and the holder wallet copy of an issued credential
(`saveCredential`, `received-credentials`), which writes to Veramo's data store.

## Routes

"Wired" means the engine-type call goes through the router. The Veramo engine delegates every call unchanged to the
existing service, so wiring changes no request, response or status code.

| Route | Family | Artifact reference | Wired |
|---|---|---|---|
| `POST /key/create` | `key` | none (new, `creates`): Credo; `keyType` hint, so P-256 / `Secp256r1` / `JsonWebKey` always go to Credo | Yes |
| `POST /key/import` | `key` | none (new); `keyType` hint | Yes |
| `GET /key/read/:kid` | `key` | none (keys have no artifact kind; the `key` table is shared by both engines) | Yes |
| `GET /key/:kid/verification-method` | `key` | none, as above | Yes |
| `POST /did/create` (key creation inside) | `key` | none, `keyType: Ed25519` | Yes |
| `POST /did/create` (DID creation) | `did` | none (new) | Yes (already) |
| `POST /did/update` | `did` | `did` | Yes (already) |
| `POST /did/deactivate/:did` | `did` | `did` | Yes (already) |
| `POST /did/import` | `did` | none (new to Studio) | Yes |
| `GET /did/list` | `did` | none | Yes |
| `POST /did/export/:did` | `did` | `did` | Yes |
| `POST /account/export-keys` (DID export) | `did` | `did` | Yes |
| `POST /providers/:providerId/did/import` (Dock hand-off export, in `dock/identity.ts`) | `did` | `did` | Yes |
| `POST /resource/create/:did` | `resource` | `did` (the DID owning the resource) | Yes |
| `GET /resource/list` | `resource` | `did` when the `did` filter is given, else none | Yes |
| `POST /credential/issue` | `credential` | `did` (the issuer DID): its recorded engine signs; an issuer Studio has no record of is a new artefact (Credo) | Yes |
| `POST /credentials/issued/:id/re-issue`, accreditation issue | `credential` | none (new) | Yes (already, through `issue_credential`) |
| `POST /credential/verify` | `credential` | none | Yes |
| Issued-credential status sync (`syncStatusFromProvider`, run when issued credentials are read) | `status-list` | `credential` | Yes |
| Issued-credential fetch from the provider (`fetchCredentialFromProvider`) | `credential` | `credential` | Yes |
| `POST /credentials/offers/:credentialId/accept` (verify) | `credential` | none | Yes |
| `POST /credentials/import` (verify) | `credential` | none | Yes |
| Received-credential holder DIDs (`getHolderDids`) | `did` | none | Yes |
| Received-credential presentation (`createPresentation` helper) | `presentation` | none | Yes |
| `POST /presentation/create` | `presentation` | none | Yes |
| `POST /presentation/verify` (verify, status-list fee setup, fee payment) | `presentation` | none | Yes |
| `POST /credential-status/create/unencrypted` (create, broadcast) | `status-list` | none (new) | Yes |
| `POST /credential-status/create/encrypted` | `status-list` | none; `encryptedStatusList` hint, so `410 Gone` | Yes (intentional behaviour change, see below) |
| `POST /credential-status/update/unencrypted` | `status-list` | `statusRegistry` found by DID and list name | Yes |
| `POST /credential-status/update/encrypted` | `status-list` | `statusRegistry` found by DID and list name | Yes |
| `POST /credential-status/check` (search, fee payment, check) | `status-list` | `statusRegistry` found by DID and list name | Yes |
| `GET /credential-status/search` | `status-list` | `statusRegistry` found by DID and list name | Yes |
| `POST /credential/revoke` | `status-list` | `statusRegistry` found from the credential's issuer and status entry | Yes |
| `POST /credential/suspend` | `status-list` | as above | Yes |
| `POST /credential/reinstate` | `status-list` | as above | Yes |
| `POST /trust-registry/accreditation/verify` | `credential` | none; the engine walks the whole chain (`verifyAccreditation`). The Veramo service is the customer-less one it always used (no payment account needed); the customer id only informs the engine choice | Yes |
| `GET /trust-registry/accreditation/list` | `resource` | `did` when the `did` filter is given, else none (`findLatestResourcesVersionsByType`, then `resolve` on the same engine) | Yes |
| `POST /trust-registry/accreditation/revoke` | `status-list` | `statusRegistry` found from the accreditation | Yes |
| `POST /trust-registry/accreditation/suspend` | `status-list` | as above | Yes |
| `POST /trust-registry/accreditation/reinstate` | `status-list` | as above | Yes |
| `POST /agents*` | `agent` | none; Credo only | Yes (already) |

## Deliberately not wired

| Call site | Why |
|---|---|
| `resolveDid` and `resolve` (`GET /did/search/:did`, `GET /resource/search/:did`, and the resolves inside DID update, deactivate, resource create, credential issue, accreditation) | The spec's `resolve` family has no entry in `ENGINE_ROUTES`, so no feature flag can exist for it and the router has nothing to decide. Both engines read the same ledger through the same resolver. Add the family to the router first (with shadow reads), then wire these. |
| The DID and DID URL resolves inside accreditation issue, revoke, suspend and reinstate | As for the other resolves above: no `resolve` family yet. They run on the Veramo service on every engine, which reads the same ledger. |
| `saveCredential`, `retrieveCredential`, `deleteCredential` (received-credentials, issue to a known subject DID) | They address Veramo's own data store by credential hash. No table records which engine holds a hash, so there is no artifact to route on, and routing by flag would lose credentials the day a flag flips. They need an `engine` column (wallet family) first. |
| Payment-account key creation (`customer.ts` create, `account.ts` bootstrap) | These create the customer's Secp256k1 payer key, not a key-family API route. `customer.ts` also builds the strategy with the customer name rather than the id (the same kind of bug as the providers controller), so the router would be handed the wrong identity. Leave on Veramo until that is fixed and the payer key policy for Credo is decided. |
| API keys, operations and payment-account export (`setAPIKey`, `getAPIKey`, `listOperations`, `exportPaymentAccountKeys`) | Studio concerns, deliberately outside `IdentityEngine` (`StudioAccountServices`). |
| `POST /providers/:providerId/did/import` in `providers.controller.ts` | It builds `IdentityServiceStrategySetup` with the whole customer entity instead of the customer id (existing bug). Routing it would put an object in the routing log and flag lookup. Fix the argument first, then wire. |
| Credo method bodies (`CredoEngine` throws `NotImplementedByEngine` for credentials and status lists) | Other agents are building them. Nothing here changes `credo/`. |

## Differences between the routed and the direct path

- **Encrypted status-list creation now answers 410.** The router has always thrown `Gone` for it; wiring it means
  `POST /credential-status/create/encrypted` returns `410` with `{ created: false, error }` on Veramo too, before the DID
  is looked up. This is plan gate G6 and was asked for explicitly. It is the one intended behaviour change.
- **`POST /key/create?type=Secp256r1` (and `P-256`, `JsonWebKey`) now goes to Credo.** Veramo used to create the key.
  If the Credo runtime is not configured the call fails with the engine's error (500 `Internal error: ...`).
- **Key response shape.** Veramo returns the saved `key` row (`customer` on create and import, `updatedAt: null`,
  `publicKeyAlias: null`, `meta.algorithms`). Credo's store returns a narrower record. `shapeKeyResponse` fills the
  missing fields in for non-Veramo engines so an Ed25519 key looks identical; a Veramo key is returned untouched. The
  better long-term fix is for the Credo store to write `meta` and return the row, after which the shaper can go.
- **Status operations look up the status list first.** One extra read of `statusRegistry` per request (only with
  `ENABLE_EXTERNAL_DB=true`), to find the artifact. Failure of that read is swallowed and means "Veramo".
- **An existing artifact with no recorded row** is treated as new only where the call site says so
  (`flagWhenUnrecorded`: the issuer DID of a credential), and then goes to Credo. A status list with no `statusRegistry`
  row is looked up as existing and falls back to `veramo`, as before.

## Recording the engine on new artefacts

An existing artefact always uses the engine recorded on it, so the recorded value must be the engine that really
created the artefact. Every creation site records it:

| Artefact | Where the engine is set |
|---|---|
| `statusRegistry` (Studio API, both create routes) | `CredentialStatusService`, from the engine the router chose for the create |
| `statusRegistry` (token status lists) and agent grants | `agent-store.ts`, `credo` |
| `issuedCredential` (issue API) | `Credentials.issue_credential`: the engine decided once before the row is made (Dock rows keep the default) |
| `issuedCredential` (agent grants and credentials) | `agent-store.ts`, `credo` |
| `identifier` | the Credo store sets `credo`; Veramo-created DIDs take the column default |
| `key`, `resource`, presentations, accreditations, agent rows | no `engine` column. Accreditations are `issuedCredential` rows with `category = accreditation` and follow that row |

A list or credential created through Credo used to be stored as `veramo` (the column default), so revoke, suspend and
reinstate went to Veramo, which did nothing.

## Status updates that change nothing

`/credential/revoke`, `/credential/suspend`, `/credential/reinstate` and the accreditation equivalents no longer answer
200 when nothing was updated (`src/services/api/status-update-outcome.ts`).

A change that would do nothing answers **409** on both engines, with `error` and a stable `code`:

| `code` | When |
|---|---|
| `already_revoked` | revoke of a revoked credential |
| `already_suspended` | suspend of a suspended credential |
| `not_suspended` | reinstate of a credential that is not suspended |
| `credential_revoked` | suspend or reinstate of a revoked credential (Bitstring lists; revocation cannot be undone) |

Before the change is sent to the engine, `statusUpdateConflict` reads the credential's current status through the same
engine (`checkBitstringStatusList`, or `checkStatusList2021` on the list for the action's purpose). Neither engine
reports every no-op itself: the Veramo plugin answers `{ revoked: true }` for a StatusList2021 credential that was
already revoked, and on a Bitstring list both engines would move a revoked credential back to valid or suspended. When
the status cannot be read (undecodable credential, no status entry, an encrypted list, a failing read) the update runs
and its own result decides. A no-op the engine reports itself (a race after the read) is also 409 with the same code.

A genuine failure is not 409:

- 400 when the engine reported an error (its message is returned);
- 500 otherwise (`updated: false` with no error, for example a list recorded against the wrong engine).

A bulk call that updated at least one entry stays 200 and carries the per-entry results.

## Extra signers and cross-account offers on Credo DIDs

- **Extra signers.** `publicKeyHexs` on `POST /did/update`, `POST /did/deactivate/:did` and
  `POST /resource/create/:did` names extra keys to sign with (for a DID controlled by several DIDs). The Credo engine
  signs with the DID's own authentication keys only, so a key in `publicKeyHexs` that is not one of them is refused
  with **400** `extra_signers_not_supported` ("Extra signers (publicKeyHexs) are not supported for this identifier
  yet") before anything is written. Keys that are the DID's own authentication keys, and an empty list, are accepted.
  Veramo DIDs are unchanged.
- **Offers to another account's Credo DID.** Issuing to a DID that Studio holds makes an offer. The subject check
  (`didExists`) on Credo only sees the issuer's own DIDs, so an offer to a Credo DID of another account used to be
  dropped and the credential recorded as `issued`. `POST /credential/issue` now refuses that case with **501**
  `NotSupported` before a status index is reserved or anything is signed (`assertSubjectCanBeOffered` in
  `src/services/api/credentials.ts`). The issuer's own Credo DIDs, Veramo DIDs, DIDs Studio has no record of and
  non-cheqd DIDs behave as before.

**Follow-up (not built yet):** pass extra signers through to the Credo registrar. For each key in `publicKeyHexs`
that is not the DID's own, find the key in the customer's Credo tenant (the same lookup `assertPublicKeysOwned`
does), add it to the `keys` links handed to `session.updateDid`, `session.deactivateDid` and
`session.createResource` with the verification method id of the controller DID it signs for, and drop the 400. Then
decide how a cross-account offer to a Credo DID is stored (the holder's Credo wallet, not Veramo's data store) and
drop the 501.

## Correcting rows recorded wrongly (migration 1791702000000)

A Credo list or credential is signed inside the customer's Credo tenant, so it can only sit under a DID whose
`identifier.engine` is `credo`; Veramo cannot sign for that DID. The migration sets `engine = 'credo'` only on rows that
say `veramo`, whose issuer DID is `credo`, and for which no `engineMigration` row mentions the DID or list (a DID that
moved engines could legitimately hold older Veramo rows). Issued credentials must also have `providerId = 'studio'`
and a status registry that is `credo` (or none). Each change is copied to `engineCorrection`; `down` restores exactly
those rows and drops the table. Rows that do not meet every condition are left untouched, and nothing is guessed.

## Issued credential ids and status

- `POST /credential/issue` returns the credential itself, which has no Studio id. Studio's record id is the
  `issuedCredentialId` in the `X-Issued-Credential-Id` response header (exposed to browsers through CORS). The portal
  should show and link that value. `GET /credentials/issued/:id` accepts it, and also the credential's own `id` (the
  stored `providerCredentialId`), bare or as `urn:uuid:...`, for the calling customer only. A credential without an `id`
  (Studio sets none) can only be found by the record id.
- After a successful revoke, suspend or reinstate (credential and accreditation routes) the matching issued-credential
  row is updated to `revoked`, `suspended`, or back to `issued` (`offered` if the offer was never accepted). Before, only
  `GET /credentials/issued/:id?syncStatus=true` refreshed a status, so the list kept the status the row was issued with.
  Rows are matched on customer, issuer, status index and the status entry id; a status change made outside Studio's API
  is still picked up only by `syncStatus=true`.

## Ledger writes and the payer lock

Every ledger write, from either engine, runs inside `withPayerLock` keyed by the customer's payer address, so a
Veramo write and a Credo write from one account cannot pick the same account sequence. The Veramo engine
(`veramo-engine.ts`, `veramo-payer-lock.ts`) locks DID create, update and deactivate, resource create, status-list
create, update and broadcast, fee payment, and published revoke, suspend and reinstate. Reads, key, credential and
presentation signing and unpublished status changes do not write and do not lock. Where the payer cannot be resolved
(no payment account, or a revoke whose credential carries no readable status entry) the write runs unlocked: it either
fails for lack of an account or cannot be tied to a payer. Locks live on their own small pool
(`EXTERNAL_DB_LOCK_POOL_*`), so they cannot exhaust the main pool.
