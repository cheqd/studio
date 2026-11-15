# API key expiry

An API key sent in the `x-api-key` header is valid until it is revoked or its expiry passes, whichever comes first.

## Behaviour

- Every request is checked against the server clock, in UTC. A key is expired at the exact instant of its `expiresAt`
  (the comparison is `expiresAt <= now`), not one millisecond later.
- An expired key is rejected with `401` and the same body as an unknown key: `Unauthorized error: Invalid API key.`
  The response does not say that the key exists. The server logs one line with a short, non-secret reference to the
  key (the first characters of its SHA-256 fingerprint) and the reason.
- A revoked key is rejected with `401` (`Unauthorized error: API key is revoked.`).
- The check runs in the single place every API-key request passes through, the authentication guard, so it applies to
  all route families: the customer API, the admin routes (`/admin/**`) and the routes that also accept a machine to
  machine token or a Studio session when the caller chose `x-api-key`. Nothing caches key lookups: a revocation or an
  expiry takes effect on the next request.
- `expiresAt` is a non-nullable `timestamptz` column, so there is no "never expires" key. A key created without
  `expiresAt` gets a default of 30 days from creation.

## Create and update

`POST /admin/api-key/create` and `POST /admin/api-key/update` accept an optional `expiresAt` (ISO 8601). It must be in
the future and no more than 730 days ahead; the limit is set by `API_KEY_MAX_EXPIRATION_DAYS` (default 730). Anything
else is a `400`. An expired key can still be extended or revoked by an administrator who authenticates another way.

## Listing

`GET /admin/api-key/list`, `GET /admin/api-key/get`, and the create and update responses carry `expiresAt` and an
`expired` boolean (computed from the same rule as authentication). Other fields are unchanged.
