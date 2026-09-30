# Authorization by Group Membership: Design and Phased Plan

Status: **Proposed.** Awaiting approval before any implementation.
Tracking issue: [#130 Authorization by Group Membership](https://github.com/Stars-and-Stripes-Honor-Flight/sshf-api/issues/130)

This document is planning only. It does not change runtime behavior. Each
phase below ships as its own PR with tests, OpenAPI updates, and README /
`docs/DEPLOYMENT.md` / `env.example` updates, following the repository rules
in `.cursor/rules/`.

## 1. Requirements from issue #130

| # | Requirement | Where it is addressed |
|---|---|---|
| R1 | Membership counts whether the user is a **direct or indirect (nested)** member of a Workspace group | Section 4, Phase 1 |
| R2 | Specific authorization groups grant specific permissions in the app | Section 3, Phase 2 |
| R3 | Permissions allow or deny access to API endpoints; the API is the enforcer | Section 3.3, Phase 3 |
| R4 | Group names that grant permissions are configurable per deployment environment | Section 5, Phase 2 |
| R5 | The API exposes a summary of the current user's permission level for UI hints | Section 6, Phase 2 (API), Phase 4 (UI) |

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
`sshf_app_prd_full_access@…`.

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
  existing clients do not break. Unifying the keys is an open question
  (Section 9).
- `req.user.roles` is not part of any documented response schema. Only
  `authorize` and `routes/user.js` read it. Its internal shape can change
  without an API contract change.

## 3. Target model

```
Workspace groups (per environment, env config)
        │  direct OR nested membership (Admin SDK hasMember)
        ▼
Roles (stable IDs defined in code, e.g. full_access, read_only)
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

### 3.1 Permission catalog (proposed)

The names are grouped by the actual route surface in `index.js`:

| Permission | Endpoints |
|---|---|
| `records:read` | `GET /search`, `POST /query`, `GET /docs/:id`, `GET /docs/:id/revisions`, `GET /docs/:id/diff`, `GET /veterans/search`, `GET /veterans/:id`, `GET /guardians/:id`, `GET /flights`, `GET /flights/:id`, `GET /flights/:id/assignments`, `GET /flights/:id/detail`, `GET /waitlist`, `GET /waitlist/veteran-groups`, `GET /recent-activity` |
| `records:write` | `POST /docs`, `PUT /docs/:id`, `POST /veterans`, `PUT /veterans/:id`, `POST /guardians`, `PUT /guardians/:id`, every `PATCH /veterans/:id/*` and `PATCH /guardians/:id/*` field endpoint |
| `records:delete` | `DELETE /docs/:id`, `DELETE /veterans/:id`, `DELETE /guardians/:id` |
| `flights:manage` | `POST /flights`, `PUT /flights/:id`, `POST /flights/:id/assignments` |
| `exports:read` | `GET /exports/flight`, `GET /exports/callcenterfollowup`, `GET /exports/tourlead` |
| `applications:review` | `GET /review/applications`, `GET /review/applications/:id`, `PUT /review/applications/:id`, `PATCH /review/applications/:id/status` |
| `applications:accept` | `POST /review/applications/:id/accept` (also requires `records:write`, because it writes to the logistics database) |

The single-field `PATCH` endpoints (medical review, paid, mail call, apparel,
and so on) could later get narrower permissions such as `veterans:medical`
or `guardians:payment`. That split is deferred until SSHF names the
volunteer teams that need it (Section 9).

### 3.2 Role catalog (proposed starting point)

| Role ID | Permissions | Notes |
|---|---|---|
| `full_access` | all permissions | Equals today's behavior. The only role configured at the end of Phase 2 |
| `read_only` | `records:read` | Candidate for call-center lookups |
| `reviewer` | `records:read`, `applications:review`, `applications:accept`, `records:write` | Candidate for application intake volunteers |

Only `full_access` is required for rollout. Other roles are added when an
administrator creates the matching Workspace group and sets the env var.

### 3.3 Enforcement

- New `requirePermission(...permissions)` middleware in `utils/auth.js` reads
  `req.user.permissions` (computed once in `authenticate` and cached with the
  user). It returns `403` when any listed permission is missing.
- Route registration stays explicit and ordered per
  `auth-middleware-order.mdc`:
  `app.delete("/veterans/:id", authenticate, requirePermission('records:delete'), dbSession, deleteVeteran)`.
- A single `ROUTE_PERMISSIONS` table (method + path → permissions) is the
  source of truth. It is used by a matrix test and by the OpenAPI check below,
  so a new route cannot ship without a declared permission.
- `403` body stays in the existing auth shape and adds the missing permission,
  which is not sensitive and lets the UI explain the denial:
  `{ "message": "Forbidden: missing permission", "requiredPermission": "records:delete" }`.

## 4. Resolving direct and nested membership

### 4.1 Options considered

| Option | Nested? | Scope / privilege | Edition requirement | Verdict |
|---|---|---|---|---|
| A. Admin SDK `groups.list?userKey=` (today) | No, direct only | `admin.directory.group.readonly` + Groups Reader | Any | Insufficient on its own |
| B. Admin SDK `members.hasMember(groupKey, memberKey)` for each configured group | **Yes**, direct or nested. Nested checks require the user and group to be in the same domain, otherwise `400 Invalid input` | `admin.directory.group.member.readonly` is the narrowest accepted scope. The current `group.readonly` also works | Any Workspace edition | **Recommended** |
| C. Recursive `groups.list?userKey=<group email>` walking parent groups | Yes | Same as today | Any | Works, but costs many calls per level and needs cycle and depth handling. Keep as a fallback only |
| D. `members.list?includeDerivedMembership=true` to expand each configured group ahead of time | Yes | `group.member.readonly` | Any | Needs a background refresh job and memory for every member. Too heavy for Cloud Run scale-to-zero |
| E. Cloud Identity `checkTransitiveMembership` / `searchTransitiveGroups` | Yes, including cross-domain | `cloud-identity.groups.readonly` | **Workspace Enterprise Standard/Plus, Enterprise for Education, or Cloud Identity Premium only** | Blocked unless SSHF's edition qualifies (Section 9) |
| F. Domain-wide delegation impersonating an admin | n/a | Service account can act as any user | Any | Rejected. Far broader than needed |

### 4.2 Recommended approach (option B)

For each authenticated user on a cache miss:

1. Build the **authorization group set**: every group email that grants a
   role. In Phase 1 this is `ALLOWED_GROUP_EMAILS`. From Phase 2 it is the
   union of all `AUTHZ_ROLE_*_GROUPS` values.
2. Call `admin.members.hasMember({ groupKey, memberKey: userEmail })` for
   each group in that set, in parallel. There are usually only 1 to 5 groups.
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
- **Phase 4 narrowing.** After `groups.list` is removed, request only
  `admin.directory.group.member.readonly`. Consider replacing Groups Reader
  with a custom Workspace admin role limited to reading group membership, if
  the Admin console allows that split.
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
  Directory calls. Proposed TTLs:
  - positive result ("is a member"): at most `USER_CACHE_TTL_MS` (15
    minutes). This keeps the documented revocation bound.
  - negative result ("not a member"): 2 minutes, so a newly added volunteer
    is not locked out for 15 minutes after sign-in.
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
| `404` (group not found, meaning a misconfigured email) | Treat as not a member. Log an `error` naming the configured group env var, not the user | Fail closed. A typo must be visible in logs |
| `400 Invalid input` (cross-domain nesting, or a user outside the domain) | Treat as not a member. Log a `warn` | Documented limit of `hasMember` |
| `403` from Google (service account lost Groups Reader or scope) | Treat as unavailable: `503` on Cloud Run | Configuration outage, not a user decision |
| `5xx`, timeout, or network error | Throw `DirectoryGroupsUnavailableError`: `503` on Cloud Run, no roles locally | Same as today's contract |
| Some groups succeed and others fail with 5xx | Whole lookup is unavailable (`503`) | Avoids granting a partial role set that later changes |
| Directory call hangs | Per-call timeout (proposed 5 seconds), then treated as unavailable | Prevents stuck requests |

Serving a last-known-good result during a Directory outage is **not**
proposed. It would extend access for removed users past the 15-minute bound.

## 5. Env-configurable group → role mapping

One comma-separated env var per role. This matches the existing `parseList`
style and works with `gcloud run services update --update-env-vars` and
Secret Manager:

```bash
AUTHZ_ROLE_FULL_ACCESS_GROUPS=sshf_app_dev_full_access@starsandstripeshonorflight.org
AUTHZ_ROLE_READ_ONLY_GROUPS=sshf_app_dev_read_only@starsandstripeshonorflight.org
AUTHZ_ROLE_REVIEWER_GROUPS=sshf_app_dev_reviewers@starsandstripeshonorflight.org
```

Rules:

- The role name in the variable must be a known role ID
  (`AUTHZ_ROLE_<ROLE_ID uppercased>_GROUPS`). On Cloud Run, any
  `AUTHZ_ROLE_*_GROUPS` variable with an unknown role name **fails startup**,
  the same way `validateGroupAuthorization` fails today. Locally it logs a
  warning.
- Values are trimmed and lowercased, and each must look like an email.
- A group may map to more than one role. A role may list more than one group.
- On Cloud Run at least one role must have at least one group, otherwise
  startup fails. This replaces today's `ALLOWED_GROUP_EMAILS` check.
- **Backward compatibility.** If no `AUTHZ_ROLE_*_GROUPS` is set,
  `ALLOWED_GROUP_EMAILS` is read as `AUTHZ_ROLE_FULL_ACCESS_GROUPS`. Existing
  dev and prod services keep working without an env change. The alias is
  removed in Phase 4 after both services are migrated.
- Group emails are not secrets, but they are also not sent to the client
  (Section 6).
- `docs/DEPLOYMENT.md` gets a table of role variables and the `gcloud`
  commands for dev and prod. `env.example` and the README table are updated
  in the same PR.

The alternative, a single JSON variable such as
`AUTHZ_GROUP_ROLES='{"full_access":[...]}'`, was rejected. It is harder to edit
safely in `gcloud` and the Cloud Run console, and a quoting mistake breaks
every role at once.

## 6. Permission summary contract for the UI

### 6.1 Endpoint

`GET /user/permissions`, added to `routes/user.js` next to `/user/hasgroup`,
with a serializer in `models/user_permissions.js`.

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
  "roles": ["full_access"],
  "permissions": [
    "applications:accept",
    "applications:review",
    "exports:read",
    "flights:manage",
    "records:delete",
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
| `roles` | string[] (enum of role IDs) | Stable role IDs. They are the same in every environment |
| `permissions` | string[] (enum of permission names), sorted | The only field the UI should use for show/hide decisions |
| `evaluatedAt` | ISO 8601 string | When membership was resolved (cache fill time) |
| `expiresAt` | ISO 8601 string | When the server-side cache entry expires. The UI refetches after this |

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
  filtering and `full-access-guard.js` switch to `can(...)`.
- Regenerate the zod schemas from `/openapi.json` with the existing
  `orval` setup (`npm run generate-schemas`).
- Remove `NEXT_PUBLIC_ROLE_FULL_ACCESS`, the end-user
  `admin.directory.group.readonly` sign-in scope, and the unused direct
  Directory call.

## 7. Phased delivery

Each phase is a separate PR. Every phase is backward compatible with the
UI that is deployed when it ships.

### Phase 0: Plan and admin prerequisites (this PR)

- Approve this document or amend it.
- Administrator: in **dev**, create a test group (for example
  `sshf_app_dev_nested_test@`), add it as a member of
  `sshf_app_dev_full_access@`, and add a test user **only** to the nested
  group. This is the live acceptance fixture for Phase 1.
- Confirm the Workspace edition (it decides whether option E is ever
  available) and whether more than one domain is in use.

### Phase 1: Honor nested membership for the existing gate (first implementation)

Goal: a user who is an indirect member of a group in `ALLOWED_GROUP_EMAILS`
passes `authorize` and gets `hasgroup: true` for that group. No new env vars,
IAM, scopes, or endpoints.

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

### Phase 2: Role catalog, env mapping, and permission summary endpoint

- `utils/permissions.js`: role → permission catalog, `AUTHZ_ROLE_*_GROUPS`
  parsing with the `ALLOWED_GROUP_EMAILS` alias, and startup validation that
  replaces `assertGroupAuthorizationConfigured`.
- `authenticate` computes `req.user.permissions` once per cache fill.
- `GET /user/permissions` plus `models/user_permissions.js` and
  `schemas/UserPermissions.yaml` (Section 6).
- `authorize` becomes "has at least one permission". With only
  `full_access` configured, behavior is unchanged.
- Tests: env parsing (unknown role fails on Cloud Run, alias fallback,
  lowercase, dedupe), permission union, endpoint contract (`200` with empty
  permissions for a signed-in non-member, `401`, `503`, `Cache-Control`), and
  OpenAPI schema presence in `test/swagger-specs.test.js`.
- Minor version bump (new endpoint).

### Phase 3: Per-endpoint enforcement

- Add the `ROUTE_PERMISSIONS` table (Section 3.1) and
  `requirePermission(...)` on every protected route in `index.js`, replacing
  `authorize`.
- Matrix test: walk the Express router stack and assert that every route
  except the explicit public list (`/openapi.json`, `/api-docs`,
  `POST /review/applications`, `/user/hasgroup`, `/user/permissions`) has
  `authenticate` followed by `requirePermission` with the permissions from
  the table.
- For each role, test at least one allowed and one denied endpoint per
  permission.
- OpenAPI: add `x-required-permission` and a documented `403` to each
  protected operation, with a test that these match `ROUTE_PERMISSIONS`.
- Admin then creates additional groups (for example
  `sshf_app_{dev,prd}_read_only@`) and sets their env vars to turn on the
  new roles. Until then, only `full_access` exists and nothing changes for
  users.

### Phase 4: UI migration and cleanup

- sshf-ui switches to `GET /user/permissions` (Section 6.4).
- sshf-api then deprecates `/user/hasgroup` (marked deprecated in OpenAPI
  for one release, then removed), removes `groups.list` and its paging code,
  narrows the Directory scope to `admin.directory.group.member.readonly`,
  removes the Directory scope from Swagger's implicit flow, and removes the
  `ALLOWED_GROUP_EMAILS` alias.

## 8. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| **Nesting widens who can grant access.** Anyone who can add members to a group nested inside an authorization group (group owners and managers, or "anyone in the organization can join" settings) can grant app permissions | Privilege escalation outside IT control | Document that authorization groups **and every group nested in them** must be admin-managed with "Who can join: only invited users". Review nested group settings before Phase 1 goes to prod. Consider applying Workspace's Security label to authorization groups (confirm what it restricts for SSHF's edition) |
| Cross-domain nesting is not resolved by `hasMember` | Nested user from another domain is denied | Documented limit. Fails closed with a warning log. Option E if the edition ever qualifies |
| Misconfigured group email | Everyone mapped only through that group is denied | `404` logged as an error naming the env var. Deployment checklist in `docs/DEPLOYMENT.md` |
| Stale grants after removal | Up to 15 minutes of continued access | Existing documented bound, kept. No last-known-good serving during outages |
| Admin SDK quota or latency | Slower first request or `503` | Membership cache keyed by email, parallel checks, per-call timeout. There are only a few configured groups per user |
| Two sources of group names during migration (UI `NEXT_PUBLIC_ROLE_FULL_ACCESS` and API env) | UI and API disagree | Phase 1 keeps them equal (same value today). Phase 4 removes the UI copy |
| Per-instance caches on Cloud Run | Instances can briefly disagree | Bounded by TTL. Acceptable |
| Changing a `403` payload | Client error handling breaks | Keep the `{ message }` key. Only add `requiredPermission` |

## 9. Open questions for approval

1. **Workspace edition and domains.** Which edition does SSHF have
   (nonprofit editions usually do not include the Cloud Identity transitive
   APIs)? Is everything on `starsandstripeshonorflight.org`, or are alias or
   secondary domains in use?
2. **Initial roles.** Is `full_access` alone enough to start, with
   `read_only` and `reviewer` as the next two? Which volunteer teams need the
   narrower field-level `PATCH` permissions, if any?
3. **Negative-cache TTL.** Is 2 minutes acceptable for "just added to the
   group, signing in now"?
4. **Error payload keys.** Keep auth-layer errors as `{ message }` and route
   errors as `{ error }`, or unify in a separate, versioned change?
5. **Env var naming.** Is `AUTHZ_ROLE_<ROLE>_GROUPS` acceptable, or is
   another prefix preferred?
6. **Startup group check.** Should startup also verify that every configured
   group exists (one Directory call per group at boot)? The trade-off is that
   a Directory outage would then block deploys. The proposal is to log
   request-time `404`s only.

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
