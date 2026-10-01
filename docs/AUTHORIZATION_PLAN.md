# Authorization by Group Membership: Design and Phased Plan

Status: **Direction approved** (2026-10-01). Product-owner decisions are
recorded in Section 9. Implementation starts with Phase 1.
Tracking issue: [#130 Authorization by Group Membership](https://github.com/Stars-and-Stripes-Honor-Flight/sshf-api/issues/130)

This document is planning only. It does not change runtime behavior. Each
phase below ships as its own PR with tests, OpenAPI updates, and README /
`docs/DEPLOYMENT.md` / `env.example` updates, following the repository rules
in `.cursor/rules/`.

## 1. Requirements from issue #130

| # | Requirement | Where it is addressed |
|---|---|---|
| R1 | Membership counts whether the user is a **direct or indirect (nested)** member of a Workspace group | Section 4, Phase 1 |
| R2 | Specific authorization groups grant specific permissions in the app | Section 3 (roles WRITE, FULL, MEDICAL, REVIEW), Phase 2 |
| R3 | Permissions allow or deny access to API endpoints; the API is the enforcer | Section 3.3, Phase 3 |
| R4 | Group names that grant permissions are configurable per deployment environment | Section 5, Phase 2 |
| R5 | The API exposes a summary of the current user's permission level for UI hints | Section 6, Phase 3 (API), Phase 4 (UI) |

## 2. Current state

### 2.1 Request flow today

1. `authenticate` (`utils/authenticate.js`, wired in `index.js` lines 102-107)
   reads the Bearer access token and checks the in-memory cache
   (`utils/user_cache.js`, keyed by SHA-256 of the token, 15-minute TTL,
   1,000 entries max).
2. On a cache miss it introspects the token (`OAuth2Client.getTokenInfo`) and
   validates claims in `assertValidTokenClaims` (`utils/auth.js` lines
   111-133). The audience must be in `ALLOWED_CLIENT_IDS` / `GOOGLE_CLIENT_ID`
   (else `401`). `ALLOWED_EMAIL_DOMAINS` is an optional extra check (else `403`).
3. It fetches the Google profile (`getUserInfo` in `index.js`), then calls
   `getGroupMemberships` (`utils/groups.js` lines 141-202).
4. `getGroupMemberships` calls Admin SDK Directory
   `groups.list({ userKey: email, domain: <email domain>, maxResults: 100 })`
   with paging up to 20 pages (`utils/groups.js` lines 113-128). On Cloud Run
   it authenticates with ADC as the runtime service account. Locally it
   prefers `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`.
   The only scope requested is `admin.directory.group.readonly`
   (`utils/groups.js` line 31). No domain-wide delegation `subject` is used.
   The service account holds the Workspace **Groups Reader** admin role
   (`docs/DEPLOYMENT.md`, Infrastructure reference).
5. Each returned group becomes `req.user.roles[] = { id, name, email }`
   (`utils/authenticate.js` lines 80-84). The whole user object is cached.
6. Data routes then run `authorize` (`utils/auth.js` lines 168-178). It passes
   if any `roles[].email` is in `ALLOWED_GROUP_EMAILS` (case-insensitive) and
   returns `403 { message: 'Forbidden: Account not permitted' }` otherwise.
7. `GET /user/hasgroup?groupEmail=` (`routes/user.js`) runs **without**
   `authorize`. It returns `{ hasgroup: boolean }` by matching the cached
   `roles`. The UI uses it during sign-in.

Failure handling that must be preserved:

- On Cloud Run, a Directory failure throws `DirectoryGroupsUnavailableError`
  and authentication returns `503`. Errors are never cached as "no roles".
- Off Cloud Run, a Directory failure continues with `roles = []` so local
  testing against CouchDB still works when `ALLOWED_GROUP_EMAILS` is unset.
- On Cloud Run, an empty `ALLOWED_GROUP_EMAILS` stops the process at startup
  (`validateGroupAuthorization` in `index.js`) and `authorize` returns `403`.

### 2.2 What is enforced today

There is a single permission level. Every protected route in `index.js`
(lines 110-192) uses the same chain, `authenticate, authorize, dbSession`
(or `reviewDbSession`). Any member of any group in `ALLOWED_GROUP_EMAILS`
can call every data endpoint, including deletes, exports, and application
acceptance. Dev uses `sshf_app_dev_full_access@…` and prod uses
`sshf_app_prd_full_access@…`. Today every app user is in the full-access
group. The other three authorization groups for each environment (Section 5)
exist in Workspace but the API does not read them yet.

Public or separately authenticated routes: `GET /openapi.json`,
`/api-docs`, and `POST /review/applications` (service-account ID token via
`authenticateIntake`). `GET /user/hasgroup` is authenticated but not gated by
group.

### 2.3 Nested membership: not satisfied today

**Current code does not honor indirect membership.** `groups.list` with
`userKey` returns the groups the user is subscribed to directly. Google's
guide describes the result as "all groups for which a member has a
subscription". A user who is only in `volunteers-leads@` where
`volunteers-leads@` is a member of `sshf_app_prd_full_access@` gets no
`sshf_app_prd_full_access@` entry. `authorize` returns `403` and
`/user/hasgroup` returns `false` for that user.

Two further limits of the current lookup:

- `domain` is set to the user's email domain, so a membership in a group on a
  different domain of the same Workspace account is not returned.
- Paging stops at 2,000 direct memberships. This is not a practical problem,
  but it only exists because the API lists every group instead of checking
  the few that matter.

**Partial head start:** the runtime service account's existing Groups Reader
role and `admin.directory.group.readonly` scope already permit the Admin SDK
call that checks nested membership (`members.hasMember`, Section 4). Phase 1
needs **no new IAM grant, Workspace role, scope, or enabled API.**

### 2.4 How the UI consumes authorization today (sshf-ui, read-only review)

- `src/lib/auth/domain/client.js` calls `GET /user/hasgroup` once per group in
  `possibleRoles = [process.env.NEXT_PUBLIC_ROLE_FULL_ACCESS]` and builds its
  own `roles` array.
- `src/hooks/use-permissions.js` exposes `isInGroup(groupEmail)` and
  `useHasFullAccess()`. These drive nav filtering
  (`components/main/layout/nav-access.js`) and `components/auth/full-access-guard.js`.
- The group email is baked into the UI build (`NEXT_PUBLIC_ROLE_FULL_ACCESS`),
  so group names are configured in two places today.
- The UI sign-in requests the `admin.directory.group.readonly` scope for the
  **end user**, and `client.js` has an unused path that calls the Directory
  API directly with the user's token. Swagger's implicit flow also requests
  that scope (`swagger/swagger.js` lines 89-96). The API never uses the
  user's token for Directory calls, so end users do not need this scope.

### 2.5 Other findings that affect the plan

- Error payload keys are mixed. Auth middleware uses `{ message }` (13
  sites). Route handlers and `schemas/Error.yaml` use `{ error }` (142
  sites). The plan keeps `{ message }` for auth-layer `401`/`403`/`503` so
  existing clients do not break. Unifying the keys is a separate,
  lower-priority cleanup (Section 9, decision 4). Clear `401`/`403`
  semantics come first.
- `req.user.roles` is not part of any documented response schema. Only
  `authorize` and `routes/user.js` read it. Its internal shape can change
  without an API contract change.

## 3. Target model

```
Workspace groups (per environment, env config)
        │  direct OR nested membership (Admin SDK hasMember)
        ▼
Roles (stable IDs defined in code: WRITE, FULL, MEDICAL, REVIEW)
        │  static role → permission catalog (code, tested)
        ▼
Permissions (e.g. records:read, records:write)
        │  requirePermission(...) on every protected route
        ▼
Endpoint allowed (next) or denied (403)
```

Design rules:

- **Group emails are configuration.** They change per environment and live
  only in env vars (R4).
- **Roles and permissions are code.** They are part of the API contract, are
  covered by tests, and are documented in OpenAPI. An env var cannot invent a
  permission.
- **Permissions are additive.** A user's permissions are the union over all
  roles they hold. There are no deny rules, so a group cannot take access
  away. Not being in a group is the only way to lack a permission.
- **Fail closed.** Unknown role names in config, missing config on Cloud Run,
  and Directory outages never grant access.

### 3.1 Roles (approved)

Each role maps to one Workspace group per environment (Section 5).

| Role | Group (dev / prd) | Purpose |
|---|---|---|
| `WRITE` | `sshf_app_dev_access@` / `sshf_app_prd_access@` | Common logistics read and write. Most board members get this through the BoD group nested inside the access group |
| `FULL` | `sshf_app_dev_full_access@` / `sshf_app_prd_full_access@` | Everything in WRITE plus admin and batch update endpoints. A few people stay here after rollout |
| `MEDICAL` | `sshf_app_dev_medical_access@` / `sshf_app_prd_medical_access@` | Extended medical data. Reserved: the role is configured and resolved, but its endpoints come later (there is little or no medical data in the database yet) |
| `REVIEW` | `sshf_app_dev_review_access@` / `sshf_app_prd_review_access@` | Application intake review and acceptance (`/review/applications*`, already built) |

All groups are on `starsandstripeshonorflight.org`, the only Workspace
domain. There is **no read-only role** for now. One can be added later by
moving `POST`/`PUT`/`PATCH` routes behind a permission that WRITE has and a
new read-only role does not.

### 3.2 Permission catalog (proposed defaults, grouped by the routes in `index.js`)

| Permission | Granted by | Endpoints |
|---|---|---|
| `records:read` | WRITE, FULL | `GET /search`, `POST /query` (read-only Mango proxy), `GET /docs/:id`, `GET /docs/:id/revisions`, `GET /docs/:id/diff`, `GET /veterans/search`, `GET /veterans/:id`, `GET /guardians/:id`, `GET /flights`, `GET /flights/:id`, `GET /flights/:id/assignments`, `GET /flights/:id/detail`, `GET /waitlist`, `GET /waitlist/veteran-groups`, `GET /recent-activity` |
| `records:write` | WRITE, FULL | `POST /veterans`, `PUT /veterans/:id`, `POST /guardians`, `PUT /guardians/:id`, every `PATCH /veterans/:id/*` and `PATCH /guardians/:id/*` field endpoint |
| `exports:read` | WRITE, FULL | `GET /exports/flight`, `GET /exports/callcenterfollowup`, `GET /exports/tourlead` |
| `records:delete` | FULL | `DELETE /veterans/:id`, `DELETE /guardians/:id` |
| `documents:admin` | FULL | `POST /docs`, `PUT /docs/:id`, `DELETE /docs/:id`. These are the generic document writes that bypass the type-specific routes |
| `flights:manage` | FULL | `POST /flights`, `PUT /flights/:id`, `POST /flights/:id/assignments` (batch: adds up to 100 waitlist veterans and their guardians) |
| `applications:review` | REVIEW | `GET /review/applications`, `GET /review/applications/:id`, `PUT /review/applications/:id`, `PATCH /review/applications/:id/status` |
| `applications:accept` | REVIEW | `POST /review/applications/:id/accept`. This permission is enough on its own: the endpoint's write to the logistics database is limited to the accepted record |
| `medical:read`, `medical:write` | MEDICAL | Reserved. No endpoints yet |

Notes:

- **FULL includes every WRITE permission**, so the few FULL users do not
  also need to be in the access group.
- **FULL does not include REVIEW or MEDICAL.** Review endpoints require the
  REVIEW permission. Admins who review applications are added to the review
  group. This follows the decision that "review endpoints get REVIEW
  permission and group membership adjusted."
- **Future batch update endpoints default to FULL.**
- The exact FULL-only list above (deletes, generic `/docs` writes, flight
  create/update, and batch flight assignment) is the proposed default. It is
  confirmed route by route in the Phase 3 PR review.
- The existing `PATCH /veterans/:id/medical-form` and `.../medical-review`
  stay under `records:write` until the MEDICAL endpoints are designed.

### 3.3 Enforcement and HTTP semantics

- New `requirePermission(...permissions)` middleware in `utils/auth.js` reads
  `req.user.permissions` (computed once in `authenticate` and cached with the
  user). It returns `403` when any listed permission is missing.
- Route registration stays explicit and ordered per
  `auth-middleware-order.mdc`:
  `app.delete("/veterans/:id", authenticate, requirePermission('records:delete'), dbSession, deleteVeteran)`.
- A single `ROUTE_PERMISSIONS` table (method + path → permissions) is the
  source of truth. It is used by a matrix test and by the OpenAPI check below,
  so a new route cannot ship without a declared permission.
- Standard HTTP authentication and authorization semantics, with a clear
  reason in the text:

| Status | When | Body |
|---|---|---|
| `401` | Missing, invalid, expired, or wrong-audience token (unchanged) | `{ "message": "Unauthorized: <reason>" }` |
| `403` | Signed in, but holds no role, or the email domain is not allowed (unchanged) | `{ "message": "Forbidden: Account not permitted" }` |
| `403` | Signed in with a role, but missing the route's permission (new) | `{ "message": "Forbidden: requires permission records:delete", "requiredPermission": "records:delete" }` |
| `503` | Token introspection or Directory lookup unavailable (unchanged) | `{ "message": "Authentication service unavailable" }` |

- The UI maps these to friendlier copy and hides actions the user cannot
  take, using the permission summary (Section 6). Permission names are not
  sensitive. Group emails never appear in error bodies.
- Unifying `{ message }` and `{ error }` across the API is a separate,
  lower-priority cleanup.

## 4. Resolving direct and nested membership

### 4.1 Options considered

| Option | Nested? | Scope / privilege | Edition requirement | Verdict |
|---|---|---|---|---|
| A. Admin SDK `groups.list?userKey=` (today) | No, direct only | `admin.directory.group.readonly` + Groups Reader | Any | Insufficient on its own |
| B. Admin SDK `members.hasMember(groupKey, memberKey)` for each configured group | **Yes**, direct or nested. Nested checks require the user and group to be in the same domain, otherwise `400 Invalid input` | `admin.directory.group.member.readonly` is the narrowest accepted scope. The current `group.readonly` also works | Any Workspace edition | **Recommended** |
| C. Recursive `groups.list?userKey=<group email>` walking parent groups | Yes | Same as today | Any | Works, but costs many calls per level and needs cycle and depth handling. Keep as a fallback only |
| D. `members.list?includeDerivedMembership=true` to expand each configured group ahead of time | Yes | `group.member.readonly` | Any | Needs a background refresh job and memory for every member. Too heavy for Cloud Run scale-to-zero |
| E. Cloud Identity `checkTransitiveMembership` / `searchTransitiveGroups` | Yes, including cross-domain | `cloud-identity.groups.readonly` | **Workspace Enterprise Standard/Plus, Enterprise for Education, or Cloud Identity Premium only** | Not needed. Its only advantage over B is cross-domain nesting, and SSHF uses a single domain |
| F. Domain-wide delegation impersonating an admin | n/a | Service account can act as any user | Any | Rejected. Far broader than needed |

### 4.2 Recommended approach (option B)

For each authenticated user on a cache miss:

1. Build the **authorization group set**: every group email that grants a
   role. In Phase 1 this is `ALLOWED_GROUP_EMAILS` (the full-access group).
   From Phase 2 it is the union of `AUTHZ_ROLE_WRITE_GROUPS`,
   `AUTHZ_ROLE_FULL_GROUPS`, `AUTHZ_ROLE_MEDICAL_GROUPS`, and
   `AUTHZ_ROLE_REVIEW_GROUPS`.
2. Call `admin.members.hasMember({ groupKey, memberKey: userEmail })` for
   each group in that set, in parallel. That is 1 group in Phase 1 and 4
   from Phase 2.
   The result is exact for direct and nested membership, and Google evaluates
   nesting depth and cycles on its side.
3. Group memberships that are not in the authorization set are ignored.
   Everything the API needs to know is "which configured groups is this user
   in", so it never has to list, page through, or hold every group the user
   belongs to.

Phase 1 keeps the existing `groups.list` call as well, so `roles` and
`/user/hasgroup` keep their current behavior for groups outside the
authorization set. Configured groups already found in the direct list skip
their `hasMember` call. Phase 4 removes `groups.list` once the UI no longer
uses `/user/hasgroup`.

### 4.3 Credentials and least privilege

- **No change in Phase 1.** Reuse the runtime service account, its Groups
  Reader admin role, and the existing `admin.directory.group.readonly` scope.
- **Phase 4 narrowing (evaluate).** After `groups.list` is removed,
  `hasMember` alone works with `admin.directory.group.member.readonly`. The
  startup existence check (Section 4.6) also works under that scope if it uses
  `members.list` with `maxResults: 1`, discarding the result, instead of
  `groups.get`. Consider replacing Groups Reader with a custom Workspace admin
  role limited to reading group membership, if the Admin console allows that
  split.
- **Remove the end-user Directory scope** from the Swagger implicit flow
  (`swagger/swagger.js`) and the UI sign-in (sshf-ui `client.js`). End users
  then stop consenting to read directory groups they do not need.
- Keep using the service account's own admin role rather than domain-wide
  delegation.
- Never log tokens, private keys, or full Directory error bodies that could
  echo them. Logging group email, status code, and user email at `warn`
  level is acceptable. The current `logGroupFetchError` logs
  `error.response.data`; confirm that stays free of credentials.

### 4.4 Caching

- Keep the existing token-keyed user cache (15-minute TTL). It stores the
  resolved `roles` and, from Phase 2, `permissions`.
- Add a **membership cache keyed by lowercased user email** (Phase 1). A user
  who refreshes their token or has several tabs open should not trigger new
  Directory calls. TTLs:
  - positive result ("is a member"): at most `USER_CACHE_TTL_MS` (15
    minutes). This keeps the documented revocation bound.
  - negative result ("not a member"): about 2 minutes (approved), so a newly
    added volunteer is not locked out for 15 minutes after sign-in.
  - Membership entries are cached per (user email, group). The token-keyed
    user entry expires at the earliest of its membership entries, so a new
    grant appears within about 2 minutes without a new token. On that
    refresh, cached positive results are reused and only the groups the user
    was not in are checked again. For a typical WRITE-only user that is at
    most 3 `hasMember` calls about every 2 minutes while active, well within
    Admin SDK quota.
  - errors: never cached (same as today).
- Caches are per Cloud Run instance. That is acceptable because every entry is
  bounded by its TTL. No shared cache (Memorystore, CouchDB) is proposed.
- Google also takes time to propagate membership changes. The runbook should
  say "allow a few minutes, then sign in again".

### 4.5 Failure modes

| Condition | Behavior | Rationale |
|---|---|---|
| `hasMember` returns `{ isMember: true }` | Grant that group's role | |
| `hasMember` returns `{ isMember: false }` | No role from that group | |
| `404` (group not found, meaning a misconfigured email or a group deleted after startup) | Treat as not a member. Log an `error` naming the configured group env var, not the user | Fail closed. Startup validation (Section 4.6) catches typos at deploy time. This row covers a group deleted while instances are running |
| `400 Invalid input` (cross-domain nesting, or a user outside the domain) | Treat as not a member. Log a `warn` | Documented limit of `hasMember`. Not expected with SSHF's single domain and org-internal OAuth client |
| `403` from Google (service account lost Groups Reader or scope) | Treat as unavailable: `503` on Cloud Run | Configuration outage, not a user decision |
| `5xx`, timeout, or network error | Throw `DirectoryGroupsUnavailableError`: `503` on Cloud Run, no roles locally | Same as today's contract |
| Some groups succeed and others fail with 5xx | Whole lookup is unavailable (`503`) | Avoids granting a partial role set that later changes |
| Directory call hangs | Per-call timeout (proposed 5 seconds), then treated as unavailable | Prevents stuck requests |

Serving a last-known-good result during a Directory outage is **not**
proposed. It would extend access for removed users past the 15-minute bound.

### 4.6 Startup validation (approved: fail fast)

On Cloud Run (`K_SERVICE` set), the process validates authorization config
**before** `app.listen`, extending today's `validateGroupAuthorization`:

1. Parse the `AUTHZ_ROLE_*_GROUPS` variables (Section 5). An unknown role
   name, a malformed email, or an empty `AUTHZ_ROLE_FULL_GROUPS` (after the
   `ALLOWED_GROUP_EMAILS` alias is applied) exits with code 1.
2. Confirm every configured group exists with `admin.groups.get({ groupKey })`.
   This returns group metadata only, no member list, and works under the
   current scope and Groups Reader role. Run the checks in parallel with a
   bounded retry for transient errors (proposed: 3 attempts, exponential
   backoff, about 15 seconds total).
3. A `404` for any group exits with code 1. The log names the env var and the
   group email. Group emails are not secrets.
4. A `403` from Google, a `5xx`, or an unreachable Directory after the retries
   also exits with code 1.

Effect on the pipeline in `docs/DEPLOYMENT.md`:

- Dev source deploy: the new revision never becomes ready, the deploy fails,
  and traffic stays on the previous revision.
- Prod promotion: the no-traffic deploy or the smoke test fails, and traffic
  stays on the previous revision.

Accepted trade-off: the check also runs on every cold start and scale-out.
During a Google Directory outage, new instances cannot start. Instances that
are already running keep serving, but their authentication would return
`503` for cache misses during that outage anyway.

Local runs (no `K_SERVICE`) log warnings instead of exiting, so local
development without Directory credentials keeps working as it does today.

## 5. Env-configurable group → role mapping

One comma-separated env var per role. This matches the existing `parseList`
style and works with `gcloud run services update --update-env-vars` and
Secret Manager:

| Env var | Dev value | Prod value |
|---|---|---|
| `AUTHZ_ROLE_WRITE_GROUPS` | `sshf_app_dev_access@starsandstripeshonorflight.org` | `sshf_app_prd_access@starsandstripeshonorflight.org` |
| `AUTHZ_ROLE_FULL_GROUPS` | `sshf_app_dev_full_access@starsandstripeshonorflight.org` | `sshf_app_prd_full_access@starsandstripeshonorflight.org` |
| `AUTHZ_ROLE_MEDICAL_GROUPS` | `sshf_app_dev_medical_access@starsandstripeshonorflight.org` | `sshf_app_prd_medical_access@starsandstripeshonorflight.org` |
| `AUTHZ_ROLE_REVIEW_GROUPS` | `sshf_app_dev_review_access@starsandstripeshonorflight.org` | `sshf_app_prd_review_access@starsandstripeshonorflight.org` |

```bash
# Dev example (prod uses the sshf_app_prd_* groups on sshf-api-prd)
gcloud run services update sshf-api --region us-central1 --project sshf-api-dev \
  --update-env-vars "^;^AUTHZ_ROLE_WRITE_GROUPS=sshf_app_dev_access@starsandstripeshonorflight.org;AUTHZ_ROLE_FULL_GROUPS=sshf_app_dev_full_access@starsandstripeshonorflight.org;AUTHZ_ROLE_MEDICAL_GROUPS=sshf_app_dev_medical_access@starsandstripeshonorflight.org;AUTHZ_ROLE_REVIEW_GROUPS=sshf_app_dev_review_access@starsandstripeshonorflight.org"
```

Rules:

- `<ROLE>` must be one of `WRITE`, `FULL`, `MEDICAL`, `REVIEW`. On Cloud Run,
  any `AUTHZ_ROLE_*_GROUPS` variable with another role name **fails
  startup**, the same way `validateGroupAuthorization` fails today. Locally
  it logs a warning.
- Values are trimmed and lowercased, and each must look like an email.
- A group may map to more than one role. A role may list more than one group.
- On Cloud Run, `AUTHZ_ROLE_FULL_GROUPS` must be non-empty (after the alias
  below is applied), otherwise startup fails. This replaces today's
  `ALLOWED_GROUP_EMAILS` check. WRITE, MEDICAL, and REVIEW may be unset, but
  every group that is set must exist (Section 4.6).
- **Backward compatibility.** If `AUTHZ_ROLE_FULL_GROUPS` is unset,
  `ALLOWED_GROUP_EMAILS` is read as `AUTHZ_ROLE_FULL_GROUPS`. Existing dev
  and prod services keep working without an env change. The alias is removed
  in Phase 4 after both services are migrated.
- Group emails are not secrets, but they are also not sent to the client
  (Section 6).
- `docs/DEPLOYMENT.md` gets a table of role variables and the `gcloud`
  commands for dev and prod. `env.example` and the README table are updated
  in the same PR.

The alternative, a single JSON variable such as
`AUTHZ_GROUP_ROLES='{"FULL":[...]}'`, was rejected. It is harder to edit
safely in `gcloud` and the Cloud Run console, and a quoting mistake breaks
every role at once.

## 6. Permission summary contract for the UI

### 6.1 Endpoint

`GET /user/permissions`, added to `routes/user.js` next to `/user/hasgroup`,
with a serializer in `models/user_permissions.js`. It ships in **Phase 3**
together with per-endpoint enforcement, so the summary always matches what
the API actually enforces. In Phase 2, FULL members can still reach every
route, review included, so a Phase 2 summary would be misleading.

- Middleware: `authenticate` only. Like `/user/hasgroup`, it deliberately
  skips `requirePermission`, so a signed-in user with no roles gets `200`
  with empty permissions and the UI can show a "no access" screen instead of
  an error.
- Headers: `Cache-Control: no-store` (per-user authorization data).
- Status codes: `200`, `401` (missing, invalid, or wrong-audience token),
  `403` (email domain rejected by `ALLOWED_EMAIL_DOMAINS`), `503` (token
  introspection or Directory unavailable).

### 6.2 Response shape (`schemas/UserPermissions.yaml`)

```json
{
  "email": "jane.doe@starsandstripeshonorflight.org",
  "hasAccess": true,
  "roles": ["REVIEW", "WRITE"],
  "permissions": [
    "applications:accept",
    "applications:review",
    "exports:read",
    "records:read",
    "records:write"
  ],
  "evaluatedAt": "2026-10-01T15:04:05.000Z",
  "expiresAt": "2026-10-01T15:19:05.000Z"
}
```

| Field | Type | Meaning |
|---|---|---|
| `email` | string | The authenticated account, for display and support |
| `hasAccess` | boolean | `true` when `permissions` is non-empty. Lets the UI show the "no access" page with one check |
| `roles` | string[] (enum: `WRITE`, `FULL`, `MEDICAL`, `REVIEW`), sorted | Stable role IDs. They are the same in every environment |
| `permissions` | string[] (enum of permission names), sorted | The only field the UI should use for show/hide decisions |
| `evaluatedAt` | ISO 8601 string | When membership was resolved (cache fill time) |
| `expiresAt` | ISO 8601 string | When the server-side cache entry expires: the earliest membership expiry, so about 2 minutes when any group check was negative. The UI refetches after this |

Deliberately left out: group emails, and whether a membership is direct or
nested. The UI should never need group names again, and leaving them out
avoids telling any signed-in user which groups control access.

### 6.3 Refresh behavior

- The UI calls it after sign-in, after each token refresh, after
  `expiresAt`, and whenever an API call returns `403` with
  `requiredPermission`.
- The server result can be up to one TTL stale (15 minutes for a granted
  role, 2 minutes for a missing role, per Section 4.4). The API still
  enforces permissions on every request, so a stale UI can only show a
  control that then returns `403`. It cannot grant access.

### 6.4 How sshf-ui will consume it (Phase 4, not in this repo)

- Replace the `possibleRoles` / `api.hasGroup(...)` loop in
  `src/lib/auth/domain/client.js` with one `api.getPermissions()` call.
  Keep the existing `membershipProbeFailed` handling for `503`.
- Change `src/hooks/use-permissions.js` to expose `can(permission)`.
  `useHasFullAccess()` becomes a check on the relevant permissions. Nav
  filtering and `full-access-guard.js` switch to `can(...)`. Actions the user
  lacks permission for are hidden, and a `403` from the API is mapped to
  friendlier copy.
- Regenerate the zod schemas from `/openapi.json` with the existing
  `orval` setup (`npm run generate-schemas`).
- Remove `NEXT_PUBLIC_ROLE_FULL_ACCESS`, the end-user
  `admin.directory.group.readonly` sign-in scope, and the unused direct
  Directory call.

## 7. Phased delivery

Each phase is a separate PR. Every phase is backward compatible with the
UI that is deployed when it ships.

### Phase 0: Plan and admin prerequisites (this PR)

- Plan direction approved. Decisions are in Section 9.
- Domain and groups are confirmed: one domain, with four groups per
  environment (Section 5), owned and administered only by domain admins.
- Administrator: in **dev**, create a test group (for example
  `sshf_app_dev_nested_test@`), add it as a member of
  `sshf_app_dev_full_access@`, and add a test user **only** to the nested
  group. This is the live acceptance fixture for Phase 1.

### Phase 1: Honor nested membership for the existing full-access gate (first implementation)

This still matches the codebase. `ALLOWED_GROUP_EMAILS` holds exactly the
full-access group in each environment, and `authorize` is the only gate.

Goal: a user who is an indirect member of a group in `ALLOWED_GROUP_EMAILS`
passes `authorize` and gets `hasgroup: true` for that group. No new env vars,
IAM, scopes, or endpoints.

Migration path: the resolver takes a list of group emails. Phase 2 passes the
four role groups instead of `ALLOWED_GROUP_EMAILS`, with no change to the
nested-membership code.

Files likely to change:

- `utils/groups.js`: add `checkGroupMembership(userEmail, groupEmail, auth)`
  wrapping `admin.members.hasMember` with the failure mapping from Section
  4.5. Add `resolveAuthorizationGroups(userData, groupEmails, options)`,
  which runs checks in parallel and reuses the existing JWT/ADC fallback
  and Cloud Run / local split in `getGroupMemberships`.
- `utils/authenticate.js`: merge direct roles with nested matches for
  configured groups. Nested entries are added to `roles` with the group email
  (the internal shape may add `membership: 'direct' | 'nested'` for logging).
- `utils/user_cache.js` or a new `utils/membership_cache.js`: cache keyed by
  email with separate positive and negative TTLs.
- `index.js`: pass `getAllowedGroupEmails()` into the resolver. Route
  registration does not change.
- Docs: README "Authentication & Authorization", `docs/DEPLOYMENT.md`
  (troubleshooting row for nested groups and propagation delay),
  `env.example` comments, the `GoogleAuth` description in
  `swagger/swagger.js`, and the `/user/hasgroup` description in
  `routes/user.js`: "direct or nested for groups in `ALLOWED_GROUP_EMAILS`,
  direct only for other groups".

Tests first (mocha/chai/sinon, reusing the injection seams in
`test/groups.test.js` and `test/authenticate.test.js`):

- Nested member of a configured group: role added, `authorize` passes,
  `/user/hasgroup` returns `true`.
- Direct member: no `hasMember` call is made.
- Not a member: `403` (fail closed).
- `404` group not found: not a member, error logged with no token or user
  secrets.
- `400` invalid input: not a member, warning logged.
- `403` or `5xx` from Google, or a timeout: `503` on Cloud Run; empty roles
  locally (and still `403` locally when `ALLOWED_GROUP_EMAILS` is set).
- Multiple configured groups: checked in parallel, and any match passes.
- Mixed success and 5xx: `503`, not a partial grant.
- Membership cache: hit within TTL, negative TTL expiry, errors not cached.
- Case-insensitive group emails.
- Local run with `ALLOWED_GROUP_EMAILS` unset: no `hasMember` calls.

Acceptance criteria:

- All existing tests pass unchanged, and the new tests pass.
- In dev, the nested test user from Phase 0 can call a data route and gets
  `hasgroup: true` for `sshf_app_dev_full_access@`. The existing UI works
  with no UI change.
- No change to status codes or payload keys for existing clients.

### Phase 2: Roles WRITE, FULL, MEDICAL, REVIEW, env mapping, and startup validation

- `utils/permissions.js`: the role → permission catalog (Sections 3.1 and
  3.2), parsing of `AUTHZ_ROLE_{WRITE,FULL,MEDICAL,REVIEW}_GROUPS` with the
  `ALLOWED_GROUP_EMAILS` → FULL alias, and Cloud Run startup validation
  (Section 4.6). The validation replaces `assertGroupAuthorizationConfigured`
  and runs in `validateGroupAuthorization` before `app.listen`.
- `authenticate` resolves membership in all configured role groups (nested,
  through the Phase 1 resolver) and computes `req.user.roles` (role IDs) and
  `req.user.permissions` once per cache fill.
- **The enforcement gate does not change.** `authorize` still passes only for
  FULL, which is exactly today's `ALLOWED_GROUP_EMAILS` behavior. WRITE,
  MEDICAL, and REVIEW membership is resolved and tested but grants nothing
  yet. This lets admins set the new env vars and populate groups safely
  before Phase 3.
- `/user/hasgroup` keeps working for the full-access group.
- Admin sets the four `AUTHZ_ROLE_*_GROUPS` vars on dev, then prod (Section
  5). Until then, the alias keeps the current behavior.
- Tests: env parsing (an unknown role fails on Cloud Run, alias fallback,
  lowercasing, dedupe, FULL required), startup validation (`404` exits, a
  Directory outage exits after retries, local runs only warn), resolution of
  all four roles including nested membership, and the permission union.

### Phase 3: Per-endpoint enforcement and permission summary

- Add the `ROUTE_PERMISSIONS` table (Section 3.2) and
  `requirePermission(...)` on every protected route in `index.js`, replacing
  `authorize`. Confirm the FULL-only route list during this PR's review.
- `GET /user/permissions` plus `models/user_permissions.js` and
  `schemas/UserPermissions.yaml` (Section 6).
- Status codes and bodies follow the table in Section 3.3.
- Matrix test: walk the Express router stack and assert that every route
  except the explicit public list (`/openapi.json`, `/api-docs`,
  `POST /review/applications`, `/user/hasgroup`, `/user/permissions`) has
  `authenticate` followed by `requirePermission` with the permissions from
  the table.
- Role tests: WRITE can read, write, and export but gets `403` on delete,
  `/docs` writes, flight management, and review. FULL can do everything
  except review and medical. REVIEW can review and accept but gets `403` on
  logistics routes. MEDICAL alone gets `403` everywhere until medical
  endpoints exist.
- Endpoint contract tests for `/user/permissions`: `200` with empty
  permissions for a signed-in user with no role, `401`, `503`, and
  `Cache-Control: no-store`.
- OpenAPI: add `x-required-permission` and a documented `403` to each
  protected operation, with a test that these match `ROUTE_PERMISSIONS`.
- Minor version bump (new endpoint and new `403` cases).

**Rollout runbook, per environment (dev first, then prd):**

1. Before deploying Phase 3, add current application reviewers to
   `*_review_access`, and nest the BoD group in `*_access`. Everyone stays in
   `*_full_access` for now. In Phase 2 this changes nothing for users.
2. Deploy Phase 3. Check `GET /user/permissions` for a WRITE-only test user,
   a REVIEW user, and a FULL user.
3. **Only after the Phase 4 UI change is deployed in that environment**,
   remove most board members from `*_full_access`. They keep WRITE through
   the BoD group nested in `*_access`, and a few people stay in FULL. Until
   then, sshf-ui's `full-access-guard.js` shows "Not authorized" to anyone
   outside the full-access group, even when the API would allow them.

If step 1 is skipped, a FULL user who reviews applications loses review
access at deploy time, because FULL does not include REVIEW. Adding them to
`*_review_access` restores it within the cache TTL.

### Phase 4: UI migration and cleanup

- sshf-ui switches to `GET /user/permissions` (Section 6.4). It hides
  unauthorized actions and maps `403` to friendlier copy.
- sshf-api then deprecates `/user/hasgroup` (marked deprecated in OpenAPI
  for one release, then removed), removes `groups.list` and its paging code,
  evaluates narrowing the Directory scope (Section 4.3), removes the
  Directory scope from Swagger's implicit flow, and removes the
  `ALLOWED_GROUP_EMAILS` alias.

### Later (not scheduled)

- **MEDICAL endpoints:** design the endpoints and the `medical:*`
  permissions when medical data lands in the database. Decide then whether
  the existing medical-form and medical-review `PATCH` routes move from
  `records:write` to MEDICAL.
- **Optional read-only role:** move `POST`/`PUT`/`PATCH` routes behind a
  permission that a new read-only role lacks.
- **Error-shape cleanup:** unify `{ message }` and `{ error }`. This is lower
  priority than clear `403` semantics.

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Nesting widens who can grant access.** Anyone who can add members to a group nested inside an authorization group (for example the BoD group inside `*_access`) can grant app permissions | Privilege escalation outside IT control | **Accepted residual risk, mitigated by admin ownership.** Only domain admins own and administer the eight authorization groups **and every group nested in them**, including the BoD group. `docs/DEPLOYMENT.md` will state this as a standing requirement: no non-admin owners or managers, and "Who can join: only invited users" |
| Cross-domain nesting is not resolved by `hasMember` | A nested user from another domain is denied | Not applicable today (single domain, org-internal OAuth client). Fails closed with a warning log if it ever happens |
| Misconfigured or missing group email | Everyone mapped only through that group is denied | Startup validation fails the deploy (Section 4.6). A group deleted while instances are running is logged as an error at request time |
| Startup check blocks new instances during a Google Directory outage | No scale-out or cold starts until Google recovers | Accepted trade-off of failing fast. Running instances keep serving, and authentication would return `503` on cache misses in that outage anyway |
| Phase 3 cutover removes review access from FULL-only users | Reviewers locked out at deploy | Rollout runbook step 1 (Phase 3) populates `*_review_access` before deploy |
| Stale grants after removal | Up to 15 minutes of continued access | Existing documented bound, kept. No last-known-good serving during outages |
| Admin SDK quota or latency | Slower first request or `503` | Membership cache keyed by email, parallel checks, per-call timeout. There are only a few configured groups per user |
| Two sources of group names during migration (UI `NEXT_PUBLIC_ROLE_FULL_ACCESS` and API env) | UI and API disagree. The UI blocks WRITE-only users entirely | Phases 1 to 3 keep them equal (same value today). Board members are not moved out of `*_full_access` until the Phase 4 UI is deployed (Phase 3 runbook step 3). Phase 4 removes the UI copy |
| Per-instance caches on Cloud Run | Instances can briefly disagree | Bounded by TTL. Acceptable |
| Changing a `403` payload | Client error handling breaks | Keep the `{ message }` key. Only add `requiredPermission` |

## 9. Decisions (approved 2026-10-01)

| # | Topic | Decision |
|---|---|---|
| 1 | Domain and groups | Single Workspace domain, `starsandstripeshonorflight.org`. Four groups per environment map to the roles WRITE (`*_access`), FULL (`*_full_access`), MEDICAL (`*_medical_access`), and REVIEW (`*_review_access`). Exact emails are in Section 5. Cloud Identity transitive APIs are not needed |
| 2 | Roles and rollout | Today everyone is in full access. After rollout, most board members move to WRITE through BoD group nesting, and a few stay in FULL. Review endpoints require REVIEW, and review group membership is adjusted. MEDICAL endpoints and permissions come later. No read-only role now; one can be added later by tightening `POST`/`PUT`/`PATCH` permissions |
| 3 | Negative-cache TTL | About 2 minutes is acceptable |
| 4 | Error semantics | Standard HTTP: `401` for authentication and `403` for authorization, with clear reason text (Section 3.3). The UI maps these to friendlier copy and hides unauthorized actions. Unifying `{ message }`/`{ error }` is a separate, lower-priority cleanup |
| 5 | Config naming | `AUTHZ_ROLE_<ROLE>_GROUPS` with `<ROLE>` one of `WRITE`, `FULL`, `MEDICAL`, `REVIEW`. Group emails are environment-specific values |
| 6 | Startup validation | Yes. On Cloud Run, fail fast when a configured group is missing or Google is unreachable at startup (Section 4.6) |
| 7 | Group ownership | Only domain admins own and administer these groups and the nested grant path. Nesting-based grants are an accepted residual risk, mitigated by admin ownership (Section 8) |

### Remaining items to confirm during the phase PRs

- The exact FULL-only route list in Section 3.2: deletes, generic `/docs`
  writes, flight create/update, and batch flight assignment (Phase 3
  review).
- Whether any REVIEW-only users exist who also need `records:read` (for
  example, duplicate search before accepting), or whether all reviewers are
  also in `*_access` (Phase 3 review).
- The startup retry budget, proposed as 3 attempts over about 15 seconds
  (Phase 2 review).

## 10. Test strategy summary

- **Unit (mocha, chai, sinon):** Directory client fakes injected through the
  existing `createAdmin`, `createJwtAuth`, `createAdcAuth`, and
  `listGroups`-style options, with no network access. Cover the Section 4.5
  failure table row by row.
- **Middleware:** `createAuthenticator` with injected resolvers, as in
  `test/authenticate.test.js`, for `401`/`403`/`503` and cache behavior.
- **Route contract:** call handlers with stubbed `req`/`res` objects, as in
  `test/user.test.js`, for `/user/permissions`. The Phase 3 matrix walks
  `app._router.stack`, as `test/index.test.js` already does. No new test
  dependency is needed.
- **OpenAPI:** extend `test/swagger-specs.test.js` to assert the new schema,
  the documented status codes, and that `x-required-permission` matches
  `ROUTE_PERMISSIONS`.
- **Live check in dev:** the Phase 0 nested test user, plus a direct member
  and a non-member, after each phase deploys to dev.
- Coverage stays at the current level (`npm run coverage`). No change to the
  `.c8rc.json` include paths is expected.
