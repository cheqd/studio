# Analytics endpoints

Counts only. No endpoint here returns a key, an identifier list, credential contents, a claim, a holder, a verifier or
an email. Every range is whole UTC days including today.

## What "not supported" means

Studio records metered operations (`operation`), faucet requests, issued credentials and agent activity. It does not
record who verified an agent, whether a verification passed, card fetches, mandate checks, partner hand-offs, or
ledger writes made outside Studio. An element Studio cannot measure comes back as
`{ "supported": false, "reason": "..." }` and its dotted key is listed in `unavailable`. The portal should show "not
available yet" for it. It is never returned as `0`. A supported element with nothing to count is a real `0`.

```ts
type Unsupported = { supported: false; reason: string };
type Tile = { supported: true; value: number } | Unsupported;
type Series = { supported: true; points: { date: string; count: number }[] } | Unsupported; // one point per UTC day
type Table<Row> = { supported: true; rows: Row[] } | Unsupported;
```

## Customer routes

`GET /account/analytics/agents` and `GET /account/analytics/individuals`, with `range=7|30` (default 30; anything else
is 400). Scope `read:account`, the scope `/account/analytics` already uses, so no new Logto scope is needed. The
customer is always the signed-in one; no parameter can name another. The routes sit beside `GET /account/analytics`,
which still returns lifetime totals.

Response: `{ audience, range, from, to, tiles, series, tables, unavailable, notes }`.

| Route | Supported | Not supported |
|---|---|---|
| agents | tiles `agentsRegistered`, `authorityGranted`, `authorityRevoked`; series `agentActivityPerDay`; table `agentActivity` (`agentId`, `name`, `events`, `lastActivityAt`) | tiles `verificationsReceived`, `passedPercent`, `mandateChecks`, `agentCardFetches`; series `verificationsPerDay`; tables `byAgent`, `topVerifiers`, `byProtocol` |
| individuals | tiles `credentialsIssued`, `presentationsVerified`, `revoked`, `statusChecks`; series `credentialsIssuedPerDay`; table `byFormat` (`format`, `label`, `count`) | table `partnerHandoffs` |

Sources: `issuedCredential` (category `credential`, offered or rejected excluded), `operation` (`presentation-verify`,
`credential-status-check`, successful only), `agent`, `authorityGrant`, `agentEvent`. `presentationsVerified` and
`statusChecks` count calls made with the customer's own account. mdoc is not a Studio format, so it is not listed.

### Verify and resolve routes

`POST /credential/verify` and `POST /presentation/verify` write an `operation` row against the calling customer on
success only, with no agent, holder or verifier. `GET /did/search/:did` and `GET /resource/search/:did` write nothing.
So Studio records no verification per agent or per agent owner. Closing that gap needs new tracking and a decision (A2).

## Staff route

`GET /admin/analytics/faucet-to-ledger?range=7|30|90&segment=agents|people|unclassified|all` (defaults 30 and `all`).
Scope `admin:analytics:read`. Segments follow the existing customer rule (see `/admin/analytics/overview`).

Response: `{ range, segment, from, to, network: "testnet", tiles, funnel, ledgerFunnel, writeKinds, timeToFirstWrite,
ledgerVsStudioJourneys, ledgerIndexer, unavailable, notes }`.

With the ledger indexer off, or with no data yet (the default), the response is as below. With it on and enough funded
addresses checked, see "Ledger indexer" after this list.

- Supported: `fundedAddresses`, `fundedToOwnAccount`, `wroteViaStudioWithin7Days`; `funnel` steps `funded`,
  `first-studio-write-7d`, `wrote-again`, `topped-up`; `writeKinds`; `timeToFirstWrite`.
- Not supported (needs a ledger indexer or an account-less faucet record): `savedToProfile`,
  `wroteToLedgerWithin7Days`, `stillOffLedger`, `ledgerFunnel`, `ledgerVsStudioJourneys`.

A funded address is the first completed `faucetRequest` for that address, if it falls in the range. Studio only sees
faucet requests from signed-in customers. "Wrote" means a tracked, successful testnet write operation by the customer
after the funding (`did-create`, `did-update`, `did-deactivate`, `resource-create`, `credential-status-*`,
`credential-revoke`, `credential-suspend`, `credential-unsuspend`), counted only for addresses that are the customer's
own `paymentAccount`. Steps with `basis: "own-account"` use `fundedToOwnAccount` as their denominator. Writes made with
an SDK outside Studio are invisible, so these figures undercount. `faucetRequest` keeps a limited history
(`FAUCET_REQUEST_RETENTION_MONTHS`).

### Ledger indexer (decision A3)

Studio cannot see the chain, so a small sync fills `ledgerAddressActivity` (one row per faucet-funded address: first
write, last write, write count, counts by kind) from the cheqd data-api (`https://data-api.cheqd.io`, both networks;
Studio queries `testnet`, the only network the faucet serves). The data-api was chosen over node `tx_search` (public nodes time
out on busy senders, give no timestamps and need tx decoding; GraphQL explorer is mainnet only). Off by default: `LEDGER_INDEXER_ENABLED=true` switches it on.

What it reads: successful DID writes (create, update, deactivate) and resource writes whose **fee payer** is the funded
address, since the date of its first funding. Resource types matching `status list` or `revocation` count as status
list or revocation updates; every other resource is "other". It does **not** see other transaction types (bank sends,
staking, governance), failed writes, or writes paid by a different fee payer.

When the indexer has checked at least `LEDGER_INDEXER_MIN_COVERAGE_PERCENT` (default 90) of the funded addresses in the
range, these become supported (counts only, never an address):

- `tiles.wroteToLedgerWithin7Days`: addresses whose first ledger write is within 7 days of funding, any writer.
- `tiles.stillOffLedger`: checked addresses with no ledger write.
- `funnel` becomes `funded`, `first-ledger-write-7d`, `wrote-again-ledger` (2 or more writes), `topped-up`, all
  `basis: "all-funded"`; `ledgerFunnel` carries the same rows.
- `writeKinds` and `timeToFirstWrite` are computed from ledger writes instead of Studio-recorded ones.
- `ledgerVsStudioJourneys`: `{ supported: true, rows: [{ key: "wrote" | "no-writes", label, usedStudioJourney,
  noStudioJourney }] }`. A Studio journey means the customer who requested the funding has registered an agent
  (granting authority needs an agent). Verifying an agent and partner hand-offs are not recorded.
- `ledgerIndexer: { enabled, supported, fundedAddresses, checkedAddresses }` says how complete the picture is.

Still `{ supported: false, reason }`: `tiles.savedToProfile` (Studio records no anonymous funding) and everything above
when the indexer is off, has no data, or is below the coverage threshold. In that case the response is exactly the
Studio-recorded shape described earlier, so the portal needs no change. Addresses with more writes than one check
reads (`LEDGER_INDEXER_MAX_PAGES` x `LEDGER_INDEXER_PAGE_SIZE`) keep exact totals and times; their split by kind is a
lower bound.

Operation: Studio has no scheduler, so a batch of at most `LEDGER_INDEXER_BATCH_SIZE` addresses is started in the
background by a faucet request or a staff view of this route, at most once per `LEDGER_INDEXER_RUN_INTERVAL_MINUTES` per
process. Unchecked addresses go first, then the stalest (`LEDGER_INDEXER_RECHECK_HOURS`). A failed lookup is retried with
backoff and never stored as "no writes"; three failed addresses in a row end the run. Rows are replaced whole, so
repeated or overlapping runs are safe. Logs carry counts only.

The other Admin Analytics tabs use existing routes: Overview (`/admin/analytics/overview`, `/funnels`) and Usage
(`/endpoints`, `/top-accounts`, `/plan-mix`). The funnels lack the portal-event steps; plan mix has no segment filter.

## On-ledger analytics

Only on-ledger behaviour is measured here: creating, updating (including key rotations) and deactivating DIDs, and
creating DID-Linked Resources. Verifications, presentations and wallet activity are not on the ledger and are not
covered. Source: the cheqd data API (`LEDGER_INDEXER_SOURCE_URL`, default `https://data-api.cheqd.io`, `/analytics/testnet`
and `/analytics/mainnet`), filtered by fee payer (always the signer). Both routes need `LEDGER_INDEXER_ENABLED=true`;
without it every element is `{ "supported": false, "reason": "..." }`. The portal contract is
`onledger-analytics-contract.md`; this section is the reference.

### Customer: `GET /account/analytics/ledger?range=7|30&kind=all|organisation|agent`

Scope `read:account`. Customer from the session, never a parameter. Default `range=30`, `kind=all`; any other value
or a repeated parameter is 400. The data is the writes paid from the customer's own payment account(s)
(`paymentAccount`, testnet and mainnet), so writes made from other addresses are not seen. `kind=agent` is identifiers
Studio created for agents (`identifier.kind`), `organisation` the rest; identifiers Studio no longer holds count only
under `all`.

Response (`supported: true`): `{ state: 'ok' | 'empty', range, kind, from, to, networks, tiles: { writes,
activeIdentifiers, statusListsPublished, resourcesPublished }, series: { days: [{ date, createDid, updateDid,
deactivateDid, createResource }] }, byIdentifier: { rows (max 50, latest write first: did, kind, lastWriteAt, writes),
total, unmatchedWrites }, resourcesByType: { rows: [{ resourceType, category, count, latestAt }] }, firstWriteAt,
lastWriteAt, truncated, generatedAt, notes }`. Days are UTC and zero-filled. A customer with no payer account, or no
writes ever, gets `state: 'empty'` with real zeros. When the source fails, times out or is switched off the answer is
`{ supported: false, reason, range, kind, from, to }`, never zeros. No fee or CHEQ figure, address or transaction hash
is returned to customers; only DIDs Studio holds for the customer.

Bounds: at most `LEDGER_INDEXER_MAX_PAGES` pages of `LEDGER_INDEXER_PAGE_SIZE` per endpoint per payer account
(`truncated: true` when more exist, so counts are then a lower bound), at most two payer accounts, a 25 second overall
budget, and an in-memory cache per customer, range and kind for 5 minutes (a failure is remembered for 30 seconds), at
most 200 entries, concurrent identical calls share one lookup. The source is not called at import or in tests.

### Staff: `GET /admin/analytics/ledger-writes?range=7|30|90`

Scope `admin:analytics:read`, staff policy as for every staff route. Default 30. Funded addresses are the testnet
faucet cohort (every completed `faucetRequest` address). Sections, each `supported: true` or
`{ supported: false, reason }`:

- `writes`: `days` (zero-filled, per UTC day, by `createDid`, `updateDid`, `deactivateDid`, `createResource`, `total`)
  and `totals`.
- `retention`: of funded addresses whose first write falls in the range, the share still writing 1, 2 and 4 weeks
  after it. Week k is the 7-day bucket from D0+7k to D0+7k+6 (UTC, D0 the UTC day of the first write); only addresses
  whose bucket ended before today and lies in their stored history are `eligible`; `share = retained / eligible`
  (`null` when nobody is eligible). The definition is returned in `definition`.
- `fees`: total CHEQ fees by operation type, split into `studioPayerAccounts` (an address held in a Studio
  `paymentAccount`) and `otherAddresses` (SDK). **Exact, not estimated**: the data API item carries `amount`, the fee in
  CHEQ, which equals the transaction fee (checked against the node REST for one transaction). Failed transactions are
  not in the source, so fees burnt on them are not counted. Each `Fee` is `{ writes, ncheq, cheq }` (`ncheq` an exact
  integer string).
- `channels`: `studioWrites`, `otherWrites`, `studioShare` and the number of writing addresses of each kind.

Stored per-day data: `ledgerAddressDaily` (address, UTC day, operation type, resource type, count, fees in ncheq),
filled by the existing sync (same batch and page bounds, one statement per address so it is idempotent), plus
`dailySyncedAt` and `dailyCompleteFrom` on `ledgerAddressActivity`. An address with more writes than the page bound
keeps its newest days complete and records the first complete day; an address counts as covered for a range only if its
per-day history is stored and complete from the start of the range. `coverage` reports funded versus covered addresses;
below `LEDGER_INDEXER_MIN_COVERAGE_PERCENT` every section is unsupported. Existing rows are backfilled by the next
sync, so coverage climbs as it runs.
