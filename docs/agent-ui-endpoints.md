# Agent UI endpoints

What the agents area of the portal needs from Studio, on top of the existing `/agents` routes. Every route is
customer-scoped: an agent (or grant) that is not yours answers 404 with exactly the body of an unknown one. Every
write honours `Idempotency-Key`. Errors use the existing agent envelope (`{ error, code }`), including request validation failures: a 400 from the
validators is `{ error, code: 'invalid_request' }` (the OpenAPI schema is `AgentInvalidRequest`). The OpenAPI source is
`src/controllers/api/agent.ts` (built into `src/static/swagger-api.json`); the route inventory is
`tests/contract/inventory/routes.json`.

## Scopes

No new Logto scope is needed.

| Route | Scope |
|---|---|
| `GET /agents/{id}/keys`, `GET /agents/{id}/activity` | `read:agent` |
| `POST /agents/{id}/keys`, `POST /agents/{id}/keys/rotate` | `update:agent` |
| `PATCH /agents/{id}/authority/{grantId}` | `issue:agent-authority` (it issues a credential) |

## Changed responses

- `GET /agents`: optional `q` (at most 200 characters), a case-insensitive "contains" match on name, description or
  DID, applied in the database query so `total` is the filtered count and paging works on the filtered set. Each item
  gains `capabilities` and `authoritySummary`.
- `GET /agents/{id}`: gains `capabilities`, `authoritySummary` and `cardUrl` (the newest published card as a
  DID-Linked Resource URL on the configured resolver, or `null`).
- `authoritySummary` is `{ actsFor, grantCounts: { actsFor, mandate, delegation, toolScope } }`, over grants whose
  `status` is `active` only: not revoked, not expired, and the agent not suspended (a suspended agent's counts are all
  zero, as in the portal). `actsFor` is the DID the newest active acts-for grant was issued by, else `null`.
- `GET /agents/{id}/authority`: each grant gains `summary` (below) and `status` may now be `suspended`, which is
  shown while the agent is suspended (a Studio view; the credential and its status list entry are unchanged).
- `POST /agents` and `PATCH /agents/{id}` accept `capabilities`, an object with any of `a2a`, `ap2`, `kyaOs`, `mcp`
  as booleans. Unknown names and non-booleans are a 400. Missing flags keep their value (`false` on register).
  They are labels the owner chose; nothing enforces them.
- `POST /agents` accepts `useCase` (at most 64 characters). It is stored for analytics, never trusted and never
  returned.

## One grant shape

Every authority route returns the same grant object: `id`, `agentId`, `grantType`, `status`, `summary`,
`issuedCredentialId`, `statusListId`, `statusIndex`, `expiresAt`, `revokedAt`, `createdAt`. `POST /agents/{id}/authority`
answers `201 { grant, credential }`, `PATCH /agents/{id}/authority/{grantId}` answers `200 { grant, credential }`, and
`DELETE /agents/{id}/authority/{grantId}` answers `200` with the grant object itself (unwrapped, as before) now carrying
`status` (`revoked`) and `summary`. On these write routes `status` is `active`, `expired` or `revoked`: a suspended
agent cannot be granted to or changed, and a revoked grant is `revoked` whatever the agent's state. `suspended`
appears only on `GET /agents/{id}/authority`. `GET .../authority` rows carry `status` and `summary` and omit the
credential-handle fields, as before.

## Grant summary

`summariseGrant` (`src/services/agent/grant-summary.ts`) is one pure function, so the portal never builds the text.
Examples: `Up to 50 USD per week, supplies`, `Acts for did:cheqd:testnet:...`, `Tools: search, fetch`,
`Delegation (KYA-OS), depth 1`. Mandate amounts are AP2 minor units shown as major units. Caller-supplied names have
control characters removed and are length-bounded. It reads the policy Studio keeps, never a credential. Older
grants made before Studio kept their claims get a plain label (`Tool scope`, `Payment mandate`).

## Keys

`GET /agents/{id}/keys` reads the agent's DID document, which is the source of truth. A key is `active` when it is
listed under `authentication` or `assertionMethod`, `rotated` when it is still in `verificationMethod` but no longer
listed, and `revoked` for every key of a deactivated DID. `keyId` is the full DID URL of the verification method.
`createdAt` and `rotatedAt` come from the agent's key events (the two keys made at registration use the agent's
creation time). `usedBy` is derived for active keys: `did` (in `authentication`), `a2a` (in `assertionMethod`),
`ap2` (the P-256 key; mandates are bound to it) and `kya-os` (the Ed25519 key). Public material only.

`POST /agents/{id}/keys/rotate` takes `{ keyId, confirm: true }` (`keyId` may be the full DID URL or `key-1` or
`#key-1`). It makes a new key of the same type through the engine, updates the DID document on the ledger with the
old key signing the update (the engine's per-customer payer, write queue and lock), and leaves the old verification
method in the document but out of `authentication` and `assertionMethod`, so earlier credentials still verify. It
answers `{ oldKeyId, newKeyId, didUpdate: { txHash } }`. 404 for an unknown key, 409 for a key that is not active, a
deactivated DID or a rotation already in progress. Signing from then on uses only keys that are in force.
Rotation does not reissue authority: a mandate stays bound to the key it was issued for. Grant it again, or change
its expiry (which rebinds it), to bind the new key.

`POST /agents/{id}/keys` takes `{ type: 'Ed25519' }` and adds that key, listed under `authentication` and
`assertionMethod`, with the same ledger rules. 409 when an active Ed25519 key exists. It answers 201 with the key
object. Only Ed25519 is offered (the reverse is not needed).

Both write routes record `key-rotated` or `key-added` in the agent's activity and an entry in the append-only
`adminAuditLog` (`agent.key.rotated`, `agent.key.added`; actor `owner` or `api-key` with the internal user id, never
an email). Those two writes are best effort: the ledger write has already happened, so a failed audit write is
logged, not surfaced.

## Activity

`GET /agents/{id}/activity?page&limit` answers `{ total, events: [{ id, type, at, actor, detail }] }`, newest
first (limit 1 to 100, default 50). Types: `registered`, `authority-granted`, `authority-revoked`,
`authority-expiry-changed`, `key-added`, `key-rotated`, `card-published`, `card-updated`. The first publication of a
card is `card-published`; every later card version, published or not, is `card-updated`. `actor` is `owner` (a
signed-in user), `api-key` or `system`, never an email. Events live in the new `agentEvent` table, written by the
agent service. Nothing from `adminAuditLog` is read into it. An event that cannot be written is logged and does not
undo the change it describes.

The backfill (migration `1791701800000`) creates, for agents that already exist and with actor `system`:
`registered`, `authority-granted`, `authority-revoked` and the card events, from timestamps Studio already held.
Key events and expiry changes before the migration were never recorded and cannot be backfilled.

## Changing a grant's expiry

`PATCH /agents/{id}/authority/{grantId}` takes `{ expiresAt }` (ISO 8601) and answers
`{ grant, credential }`. The grant keeps its `id`. Studio signs a replacement credential with the new expiry and a
new status list entry, revokes the old entry on the Token Status List, then switches its record over. The
replacement credential is returned once, like a new grant.

- 400: not a date, in the past, or later than the platform maximum (365 days from now; set
  `AGENT_GRANT_MAX_LIFETIME_DAYS` to change it).
- 409: the grant is revoked or expired; the agent is not active; a change to this grant is already in progress; the
  grant is a KYA-OS delegation (it has no status list entry, so the old credential cannot be superseded); or a
  tool-scope or mandate grant made before Studio kept its claims (revoke it and grant again).
- Order of operations is chosen to fail closed: if the ledger revocation of the old entry fails nothing changes in
  Studio; if the final database switch fails after the ledger write, neither credential is valid until the grant is
  made again.

Studio now keeps each new grant's non-secret claims (tool names, scopes, mandate constraints; never `cnf` or the
signed credential) in `authorityGrant.claims` so the replacement can be built.

## Migrations

| Timestamp | Change |
|---|---|
| `1791701700000` | `agent.capabilities` (jsonb, not null, default all false) and `agent.useCase` (varchar 64) |
| `1791701800000` | `agentEvent` table and backfill |
| `1791701900000` | `authorityGrant.claims` (jsonb, nullable) |

All are expand-only with a `down` that reverses them (the second drops the table, and the backfill with it).

## Known limits

- `didUpdate.txHash` is `null`: the Credo engine's `updateDid` does not report a transaction hash today. The field
  is passed through when an engine provides one.
- "A rotation is in flight" (and "a change to this grant is in progress") is detected within the process serving
  the request only. Two simultaneous requests landing on different instances are serialised by the payer lock for
  the ledger write but not rejected; `Idempotency-Key` protects retries of the same request.
- The per-agent and per-grant guards are in memory and are released in a `finally`.
- Nothing here was exercised against a real ledger. The tests use the in-memory fakes in `tests/unit/agent/fakes.ts`
  (real crypto, no ledger, no database): the SQL for `q`, the event queries and the grant swap is checked as
  query shape only, and the migrations are checked as text, not run against Postgres.
