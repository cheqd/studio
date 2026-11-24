# Veramo retirement: design for migrating existing artefacts to Credo

Status: design only, 15 November 2026. No migration code exists or is proposed to be run from this document. Part 1 of
the same change (new artefacts go to Credo, see `docs/engine-routing.md`) is built; this document covers what is left.

Decision (15 November 2026): Veramo is retired. Existing artefacts may stay on Veramo and keep working; no new artefact
is created on Veramo; if all Veramo functionality can move to Credo, that is the best outcome.

How to read this: "verified" means read in this repository's code on this branch. "Unverified" means inferred, taken
from the knowledge base (`product/studio-credo-migration-plan.md`, `product/studio-without-veramo-plan.md`,
`product/veramo-to-credo-gap-analysis.md`, `product/key-custody-options.md`, `engineering/architecture/*`) or not
exercised. Nothing here was run against a database or a ledger.

## 1. Headline conclusions

1. **Almost everything can move; a few things cannot yet.** DIDs, their keys, resources, JWT and JSON-LD credentials
   issued under those DIDs, StatusList2021 and Bitstring status lists (unencrypted), presentations, and accreditation
   verification can all be served by Credo. Cannot move today: **encrypted (Lit) status lists** and anything that needs
   `updateEncryptedStatusList`; **secp256k1 DID keys** (none expected); the **holder-wallet copy of stored
   credentials** until it is re-keyed; **Dock hand-off import** and the **customer payment-account key** creation
   (still direct Veramo calls). See section 9.
2. **Private keys do not move.** The Credo engine signs through `VeramoKeyManagementStorage`, which reads Veramo's own
   `private-key` rows with the same SecretBox key (`credo-runtime.ts`: `enableKms: false`, keys "in Studio's key store
   ... not in Askar"; `VeramoKeyManagementStorage.ts`). A Veramo key is therefore already usable by Credo. Key custody
   does not change, and that removes the largest risk from the usual "import keys into a new wallet" plan. Verified in
   code; unverified end to end for a Veramo-created key signing a ledger write through Credo.
3. **A migration is an engine flip plus one Credo record per DID, not a data copy.** What Credo needs that a Veramo DID
   lacks is a `DidRecord` in the customer's tenant (verified: `updateDid`, `deactivateDid`, `createResource` and JSON-LD
   signing all call `recordedKeyIds(did)` and refuse with an ownership or not-supported error when it is `null`).
   `CredoEngine.importDid`, `importKey` and `exportDid` are not built: they throw `NotImplementedByEngine` (verified).
   That import is the one piece of new code, and it is a local write (no ledger fee).
4. **The population is small** if the 21 October 2026 analysis (action A-017, quoted in the migration plan, unverified
   now) still holds: 23 mainnet DIDs, 15 resources and 2 `StatusList2021Revocation` lists from effectively one
   customer, 231 testnet status lists across a handful of customers, 10 customers active in 90 days. The inventory
   queries in section 11 replace those figures with current ones.
5. **Rollback is cheap for DIDs, lists and credentials** because the engine column is the only switch and the ledger
   is the source of truth. It is not free for stored credentials, whose hash scheme differs between engines.
6. **Sizing (rough):** about 3 weeks of build and rehearsal for DIDs, resources, status lists and issued credentials
   (phases 1 to 4), plus an open-ended tail for encrypted lists, stored credentials and the unrouted Veramo writes
   (phases 5 and 6). Section 12.

## 2. What the system does today (verified)

- Router: `src/services/identity/engine/engine-router.ts`. Existing artefact: the recorded `engine` column wins.
  New artefact: Credo (Part 1). Fail closed (503) on a lookup failure or an unknown recorded value.
- Engine column exists on `identifier`, `statusRegistry` and `issuedCredential` (all `NOT NULL DEFAULT 'veramo'`), on
  `operation`, and in the evidence tables `engineMigration` (entity types `did`, `statusList`, `resource` only: a
  CHECK constraint) and `engineCorrection` (created by migration 1791702000000, `entityType`/`entityId`/
  `previousEngine`, primary key on the first two).
- Migration 1791702000000 is the pattern to copy for reversible engine changes: copy the old value to
  `engineCorrection` in the same transaction, change only rows that meet every provable condition, `down` restores
  exactly those rows. Migration 1791702100000 is **not** an engine correction: it adds `identifier.kind` and
  `agentDeletedAt` and backfills them from `agent`; it only shows the expand-only, `lock_timeout = '3s'`, reversible
  style.
- Credo tenant: one per customer (`customer.credoTenantId`, unique), created on first use under an advisory lock
  (`credo-tenant:<customerId>`). Askar holds records only (`DidRecord`, stored credentials), not keys.
- Ledger writes from both engines hold `withPayerLock` keyed on the payer address (`ledger-lock.ts`, a session-level
  advisory lock plus a transaction lock), so a Veramo and a Credo write for one account cannot pick the same account
  sequence.
- The existing byte-equality test (`tests/integration/status-list-byte-equality.test.ts`, gate T4) runs the real
  Veramo plugin and the real `CredoStatusLists` on the same inputs (testnet fixtures plus random lists) and compares
  the payloads that would be put on the ledger. It is an integration test, not part of `tests/unit` or the contract
  suite, and was not run for this document.

## 3. The unit of migration

Do not flip artefacts independently. Migrating one **DID together with everything issued under it** keeps the invariant
that migration 1791702000000 relies on: a status list or credential on `credo` sits under a DID on `credo`, because
Credo signs inside the tenant for DIDs it holds a record for, and Veramo cannot sign for a Credo DID (and a Credo DID
should never be left with a Veramo list). The unit is:

```text
DID  +  its keys (no change)  +  its resources (no change: ledger)  +  its status lists  +  credentials issued by it
```

All engine columns of one unit flip in one transaction, while holding the customer's payer lock and the per-DID lock,
with an `engineMigration` row per DID and list and a snapshot of previous values in a new correction table (section 7).

## 4. Per artefact type

Each block answers: Credo today; what moves; ledger write; online per customer; verify before and after; rollback;
risks; cannot migrate.

### 4.1 DIDs and their keys (Veramo key store, `key`, `private-key`)

- **Credo today (verified):** creates, updates, deactivates, lists, resolves DIDs; creates Ed25519, P-256, secp256k1
  and X25519 keys; P-256 keys always go to Credo. Does not implement `importDid`, `importKey`, `exportDid`.
  Secp256k1 cannot sign `did:cheqd` operations (KB; unverified here).
- **What moves:** (a) the key rows stay where they are: `key` (Studio's subclass with `customerId`) and `private-key`
  (SecretBox-encrypted by `EXTERNAL_DB_ENCRYPTION_KEY`). Credo reads them by `kid`. No Askar import is needed. (b) A
  Credo `DidRecord` per DID in the customer's tenant, built from the current resolved document with `kmsKeyId` =
  the key's `kid` for each authentication method (Credo's `dids.import`, which the KB records as already working in
  credo-ts#44; Studio's wrapper is the new code). (c) `identifier.engine` flips to `credo`.
- **Ledger write:** none for the flip. A no-op `updateDid` is a ledger write and costs fees; use it only as a testnet
  rehearsal, never on mainnet "just to test" (KB, phase 3).
- **Online per customer:** yes. No downtime; the unit is locked for the flip (section 8).
- **Verify before:** every authentication `publicKeyHex` of the resolved document maps to a `key` row with this
  customer's `customerId` (the engine's own `findOwnedKey` check); the key's `private-key` row decrypts; key type is
  Ed25519 or P-256; the DID is not deactivated; the Credo resolve equals the Veramo resolve (hash of the document,
  recorded as `verified-read` in `engineMigration`). **After:** resolve again; sign a throwaway JWT with the DID's key
  through `signWithDidKey` (no ledger write); on testnet only, a no-op update.
- **Rollback:** set `engine` back to `veramo` from the snapshot; the `DidRecord` left in Askar is harmless. Credo-made
  updates are on the ledger and Veramo reads them. The KB notes that a Credo-created row is "not yet proven
  Veramo-complete" (engine spec 4.2), so rehearse a Credo update followed by a Veramo update on testnet.
- **Risks:** key custody (unchanged: one SecretBox key, two engines read it; do not copy keys anywhere); signing with the
  old key (only if the router sends a flipped DID to Veramo: the flip must be atomic with the lock; stale 5 second flag
  cache is irrelevant because the artefact column, not the flag cache, decides, but the engine decision must not be
  cached anywhere: verify); DID documents whose verification method types Credo rewrites on an update (unverified:
  Veramo cheqd DIDs may carry `Ed25519VerificationKey2018`, `2020` or `JsonWebKey2020`; Credo's JSON-LD mapping covers
  2018, 2020, Multikey and JsonWebKey); double writes (the flip must hold the payer lock); a DID with a secp256k1-only
  controller (expect none; query in section 11).
- **Cannot migrate:** a DID whose only signing key is secp256k1 (stays on Veramo until its owner adds an Ed25519 key
  with a last Veramo update, or the DID is abandoned); a DID with no `key` row for a verification method (an imported
  DID where the customer holds no key: it can be read but not updated by either engine).

### 4.2 DID documents on the ledger

- **Credo today:** reads through the resolver (`resolveDid`, `resolve`); writes only for DIDs it holds a record for.
- **What moves:** nothing. The ledger is the source of truth (tenancy doc rule 1).
- **Ledger write:** none. **Online:** yes. **Verify:** resolve through both engines and compare the document hash
  (the read-only mainnet replay, gate T5). **Rollback:** not applicable. **Risk:** the resolve path is deliberately not
  routed (`docs/engine-routing.md`, "Deliberately not wired"): both engines read the same resolver, so there is no
  engine-specific resolve to migrate.
- **Cannot migrate:** nothing.

### 4.3 Resources (DID-Linked Resources)

- **Credo today (verified):** `createResource`, `listResources` (reads Studio's `resource` table), accreditation lookup.
  Creating one needs a tenant `DidRecord` for the DID (so after 4.1).
- **What moves:** nothing in `resource` (no engine column; it follows the DID). Resource rows keep `identifierDid` and
  `kid`.
- **Ledger write:** none. **Online:** yes, with the DID. **Verify:** resource count and `resourceId` set equal before
  and after; resolve each resource URL and compare the bytes. **Rollback:** with the DID.
- **Risks:** the `resource` table has `encrypted` and `symmetricKey` columns: encrypted resources (the status lists in
  4.5 below, and any other encrypted resource) cannot be read by Credo without Lit. Resource creation is not
  idempotent by default (see section 8).
- **Cannot migrate:** encrypted resources whose `symmetricKey` is empty (data-model finding DM-F4: current code may
  have stored `''`); they are unreadable without Lit by either route.

### 4.4 Issued and stored credentials, and received credentials

- **Credo today (verified):** issues `jwt` (ES256 or EdDSA) and `jsonld` (Ed25519 Data Integrity suites; P-256 as
  `JsonWebSignature2020`); verifies both; `sd-jwt-vc` is issued only by the agent endpoints; `anoncreds` is not
  supported. JSON-LD signing works only for a DID that has a tenant `DidRecord`: so only after 4.1 for a Veramo DID.
  Verification: the KB records that historic JSON-LD credentials with terms that no `@context` defines fail in Credo's
  strict mode, and that Credo's own `verifyCredential` fails Veramo JWT credentials unless status checking is done in a
  second step (`product/studio-without-veramo-plan.md`, findings 1 and 2); both were resolved in the fork
  (credo-ts#40, and the two-step wrapper), unverified in this repository.
- **What moves:**
  - **`issuedCredential`** (the Studio index and the credential JSON): no data change. `engine` flips with the issuer
    DID, and with its `statusRegistry` (rule from migration 1791702000000: `providerId = 'studio'` only; Dock and other
    providers never flip).
  - **Veramo's data store** (`credential`, `claim`, `presentation`, `message` and joins, linked from
    `issuedCredential.veramoHash`): this is the holder wallet. Credo's `saveCredential` stores in the tenant's Askar
    under `sha256(jwt or stable JSON)`, which is **not necessarily Veramo's hash** (unverified: Veramo's hash function
    was not read). So a re-key is needed: read each Veramo credential, store it through Credo, update
    `issuedCredential.veramoHash`, then drop the foreign key to Veramo's `credential` table.
  - **Received credentials**: same store, same re-key; `received-credentials.ts` joins `veramoHash` to Veramo's
    `credential` table directly (verified) and uses hash-keyed calls that "stay on the Veramo service".
- **Ledger write:** none. **Online:** issued index yes (with the DID); the wallet re-key is online per customer
  but changes read paths, so do it behind a read-both, write-new switch.
- **Verify before/after:** per credential, verify it through both engines and compare the verdict (shadow compare,
  `engineDiff`), including status; counts of `issuedCredential` per customer, status and engine equal before and after;
  for the wallet, `retrieveCredential(newHash)` equals `retrieveCredential(oldHash)` byte for byte.
- **Rollback:** engine flips from the snapshot; wallet re-key is reversible only if the Veramo rows are kept until the
  hold period ends (do not delete them in the same step).
- **Risks:** historic JSON-LD credentials with undefined terms (the KB counts none; decision needed, section 13);
  hash change breaking `veramoHash` joins; credentials in formats Credo cannot verify.
- **Cannot migrate:** `anoncreds` (not supported); Dock-provider credentials (not Studio's engine at all);
  JSON-LD credentials that fail strict verification unless the lenient check is kept.

### 4.5 Status lists

Formats in play: `StatusList2021Revocation`, `StatusList2021Suspension`, `BitstringStatusListCredential` (2-bit
Veramo lists with messages issued/revoked/suspended/unknown), encrypted variants of each (Lit), and Token Status Lists
(Credo only, already `credo`).

- **Credo today (verified):** creates and updates unencrypted StatusList2021 and Bitstring lists in the legacy form;
  reads, searches, checks, revokes, suspends and reinstates; reuses `statusRegistry.encoding` and `listFormat` to
  reproduce the exact legacy encoding (`base64url` without prefix, or `hex`).
- **Byte-identical writes (verified from code, not re-run):** `status-list-codec.ts` encodes with gzip from `pako` 2.1
  (pinned in `package.json`), then base64url with no multibase prefix, deliberately not Credo's own pako 3 encoder,
  because the two decode to the same bits but produce different strings for any list with entries set (measured in the
  code comment: a 140,000 entry list with 2,500 set is 4,532 characters from pako 2.1 and 4,406 from pako 3). The
  integration test above compares full ledger payloads for testnet fixtures and random lists. Constants copied from the
  plugin: minimum length 131072, Bitstring size 2, the four `0x0`..`0x3` messages, `credentials/v1` context.
  Consequence: the next version of an old list is the same bytes whichever engine writes it, so verifiers see no
  change. This is gate T4 and is the evidence that status lists can move without a format notice.
- **What moves:** `statusRegistry.engine` (with its issuer DID). No change to `writeCursor`, `version`, `state`,
  `registrySize`, `metadata`, `listFormat`, `encoding`, `uri`/`prev_uri`/`next_uri`. The status index for the next
  credential comes from `writeCursor` plus the additional used indexes in `metadata`; Credo reads the same row, so
  **index continuity holds as long as nothing issues during the flip** (hold the lock, section 8).
- **Ledger write:** none for the flip. Credo's next update writes a new version as Veramo's would.
- **Online per customer:** yes, with the DID's unit. Note that a list update is a read-modify-write of the whole list:
  two engines updating one list concurrently would lose a revocation (see section 8).
- **Verify before:** for each list, fetch the latest version from the ledger, run Credo's encoder over the decoded bits
  and compare the string with the ledger's `encodedList` (an idempotent re-encode must reproduce it exactly: this is
  the strongest cheap check and needs no write); compare `writeCursor` against the highest set index; compare counts of
  revoked and suspended bits with `issuedCredential` rows in those states. **After:** one revoke-then-reinstate on a
  testnet test list per customer shape, then the same checks; on mainnet only reads.
- **Rollback:** flip the list and DID back; any new version Credo wrote is already valid for Veramo (the T3 half "Veramo
  can read what Credo wrote"). Writes by Veramo onto a Credo-written version are unverified.
- **Risks:** index continuity (above); a list whose legacy encoding differs from the two known (the `encoding` column
  is NULL on old rows: the Credo code falls back to `base64url` unless `metadata.encoding` says `hex`, so rows with
  neither must be checked individually); the bit order of multi-bit Bitstring values (least significant bit first; the
  KB records Credo had it the other way until credo-ts#39); lists hosted outside `did:cheqd` (decision D20 accepts
  them on the Credo path; the engine refuses non-owned issuers).
- **Cannot migrate:** **encrypted lists.** Creation answers 410 on both engines (decision D2); Credo's
  `updateEncryptedStatusList` throws `EncryptedStatusListNotSupportedError`; there is no Lit in Credo. A Veramo
  encrypted list can still be updated through the Veramo engine if the Lit network is reachable and the `resource`
  `symmetricKey` is present (DM-F4 says it may be `''`). They can be read and checked with the stored key (KB phase 3,
  step 3) but not updated. Options: leave on Veramo until their credentials expire; or re-issue the credentials under
  a new unencrypted list and retire the old list (needs the customer). Count them first (query 11.5).

### 4.6 Presentations

- **Credo today (verified):** creates and verifies JWT and JSON-LD presentations (challenge required on verify).
- **What moves:** nothing is stored by Studio for a created presentation; Veramo's `presentation` and `message` tables
  hold only what the data store saved (unverified usage; the count is in section 11). Routing for create is unscoped
  today (no holder DID artefact): it follows the flag else Veramo. **Required change before flips:** route
  presentation creation by the holder DID's recorded engine, otherwise a flipped holder DID is signed by the wrong
  engine and an unflipped one by Credo (Credo refuses a DID it holds no record for).
- **Ledger write:** none. **Online:** yes. **Verify:** create the same presentation on both engines for a test holder
  and verify each on the other (the cross-test matrix in credo-ts#41 passes both ways, per the KB). **Rollback:** the
  routing change. **Risk:** the holder-binding rule in Credo (`PresentationBindingRequiredError`) is stricter than
  Veramo's; response shape differences (section 6). **Cannot migrate:** nothing.

### 4.7 Accreditation and trust-registry flows

- **Credo today (verified):** `verifyAccreditation` walks the trust chain (`credo/accreditation.ts`); accreditation
  issue, revoke, suspend and reinstate are `issuedCredential` rows with `category = 'accreditation'` and follow the
  credential and its status list; the DID, DID URL and resource resolves inside them are not routed.
- **What moves:** nothing new. Accreditations flip as credentials of their issuer DID (4.4) and their lists (4.5). A
  chain crosses issuers: `verifyAccreditation` works whichever engine each link is on, because it verifies from the
  ledger; only issue, revoke, suspend and reinstate need the right engine for the **issuer** of that link.
- **Risk:** accreditations created with encrypted lists cannot be updated after the DID flips; they stay on Veramo
  with the list (the KB flags this). **Verify:** run `verifyAccreditation` for each accreditation under both engines and
  compare outcomes (status, accreditor DIDs, root). **Rollback:** with the credential. **Cannot migrate:** accreditation
  credentials whose list is encrypted.

## 5. Response shapes and API surface

- Key responses: `shapeKeyResponse` already makes a Credo-created Ed25519 key look like a Veramo row (`customer`,
  `updatedAt: null`, `publicKeyAlias: null`, `meta.algorithms`). Unchanged by migration.
- Status operations: `status-update-outcome.ts` maps engine results to 200/400/409/500 for both engines.
- Typed engine errors are mapped to HTTP on every engine-backed controller (recent fix 7617d82).
- Differences the migration must pin with the contract suite (52 tests today) before any customer flips: DID create and
  update body (Veramo returns the `IIdentifier`; the Credo store returns its saved identifier, `saveIdentifier`);
  credential `proof` shape for JWT (`JwtProof2020`) and JSON-LD suites; presentation proof; status-list create/update
  response (`resource`, `resourceMetadata`, `symmetricKey` fields); error text for ownership failures. Whether each
  matches byte for byte is **unverified**: the contract suite exercises Veramo-backed fakes, so add a Credo-backed run
  of the same golden fixtures (gate T1 says "against both engines").
- Not affected: routes for agents (always Credo), API keys, operations, payment accounts.

## 6. What must not be forgotten: places that still write Veramo directly

These bypass the router and so are not covered by Part 1. Each needs a decision before Veramo can be removed:

| Place | What it creates | Proposal |
|---|---|---|
| `services/api/customer.ts`, `controllers/api/account.ts` | the customer's Secp256k1 payment-account key (`agent.createKey`) | Credo's `createKey('Secp256k1')` is supported and writes the same `private-key` layout; the payer resolver reads it by `kid`. Switch after a testnet rehearsal. Size S |
| `services/api/credentials.ts` (`saveCredential`) and `received-credentials.ts` | holder-wallet copy in Veramo's data store | Phase 5 re-key |
| `providers/dock/identity.ts` (`agent.importDid`) | DID imported from Dock | Credo `importDid` once built; or leave the Dock hand-off on Veramo and decide separately |
| `agent` service | none (Credo only) | none |

## 7. Rollback design

Reuse the migration 1791702000000 pattern; do not invent a new one:

1. A new reversible migration adds a snapshot table (call it `engineFlip`, columns `entityType`, `entityId`,
   `previousEngine`, `unitId`, `flippedAt`, same style as `engineCorrection`) and, because `engineMigration`'s CHECK
   allows only `did`, `statusList`, `resource`, extends the CHECK to include `credential` (expand-only). Alternative:
   reuse `engineCorrection` unchanged (its primary key is `(entityType, entityId)`, so it holds one snapshot per
   artefact, which is enough for one flip, not for repeated flips).
2. The flip itself is a **script run by an operator**, not a migration: schema migrations run at deploy time with no
   batching (data-model finding DM-F6), so the data change must not live in the migration list.
3. Per unit, in one transaction: lock; check preconditions (section 8); snapshot previous values; update
   `identifier`, `statusRegistry`, `issuedCredential` engine columns; write `engineMigration` rows (`migrated`).
4. Rollback of a unit: restore from the snapshot (only rows that still read `credo`, as `down` does in 1791702000000),
   set `engineMigration` to `rolled-back`.
5. Record an `adminAuditLog` row per customer for traceability.

## 8. Concurrency, in-flight writes and locking

- **Payer lock.** Hold `withPayerLock(payerAddress)` for the whole flip so no ledger write by either engine is mid-flight
  for that account. Both engines already use it (`ledger-lock.ts`). Verified for write paths in `docs/engine-routing.md`;
  not every Veramo write path is verified to take it.
- **Per-DID serialisation.** Add an advisory lock keyed on the DID (new key name, same helper) taken by the flip and by
  update, deactivate, resource create and list updates, or accept that the payer lock is enough because all of those are
  ledger writes. Status-list updates that do not publish (`publish=false` revocations, changes to `statusRegistry`
  state only) are not ledger writes and do not take the payer lock: they need the DID lock, otherwise a revocation can be
  lost across the flip. Unverified which of those paths exist for each list type.
- **Index continuity.** Issue allocates `writeCursor` in a transaction (Phase 2 of `Credentials.issueWithRecord` reserves
  the index before signing). The flip must run when no reservation is open: check there are no `issuedCredential` rows
  in a transient state for the units being flipped (`status = 'offered'` is not transient; rows with a non-null
  `lastError` and `retryCount` below the limit are candidates; unverified exact predicate).
- **In-flight idempotent writes.** `idempotencyKey` rows in `submitting` or `unknown` mean a ledger write may or may not
  have landed. Do not flip a customer that has any such row (`state IN ('submitting','unknown')`); wait for the
  reconciler or settle by hand. A retry after the flip is routed to Credo; if it were still pending it could write twice.
- **Multi-instance.** The engine column is read per request, not cached (`DbArtifactEngineLookup`); only the flag table
  is cached (5 seconds). So a flip is visible to every instance at commit. The flag cache does not matter for existing
  artefacts. Confirm no other process caches the decision (the router has none).
- **Tenant creation** is already serialised by `credo-tenant:<customerId>`; the flip script must call `ensureTenant`
  first.

## 9. What cannot migrate (summary)

| Item | Why | Option |
|---|---|---|
| Encrypted (Lit) status lists and their updates | No Lit in Credo (decision D2); `updateEncryptedStatusList` unsupported; keys may be empty (DM-F4) | Keep the artefact on Veramo until retired; or re-issue under an unencrypted list; or build Lit support in Credo (not recommended) |
| Encrypted resources with no stored key | unreadable by anyone | none |
| DIDs whose only controller key is secp256k1 | cannot sign `did:cheqd` operations in Credo | add an Ed25519 key with a last Veramo update, or abandon |
| `anoncreds` credentials | not supported by Credo here | none today |
| Dock-provider credentials and DIDs | not Studio engine artefacts | outside this plan |
| Historic JSON-LD credentials with undefined terms | strict verification rejects them; lenient mode exists in the fork (credo-ts#40) but verifies unsigned claims | decision: accept rejection, re-issue, or keep lenient check |
| Veramo's own message/presentation history | no Credo equivalent; not served by any API route found | archive, then drop after the hold |
| Direct Veramo creators in section 6 | not routed | per section 6 |

## 10. Risks specific to this migration

- **Key custody.** One SecretBox key (`EXTERNAL_DB_ENCRYPTION_KEY`) for both engines until the key-management work. Keep it
  escrowed before any flip (KB A-082). Never export keys to move them: A-058 makes export ciphertext-only.
- **Signing with the old key.** Only possible if a flipped DID is routed to Veramo. Add a test that a flipped DID, list
  and credential are routed to Credo with a Veramo-favouring flag and with the override on (Part 1 tests cover this for
  the router, not for a flipped DID's operation end to end).
- **Double writes.** One payer lock and one engine per DID prevent them; the idempotency precondition covers retries.
- **Index continuity and revocation loss** (sections 4.5 and 8).
- **Production changes ordering.** Decision D22 (13 Nov) says nothing reaches `main` until the Credo release; the flips
  are data operations after that release, never before.
- **Operational:** the Credo store key (`CREDO_STORE_KEY`) is a second key at rest; losing it makes Askar records
  unreadable but keys are safe; `DidRecord`s are rebuildable from the ledger and `identifier`, so the flip script must be
  re-runnable per customer.

## 11. Inventory queries (read-only)

All are `SELECT` only. Run on a read replica or in a read-only transaction. Column names verified from the entities and
migrations on this branch except where marked. `ENABLE_EXTERNAL_DB=true` deployments only.

```sql
-- 11.1 DIDs per customer and engine
SELECT i."customerId", i."engine", count(*) AS dids,
       count(*) FILTER (WHERE i."kind" = 'agent') AS agent_dids,
       count(*) FILTER (WHERE split_part(i."did", ':', 3) = 'mainnet') AS mainnet,
       count(*) FILTER (WHERE split_part(i."did", ':', 3) = 'testnet') AS testnet
FROM "identifier" i
GROUP BY i."customerId", i."engine"
ORDER BY i."customerId", i."engine";

-- 11.2 Keys per customer and type; secp256k1 keys are not DID signing keys
SELECT k."customerId", k."type", count(*) AS keys
FROM "key" k
GROUP BY k."customerId", k."type"
ORDER BY k."customerId", k."type";

-- 11.3 Veramo keys with no private-key row, or private-key rows with no key row (orphans must be settled first)
-- The private-key alias is the kid (VeramoKeyManagementStorage). Column name "alias" is from Veramo's PrivateKey entity: UNVERIFIED here.
SELECT 'key without private-key' AS problem, count(*) FROM "key" k
  WHERE NOT EXISTS (SELECT 1 FROM "private-key" p WHERE p."alias" = k."kid")
UNION ALL
SELECT 'private-key without key', count(*) FROM "private-key" p
  WHERE NOT EXISTS (SELECT 1 FROM "key" k WHERE k."kid" = p."alias");

-- 11.4 Resources per customer, with how many are encrypted and how many of those have no stored key
SELECT r."customerId", count(*) AS resources,
       count(*) FILTER (WHERE r."encrypted") AS encrypted,
       count(*) FILTER (WHERE r."encrypted" AND coalesce(r."symmetricKey", '') = '') AS encrypted_without_key
FROM "resource" r
GROUP BY r."customerId"
ORDER BY r."customerId";

-- 11.5 Status lists per customer, engine, type, encryption and state, with the largest write cursor
SELECT s."customerId", s."engine", s."registryType", s."encrypted", s."state", s."deprecated",
       count(*) AS lists, max(s."writeCursor") AS max_cursor,
       count(*) FILTER (WHERE s."encoding" IS NULL AND coalesce(s."metadata"->>'encoding','') = '') AS no_recorded_encoding
FROM "statusRegistry" s
GROUP BY s."customerId", s."engine", s."registryType", s."encrypted", s."state", s."deprecated"
ORDER BY s."customerId", s."engine", s."registryType";

-- 11.6 Issued credentials per customer, engine, provider, format, category and status
SELECT c."customerId", c."engine", c."providerId", c."format", c."category", c."status", count(*) AS credentials
FROM "issuedCredential" c
GROUP BY c."customerId", c."engine", c."providerId", c."format", c."category", c."status"
ORDER BY c."customerId", c."engine", c."providerId", c."format";

-- 11.7 Stored credentials that depend on Veramo's data store (the wallet re-key)
SELECT c."customerId", count(*) AS with_veramo_hash
FROM "issuedCredential" c
WHERE c."veramoHash" IS NOT NULL
GROUP BY c."customerId"
ORDER BY c."customerId";
SELECT 'veramo credential rows' AS what, count(*) FROM "credential";   -- table from @veramo/data-store: columns UNVERIFIED
SELECT 'veramo presentation rows', count(*) FROM "presentation";
SELECT 'veramo message rows', count(*) FROM "message";

-- 11.8 Units that straddle engines (must be zero before and after any flip): a list or credential whose engine differs
-- from its issuer DID's engine. Existing rows made before the 1791702000000 correction may appear here.
SELECT 'status list' AS kind, s."registryId"::text AS id, s."engine" AS own_engine, i."engine" AS did_engine
FROM "statusRegistry" s JOIN "identifier" i ON i."did" = s."issuerId" WHERE s."engine" <> i."engine"
UNION ALL
SELECT 'credential', c."issuedCredentialId"::text, c."engine", i."engine"
FROM "issuedCredential" c JOIN "identifier" i ON i."did" = c."issuerId"
WHERE c."providerId" = 'studio' AND c."engine" <> i."engine";

-- 11.9 Customers with open ledger writes (must be empty for a customer to be flipped)
SELECT k."customerId", k."state", count(*) FROM "idempotencyKey" k
WHERE k."state" IN ('submitting','unknown') GROUP BY k."customerId", k."state";

-- 11.10 Customers and activity, to order the rollout (internal accounts first)
SELECT cu."customerId", cu."credoTenantId" IS NOT NULL AS has_tenant,
       (SELECT count(*) FROM "identifier" i WHERE i."customerId" = cu."customerId" AND i."engine" = 'veramo') AS veramo_dids,
       (SELECT max(o."createdAt") FROM "operation" o WHERE o."customerId" = cu."customerId") AS last_operation
FROM "customer" cu
ORDER BY last_operation DESC NULLS LAST;
```

Unverified in 11.9 and 11.10: the exact column names `idempotencyKey."customerId"` (the entity has a `customer`
relation, so the column is probably `customerId`) and `operation."createdAt"`.

## 12. Phased plan and sizes

Sizes: S under 3 days, M about a week, L more than a week. Each phase ends with evidence recorded in `engineMigration`.

| Phase | Work | Size | Gate |
|---|---|---|---|
| 0 | Run section 11, settle orphans and straddling units (11.3, 11.8). Decide section 13 items 1 to 4 | S | Counts reviewed by the owner |
| 1 | Build `importDid` (Credo `dids.import` from the resolved document, keys by `kid`) and a re-runnable verify-only command that fills `engineMigration` `verified-read` for every DID, resource and list; route presentation create by holder DID; add the Credo-backed contract run | M | Contract suite green on both engines; verify-only on staging synthetic data |
| 2 | Flip script with locks, snapshot table and rollback; rehearse on staging and testnet: flip, issue, revoke, update, flip back, update through Veramo | M | T4 byte equality and the Credo-then-Veramo update proven |
| 3 | Flip testnet customers per unit, internal accounts first, then the rest, watching the first real operation each | M | No unexplained 5xx, `engineDiff` clean for 5 working days |
| 4 | Mainnet units one at a time with `verified-read`, owner email and first-operation watch (KB phase 3: 23 DIDs, 2 lists, from the 21 October figures) | S to M | Per unit |
| 5 | Wallet re-key (stored and received credentials), then drop the Veramo foreign key and the direct `saveCredential` calls; route the section 6 creators to Credo | L | Retrieve parity; 90 day hold |
| 6 | Encrypted lists and the remaining Veramo-only artefacts (decision); then remove the Veramo engine, the override and the `@veramo` imports (about 54 to 57 source files per the KB), swap in Studio-owned entities on the same tables (KB item 8) | L | Zero rows on `veramo`; zero encrypted lists in use |

Total estimate: phases 0 to 4 about 3 weeks of one engineer plus rehearsal time; phases 5 and 6 are weeks and depend
on the decisions below. These are estimates, not measurements.

## 13. Decisions the user must make

1. **Encrypted status lists.** Leave their artefacts on Veramo indefinitely (Veramo then cannot be removed), re-issue
   with customers, or rebuild Lit support in Credo. Recommendation: count first (query 11.5); if few, re-issue.
2. **Historic JSON-LD credentials with undefined terms.** Accept rejection, re-issue, or keep the lenient check
   (credo-ts#40). Recommendation: keep lenient only for historic verification, with the undefined terms reported.
3. **Whether to remove the temporary override** (Part 1) after one release, or keep it until phase 6. Recommendation:
   remove after one release.
4. **Customer payment-account key creation and the Dock hand-off:** move to Credo (section 6) or leave on Veramo.
   Recommendation: move the payer key; decide Dock with the Dock owner.
5. **Timing against D22:** flips are data operations after the Credo release. Confirm that no flip happens before it.
6. **Mainnet owner approval** for each unit (email first, then flip): confirm the contact and the 24 hour window.
7. **Wallet history:** how long to hold Veramo's data store rows after the re-key (the plan uses 90 days).
8. **Whether Veramo must stay as a read-only fallback** after phase 4 for rollback, and for how long.

## 14. Unverified, in one place

Veramo hash function for stored credentials; key-signing path end to end for a Veramo-created key through Credo;
`IIdentifier` versus Credo-store response parity; the contract suite on a Credo-backed run; whether every Veramo write
path takes the payer lock; status-list update paths that skip the lock; the open-reservation predicate for index
continuity; `private-key` column names; column names in 11.9 and 11.10; whether any DID has a secp256k1-only controller;
verification-method type rewriting on a Credo update; Veramo writing onto a Credo-written list version; all counts quoted
from the 21 October 2026 analysis; and the byte-equality integration test, which was not re-run for this document.
