# Staff access

Staff (admin) routes can be used only by a named person signed in through the portal. A machine client, an API key or a bare ID token can never use them, whatever scopes they carry.

## The policy

A request to a staff route is allowed only when all of these hold. Any missing piece of data refuses the request (fail closed).

1. It is a portal user session: the user's verified ID token and the portal's verified M2M bearer token are both present.
2. The caller holds the staff scope the route needs (scopes come from the user's own Logto roles, never from the M2M token).
3. The ID token carries a verified email (`email_verified` is `true`).
4. The email domain is one of `STAFF_EMAIL_DOMAINS`.
5. The user holds one of the Logto roles in `STAFF_ROLE_NAMES`.

A refusal answers `403` with the same generic message for every reason. The reason code (`missing-scope`, `email-unverified`, `email-domain`, `role-missing`, `not-user-session`, `identity-missing`) is logged with the Logto user id only, never the email. A refused `DELETE /admin/organisation/delete` is also written to `adminAuditLog` (action `staff.access.denied`) with the actor's Logto user id, the route and the reason code.

### Routes covered

| Route | Scope |
| --- | --- |
| `GET /admin/customers`, `GET /admin/customers/{id}` | `admin:customers:read` |
| `GET /admin/analytics/overview`, `endpoints`, `top-accounts`, `plan-mix`, `funnels`, `faucet-to-ledger` | `admin:analytics:read` |
| `GET /admin/audit-log` | `admin:audit:read` |
| `DELETE /admin/organisation/delete` | `admin:organisation:delete` |
| `PUT /admin/flags` | `admin:flags:update` |

Any other `admin:*` scope is treated as a staff scope and is stripped from the portal M2M token, unless it is on the customer-facing list in `CUSTOMER_ADMIN_SCOPES` (`src/controllers/admin/staff-policy.ts`: billing, API keys, the customer's own organisation, swagger). The unit test `tests/unit/admin/staff-routes-policy.test.ts` iterates the route rules and fails if a staff rule has no policy-checked handler.

Staff cannot delete their own organisation through the staff route; use `DELETE /account`.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `STAFF_EMAIL_DOMAINS` | `cheqd.io` | Comma separated. The part after the last `@` must equal an entry, compared case-insensitively. A subdomain is allowed only when written as a wildcard entry, for example `*.example.org` (which does not match `example.org` itself). |
| `STAFF_ROLE_NAMES` | `cheqd admin` | Comma separated Logto role names, compared exactly. The user needs at least one. |

Blank values fall back to the defaults.

The portal path also checks who the ID token was issued to. `PORTAL_APP_IDS` (comma separated) must hold the portal's Logto application id, the value the portal calls `LOGTO_APP_ID`. A portal ID token is accepted only when its `aud` (a string or an array) includes one of them, so an ID token issued to any other application in the tenant cannot be used to reach a staff route. Production refuses to start without it (unless `ALLOW_INSECURE_PRODUCTION_WITHOUT_AUTHENTICATION=true`); in development and test an unset value means the audience is not enforced, with a logged warning.

## What must exist in Logto

- A role named as in `STAFF_ROLE_NAMES` (default `cheqd admin`), carrying the staff scopes on the Studio admin resource (the `LOGTO_DEFAULT_RESOURCE_URL` API resource): `admin:customers:read`, `admin:analytics:read`, `admin:audit:read`, `admin:organisation:delete`, `admin:flags:update`.
- The staff scopes must not be on any customer role, nor on the portal M2M application's role.
- The portal's Logto application must request the ID-token scopes `email` and `roles`, so the ID token carries `email`, `email_verified` and `roles`. Email verification must be enforced by the sign-in experience, so `email_verified` is true only for confirmed addresses.
- The Studio management M2M application needs read access to user roles in the Management API (it already reads roles to work out scopes).

Roles are read from Logto's Management API, so removing a role applies within about 30 seconds (the per-user cache). The ID token `roles` claim is used only when the Management API lookup fails.

## Add or remove a staff member

- Add: give the person a verified email on an allowed domain, then assign them the staff role in Logto. They must sign in again to the portal.
- Remove: unassign the role (or suspend the user) in Logto. Access ends within the cache window, and at once for new sign-ins.

## What breaks if a claim is missing

- An ID token whose `aud` is not one of `PORTAL_APP_IDS`, or that has no `aud`: `401` before any staff check.
- No `email` or `email_verified` claim (the portal did not request the `email` scope, or the address is unverified): every staff route answers `403` for everyone (`identity-missing` or `email-unverified`).
- No `roles` claim: nothing breaks while the Management API answers, because roles come from there. If both the claim and the lookup are missing, staff routes answer `403` (`identity-missing`).
- No role assigned in Logto, or the role name differs from `STAFF_ROLE_NAMES`: `403` (`role-missing`).
- Calling a staff route with an M2M client, an API key or an ID token alone: `403` (`not-user-session`). The direct machine-to-machine customer path (`customer-id` header with a Bearer token) is also switched off by default (`ENABLE_M2M_CUSTOMER_PATH`), so such a call is refused with `401` before it reaches the staff policy; with the path enabled it is still `403` here.
