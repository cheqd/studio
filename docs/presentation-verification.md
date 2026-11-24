# Presentation verification

`POST /presentation/verify` checks a presentation against what the **verifier** expects, not against what the
presentation says about itself.

For customers served by the Credo engine:

- `challenge` (body) is required. It is the value the verifier issued to the holder for this exchange. The
  presentation's own nonce is never used in its place.
- `verifierDid` (body) is required. It is the domain the presentation was made for (its audience). The only existing
  opt-out is `policies.audience: false`, which skips the audience check and lets `verifierDid` be omitted.
- A request without them answers `400` with `{ "verified": false, "error": "...", "code": "invalid_request" }`.

`POST /presentation/create` accepts an optional `challenge`, which is signed into the presentation as its nonce.

For customers still served by the legacy engine the two fields are optional and, when sent, are passed to verification.

## Holder binding

Credo's own presentation verification, as vendored here, checks that the key that signed the presentation is the
presentation's holder, and that the signer is one of the credential subjects of each credential it carries (for both
JWT and JSON-LD presentations). Studio adds no check of its own. This was established by reading the vendored code and
is covered by Studio's tests only through a fake engine; it has not been exercised against a real ledger.
