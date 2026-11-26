# Status lists: which path applies to which credential

Decision for [#878](https://github.com/cheqd/studio/issues/878), confirmed 11 Nov 2026: Studio keeps its existing Bitstring path for legacy credentials, and Credo is used for SD-JWT credentials. The route is per credential, not per user or per account.

## The rule

A credential is checked, revoked and suspended by the path that matches its own status entry. Both formats are never mixed on one credential.

| Credential | Status entry | Path | Where in Studio |
|---|---|---|---|
| W3C credential, `StatusList2021` | `credentialStatus.type` is `StatusList2021Entry` | Veramo plugin: `cheqdVerifyCredential`, revoke and suspend | `src/services/identity/providers/studio/agent.ts` (`verifyCredential`) |
| W3C credential, Bitstring | `credentialStatus.type` is `BitstringStatusListEntry` (any other type takes this path too) | Veramo plugin: `cheqdVerifyCredentialWithStatusList` | same |
| SD-JWT credential | `status.status_list` claim | Credo and Token Status List | **Not wired into Studio yet.** Only the key storage adapter (#877) exists. |

Issuing follows the same split: asking for a `StatusList2021` list issues through `cheqdIssueRevocableCredentialWithStatusList2021` or `cheqdIssueSuspendableCredentialWithStatusList2021`; any other list type issues through `cheqdIssueCredentialWithStatusList` (Bitstring).

## How the lists are stored on the network

Read from the testnet on 11 Nov 2026. Both are JSON objects with a wrapper key, stored with media type `application/json`. `encodedList` is gzip, base64url encoded, with no multibase `u` prefix.

| Resource type | Shape |
|---|---|
| `BitstringStatusListCredential` | `{"bitstringStatusListCredential": {"credentialSubject": {"type": "BitstringStatusList", "statusPurpose": [...], "encodedList": "..."}}}` |
| `StatusList2021Revocation`, `StatusList2021Suspension` | `{"StatusList2021": {"statusPurpose": "...", "encodedList": "..."}}` |

A Token Status List is a different resource: type `TokenStatusList`, the signed JWT as raw text (the ledger records it as `text/plain`). The cheqd resolver serves it as `application/statuslist+jwt`.

## What this means

- Credo does not read the Bitstring or `StatusList2021` lists. A credential with one of those entries must stay on the Veramo path for as long as it can be presented.
- A verifier built on Credo can check an SD-JWT credential against its Token Status List, but not a legacy W3C credential's status.
- Do not change the type of a status entry on an issued credential, and do not move a credential's list to another format.

## Not covered here

A test that checks a Veramo-written list through Studio's own verify path, including a revoked credential, is still open on #878. It needs a running Studio with a database and real credentials.
