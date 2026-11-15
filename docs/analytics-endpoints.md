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
