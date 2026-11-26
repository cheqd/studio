# Functional parity personas

Each persona replays a usage pattern seen on Studio (operation types, their order, options and formats) against a Studio
API and checks that every step still does what it does on the released version. They contain no customer data.

| Persona | Pattern |
| --- | --- |
| P1 | Trust-chain builder: DIDs, JSON schemas with versions, an image resource, a Bitstring accreditation status list, authorise, accredit (with and without status), attest, chain verification, suspend, reinstate, revoke, an offer to an owned DID, deactivation |
| P2 | DID automation: create DIDs and update their services in bulk, list, deactivate |
| P3 | StatusList2021 issuer: key then DID with that key, HTML resource, revocation and suspension lists, issue with status, verify, the status check route, revoke, suspend, reinstate, default format, JSON-LD, updates, deactivation |
| P4 | Bitstring credential issuer: list, issue with status, verify, status check route, revoke |
| P5 | Verifier of credentials issued by other accounts (uses what P3 and P4 issued in the same run), plus a tampered credential |
| P6 | Portability: key import, DID import, DID export |
| P7 | Issue to an owned DID, find and accept the offer, list received credentials, verify |
| P8 | Key-only: create and read Ed25519 and Secp256k1 keys |

## Running

Staging and testnet only; the script refuses the production API.

```sh
STUDIO_API_URL=https://studio-api-staging.cheqd.net \
STUDIO_API_KEY_FILE=/path/to/file-holding-a-test-account-key \
node tests/parity/run-personas.mjs            # all personas
node tests/parity/run-personas.mjs P3 P4 P5    # some of them
```

- The key is read from the file and never printed. Use a dedicated test account.
- The script tops the account up from the faucet (one run uses most of the 100,000 CHEQ monthly cap).
- Results are written to `tests/parity/results/` (ignored by git) and a summary table is printed.

## Outcomes

| Outcome | Meaning |
| --- | --- |
| PASS | The step behaves as on the released version |
| KNOWN | The step fails because of a recorded defect (the id is in the results) |
| FIXED | A step marked as a known defect now passes: remove the marker |
| FAIL | An unexpected difference: investigate before release |

The process exits non-zero when any step is FAIL.

## Limits

- Every artefact the script creates is new, so on the Credo release it exercises the Credo engine. Artefacts created
  before the release stay on Veramo; checking those needs either legacy artefacts on the target environment or the
  temporary Veramo override for a test customer.
- Portal-only journeys (first DID through the portal, faucet-only sign-ups) are not covered here.
