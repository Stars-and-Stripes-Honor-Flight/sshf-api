# App-wide rate limiting: implementation plan

Covers [#153 Add app-wide rate limiting (CodeQL js/missing-rate-limiting)](https://github.com/Stars-and-Stripes-Honor-Flight/sshf-api/issues/153).

**Status:** approved by Steve on 2026-11-04. The decisions in Section 10
stand. This document is the plan. Line numbers refer to `main` at
`526d2dd`. Code blocks are sketches for the implementation PR. `index.js`,
the deploy workflows, `docs/DEPLOYMENT.md`, `README.md`, and `env.example`
stay unchanged until that PR. Phase 1 adds the Section 8 tests and a stub
`utils/rate_limit.js` that throws `not implemented`.

## Summary

| Piece | What it does | Clears CodeQL? |
|---|---|---|
| `app.set('trust proxy', 1)` | `req.ip` is the real client IP behind the Cloud Run front end | No (prerequisite) |
| Global pre-auth IP limiter | Counts only `401` responses per IP. Default 50 per 15 minutes | **Yes**, mounted ahead of every route |
| Optional IP flood ceiling | Counts every request per IP. Default 2,000 per minute | Yes (redundant) |
| Per-user limiter | Runs right after a successful `authenticate`, keyed on `req.user.email`. Default 300 per minute | No (defense against a runaway client or stolen token) |
| Cloud Run max instances | dev 2, prd 5, set in both deploy workflows | No (caps cost and per-instance limit multiplication) |

All limiters use `express-rate-limit` **8.7.3** (pinned exactly), the in-memory
store, `429` with standard headers, and env-configurable limits.

---

## 1. Why every route is flagged

CodeQL's `js/missing-rate-limiting` treats a route handler as expensive when
it performs authorization, file-system access, a system command, or database
access, and it accepts a route as covered only when a recognized limiter
middleware runs ahead of it
([MissingRateLimiting.qll](https://github.com/github/codeql/blob/main/javascript/ql/lib/semmle/javascript/security/dataflow/MissingRateLimiting.qll)).
Every data route runs `authenticate` and `requireRoutePermission`, so every
route trips the query. Alert #70 (`index.js:168`, on the `dbSession`
argument of `PATCH /veterans/:id/mail-call-notes`) is one instance. Earlier
per-route alerts were dismissed as Won't fix pointing at this issue.

Recognized limiters: `express-rate-limit`, `express-brute`,
`express-limiter`, `rate-limiter-flexible` (a `consume` call), and the
Fastify limiters. A custom limiter is not recognized.

## 2. Real impact (brief)

- **No database, Directory, or userinfo work before a valid token.** Every
  data route is `authenticate → requireRoutePermission → dbSession`
  ([index.js:146-232](../index.js#L146-L232)). `dbSession` uses one shared
  CouchDB login, refreshed at most every 3 minutes
  ([utils/db.js:4](../utils/db.js#L4)).
- **What an unauthenticated caller can cost:** a missing or malformed header
  is rejected locally. An unknown token costs one HTTPS call to Google
  `tokeninfo` ([utils/authenticate.js:61](../utils/authenticate.js#L61)),
  and failures are not cached. Userinfo and Admin SDK `members.hasMember`
  run only after the audience check
  ([utils/authenticate.js:72-105](../utils/authenticate.js#L72-L105)), so
  only tokens minted for this app's OAuth client reach them. The intake
  route downloads Google certs on every request (Section 6).
- **Residual risks:** a stolen token or compromised account (data scraping
  through `/query`, `/exports/*`, `/docs/:id`. A revoked token stays valid
  for up to 15 minutes because of the sign-in cache). A runaway UI loop from
  a legitimate user, which goes straight to CouchDB. Cloud Run autoscaling
  turning either one, or a flood of bad tokens, into cost. The Google
  default is 100 max instances per revision
  ([docs](https://cloud.google.com/run/docs/configuring/max-instances)).
  The per-user limiter and the max-instances cap address these. The
  pre-auth limiter mainly clears CodeQL at near-zero user impact.

## 3. Routes covered

Every method route in `index.js` (64), in mount order. Chain key:
**A** `authenticate`, **P** `requireRoutePermission(...)`, **D** `dbSession`,
**R** `reviewDbSession`, **I** `authenticateIntake`.

After this change, every row is preceded by `cors → preAuthLimiter →
(floodLimiter)` from `app.use`, and every **A** also runs the per-user limiter
on success. Rows 1-64 are all covered by the pre-auth limiter. Row 59 (the
intake route) is the only one without **A**, so it has no per-user limiter
(Section 5.4).

| # | Line | Route | Chain | Handler |
|---|---|---|---|---|
| 1 | [146](../index.js#L146) | `GET /user/permissions` | A | `getUserPermissions` |
| 2 | [147](../index.js#L147) | `GET /search` | A P D | `getSearch` |
| 3 | [149](../index.js#L149) | `POST /query` | A P D | `postQuery` |
| 4 | [152](../index.js#L152) | `GET /docs/:id/revisions` | A P D | `listDocumentRevisions` |
| 5 | [153](../index.js#L153) | `GET /docs/:id/diff` | A P D | `diffDocument` |
| 6 | [154](../index.js#L154) | `POST /docs` | A P D | `createDocument` |
| 7 | [155](../index.js#L155) | `GET /docs/:id` | A P D | `retrieveDocument` |
| 8 | [156](../index.js#L156) | `PUT /docs/:id` | A P D | `updateDocument` |
| 9 | [157](../index.js#L157) | `DELETE /docs/:id` | A P D | `deleteDocument` |
| 10 | [160](../index.js#L160) | `POST /veterans` | A P D | `createVeteran` |
| 11 | [161](../index.js#L161) | `GET /veterans/search` | A P D | `searchUnpairedVeterans` |
| 12 | [162](../index.js#L162) | `GET /veterans/:id` | A P D | `retrieveVeteran` |
| 13 | [163](../index.js#L163) | `PUT /veterans/:id` | A P D | `updateVeteran` |
| 14 | [164](../index.js#L164) | `PATCH /veterans/:id/seat` | A P D | `updateVeteranSeat` |
| 15 | [165](../index.js#L165) | `PATCH /veterans/:id/bus` | A P D | `updateVeteranBus` |
| 16 | [166](../index.js#L166) | `PATCH /veterans/:id/mail-call-received` | A P D | `updateVeteranMailCallReceived` |
| 17 | [167](../index.js#L167) | `PATCH /veterans/:id/mail-call-adopt` | A P D | `updateVeteranMailCallAdopt` |
| 18 | [168](../index.js#L168) | `PATCH /veterans/:id/mail-call-notes` | A P D | `updateVeteranMailCallNotes` |
| 19 | [169](../index.js#L169) | `PATCH /veterans/:id/medical-form` | A P D | `updateVeteranMedicalForm` |
| 20 | [170](../index.js#L170) | `PATCH /veterans/:id/medical-review` | A P D | `updateVeteranMedicalReview` |
| 21 | [171](../index.js#L171) | `PATCH /veterans/:id/vaccinated` | A P D | `updateVeteranVaccinated` |
| 22 | [172](../index.js#L172) | `PATCH /veterans/:id/homecoming-destination` | A P D | `updateVeteranHomecomingDestination` |
| 23 | [173](../index.js#L173) | `PATCH /veterans/:id/apparel-shirt-size` | A P D | `updateVeteranApparelShirtSize` |
| 24 | [174](../index.js#L174) | `PATCH /veterans/:id/apparel-jacket-size` | A P D | `updateVeteranApparelJacketSize` |
| 25 | [175](../index.js#L175) | `PATCH /veterans/:id/apparel-notes` | A P D | `updateVeteranApparelNotes` |
| 26 | [176](../index.js#L176) | `DELETE /veterans/:id` | A P D | `deleteVeteran` |
| 27 | [179](../index.js#L179) | `POST /guardians` | A P D | `createGuardian` |
| 28 | [180](../index.js#L180) | `GET /guardians/:id` | A P D | `retrieveGuardian` |
| 29 | [181](../index.js#L181) | `PUT /guardians/:id` | A P D | `updateGuardian` |
| 30 | [182](../index.js#L182) | `PATCH /guardians/:id/seat` | A P D | `updateGuardianSeat` |
| 31 | [183](../index.js#L183) | `PATCH /guardians/:id/bus` | A P D | `updateGuardianBus` |
| 32 | [184](../index.js#L184) | `PATCH /guardians/:id/training-notes` | A P D | `updateGuardianTrainingNotes` |
| 33 | [185](../index.js#L185) | `PATCH /guardians/:id/training-complete` | A P D | `updateGuardianTrainingComplete` |
| 34 | [186](../index.js#L186) | `PATCH /guardians/:id/waiver` | A P D | `updateGuardianWaiver` |
| 35 | [187](../index.js#L187) | `PATCH /guardians/:id/training-see-doc` | A P D | `updateGuardianTrainingSeeDoc` |
| 36 | [188](../index.js#L188) | `PATCH /guardians/:id/vaccinated` | A P D | `updateGuardianVaccinated` |
| 37 | [189](../index.js#L189) | `PATCH /guardians/:id/medical-form` | A P D | `updateGuardianMedicalForm` |
| 38 | [190](../index.js#L190) | `PATCH /guardians/:id/paid` | A P D | `updateGuardianPaid` |
| 39 | [191](../index.js#L191) | `PATCH /guardians/:id/books-ordered` | A P D | `updateGuardianBooksOrdered` |
| 40 | [192](../index.js#L192) | `PATCH /guardians/:id/apparel-shirt-size` | A P D | `updateGuardianApparelShirtSize` |
| 41 | [193](../index.js#L193) | `PATCH /guardians/:id/apparel-jacket-size` | A P D | `updateGuardianApparelJacketSize` |
| 42 | [194](../index.js#L194) | `PATCH /guardians/:id/apparel-notes` | A P D | `updateGuardianApparelNotes` |
| 43 | [195](../index.js#L195) | `DELETE /guardians/:id` | A P D | `deleteGuardian` |
| 44 | [198](../index.js#L198) | `GET /flights` | A P D | `listFlights` |
| 45 | [199](../index.js#L199) | `POST /flights` | A P D | `createFlight` |
| 46 | [200](../index.js#L200) | `GET /flights/:id` | A P D | `retrieveFlight` |
| 47 | [201](../index.js#L201) | `PUT /flights/:id` | A P D | `updateFlight` |
| 48 | [202](../index.js#L202) | `POST /flights/:id/complete` | A P D | `completeFlight` |
| 49 | [203](../index.js#L203) | `POST /flights/future-status/activate` | A P D | `activateFutureStatus` |
| 50 | [206](../index.js#L206) | `GET /flights/:id/assignments` | A P D | `getFlightAssignments` |
| 51 | [207](../index.js#L207) | `POST /flights/:id/assignments` | A P D | `addVeteransToFlight` |
| 52 | [210](../index.js#L210) | `GET /flights/:id/detail` | A P D | `getFlightDetail` |
| 53 | [213](../index.js#L213) | `GET /waitlist` | A P D | `getWaitlist` |
| 54 | [214](../index.js#L214) | `GET /waitlist/veteran-groups` | A P D | `getWaitlistVeteranGroups` |
| 55 | [217](../index.js#L217) | `GET /recent-activity` | A P D | `getRecentActivity` |
| 56 | [220](../index.js#L220) | `GET /exports/flight` | A P D | `exportFlightCsv` |
| 57 | [221](../index.js#L221) | `GET /exports/callcenterfollowup` | A P D | `exportCallCenterFollowUpCsv` |
| 58 | [222](../index.js#L222) | `GET /exports/tourlead` | A P D | `exportTourLeadCsv` |
| 59 | [226](../index.js#L226) | `POST /review/applications` | I R | `createReviewApplication` |
| 60 | [227](../index.js#L227) | `GET /review/applications` | A P R | `listReviewApplications` |
| 61 | [228](../index.js#L228) | `GET /review/applications/:id` | A P R | `retrieveReviewApplication` |
| 62 | [229](../index.js#L229) | `PUT /review/applications/:id` | A P R | `updateReviewApplication` |
| 63 | [230](../index.js#L230) | `PATCH /review/applications/:id/status` | A P R | `updateReviewApplicationStatus` |
| 64 | [232](../index.js#L232) | `POST /review/applications/:id/accept` | A P D R | `acceptReviewApplication` |

Also mounted, and not expected to be flagged (no expensive action):
`GET /openapi.json` ([235](../index.js#L235)) and the `/api-docs` Swagger UI
mount ([240](../index.js#L240)). Both sit behind the global limiters anyway
(decision 4).

## 4. Configuration

| Env var | Default | Meaning |
|---|---|---|
| `RATE_LIMIT_AUTH_FAILURE_MAX` | `50` | `401` responses per IP per window before `429` |
| `RATE_LIMIT_AUTH_FAILURE_WINDOW_MS` | `900000` (15 min) | Window for the above |
| `RATE_LIMIT_IP_FLOOD_MAX` | `2000` | All requests per IP per window. `off` means not mounted |
| `RATE_LIMIT_IP_FLOOD_WINDOW_MS` | `60000` (1 min) | Window for the above |
| `RATE_LIMIT_USER_MAX` | `300` | Requests per signed-in user per window |
| `RATE_LIMIT_USER_WINDOW_MS` | `60000` (1 min) | Window for the above |

- Values must be positive integers. A bad value logs a startup warning and
  uses the default. `0` is never passed to the library, because
  `express-rate-limit` 7+ treats `limit: 0` as "block everything".
- Limits are **per instance** (in-memory store). With max instances 5 the
  worst-case effective limit is 5× the configured value. A shared store is
  not needed at this size.
- `RATE_LIMIT_DISABLED=true` skips all limiters **only off Cloud Run** (no
  `K_SERVICE`), the same rule as `AUTHZ_DEV_OVERRIDE_ROLES`. It is ignored
  with a warning on Cloud Run.
- Defaults and env names go in `env.example` and the README env table.

## 5. Design

### 5.1 Trust proxy and verifying `req.ip`

Cloud Run's front end appends the caller's address to `X-Forwarded-For`.
`app.set('trust proxy', 1)` goes right after `const app = express()`, so
`req.ip` is the rightmost entry. Do not use `true`: `express-rate-limit`
throws `ERR_ERL_PERMISSIVE_TRUST_PROXY` for it, and it would let a client
spoof its IP. Leaving the setting `false` triggers
`ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` on Cloud Run.

Verify in dev, with no new endpoint:

1. Temporarily set `RATE_LIMIT_AUTH_FAILURE_MAX=3` on `sshf-api-dev`.
2. Send four requests with `Authorization: Bearer bogus`, two of them with a
   spoofed `X-Forwarded-For: 203.0.113.9`.
3. The fourth returns `429`. The limiter's log line (Section 5.5) must show
   your real IP, matching `httpRequest.remoteIp` in the Cloud Run request
   log, and never `203.0.113.9`. Then remove the override.

### 5.2 Global pre-auth IP limiter (clears CodeQL)

```js
import { rateLimit } from 'express-rate-limit';

app.set('trust proxy', 1);
app.use(cors(buildCorsOptions()));   // stays first, so a 429 carries CORS headers
                                     // and preflights end before any limiter
const rl = readRateLimitConfig();    // utils/rate_limit.js
app.use(rateLimit({
    ...baseLimiterOptions(rl, 'auth-failure'),
    windowMs: rl.authFailure.windowMs,
    limit: rl.authFailure.max,
    skipSuccessfulRequests: true,
    requestWasSuccessful: (req, res) => res.statusCode !== 401
}));
if (rl.flood) {
    app.use(rateLimit({ ...baseLimiterOptions(rl, 'ip-flood'), windowMs: rl.flood.windowMs, limit: rl.flood.max }));
}
// ...existing routes from line 146 unchanged
```

- `rateLimit(...)` is called **directly in `index.js`**. The options come
  from a helper, but the call stays where CodeQL's `moduleImport` model sees
  it without having to trace through a factory.
- Only `401` counts. `403` (a valid token without the permission), `404`,
  and validation errors do not, so volunteers on shared event Wi-Fi are not
  penalized for each other's normal use.
- Known behavior: the library counts a request when it arrives and gives the
  count back when the response is not a `401`. More than 50 **concurrent**
  in-flight requests from one IP on one instance could briefly see `429`
  (decision 1).
- Default key: `req.ip`, with IPv6 grouped by /56 (the library default).

### 5.3 Per-user limiter after `authenticate`

`route_permissions.test.js` requires `requirePermission` immediately after a
layer named `authenticate`. So the limiter is not added to 63 route lines.
Instead, `index.js` wraps the authenticator once:

```js
const verifyGoogleUser = createAuthenticator({ /* unchanged */ });
const userLimiter = rateLimit({
    ...baseLimiterOptions(rl, 'user'),
    windowMs: rl.user.windowMs,
    limit: rl.user.max,
    keyGenerator: (req) => userRateLimitKey(req)   // lowercased req.user.email, else ipKeyGenerator(req.ip)
});
const authenticate = withUserRateLimit(verifyGoogleUser, userLimiter); // returns a function named "authenticate"
```

- `withUserRateLimit` runs the user limiter only when `verifyGoogleUser`
  calls `next()`. A `401`, `403`, or `503` from auth never reaches it. Cached
  sign-ins are counted too.
- Every **A** route, including `GET /user/permissions`, gets it with no
  route-line edits.
- 300 per minute (5 per second sustained) is well above a fast inline roster
  edit burst of about 2-3 PATCHes per second plus reloads. That figure is an
  estimate, not measured from logs.

### 5.4 Intake service-account route

`POST /review/applications` ([226](../index.js#L226)) uses
`authenticateIntake`, not `authenticate`, so it has no per-user limiter. It
is covered by the global pre-auth limiter, which clears its CodeQL alert,
and by the flood ceiling. The `hf_appcollector` Cloud Function presents a
valid ID token, gets `201`, and never counts. A misconfigured function that
keeps getting `401` is cut off after 50 per 15 minutes per egress IP, which
is an acceptable signal.

### 5.5 `429` response

- Status `429`, body `{ "message": "Too many requests. Please wait and try again." }`,
  which matches the existing `{ message }` error shape.
- `standardHeaders: 'draft-8'` (`RateLimit-Policy`, `RateLimit`),
  `legacyHeaders: false`, and `Retry-After` on blocked responses.
- `handler` logs one line per block: `Rate limit <name> exceeded for key <key>`.
  The key is an IP or a user email. Tokens are never logged.
- The library's built-in validations stay on.

### 5.6 Max instances

Check live values first, because the console may already set them:

```sh
gcloud run services describe sshf-api --region us-central1 --project sshf-api-dev \
  --format='value(spec.template.metadata.annotations."autoscaling.knative.dev/maxScale",spec.template.spec.containerConcurrency)'
# repeat with --project sshf-api-prd
```

Then add `flags: '--max-instances=2'` to the deploy step in
`.github/workflows/cloudrun-source.yml` (dev), and
`flags: '--max-instances=5'` to the `no_traffic` deploy step in
`.github/workflows/cloudrun-promote-prd.yml`. Both use the action's
[`flags`](https://github.com/google-github-actions/deploy-cloudrun/blob/v3/action.yml)
input. Concurrency stays at whatever the services use today (the Google
default is 80).

`docs/DEPLOYMENT.md` gets a **Scaling and rate limits** subsection under
"Configuration and secrets": the max-instances values and where they are
set, the `describe` command above, the env table from Section 4, and the
`req.ip` check from Section 5.1. It also gets a Troubleshooting row for
unexpected `429`s.

## 6. Out of scope

- **Intake `OAuth2Client` reuse.** `defaultVerifyIdToken` builds a new client
  on every request ([utils/intake_auth.js:57-60](../utils/intake_auth.js#L57-L60)),
  so Google's signing certs are downloaded again on every intake call, even
  for a garbage token. This becomes a separate small follow-up issue.
- Non-rate-limit CodeQL alerts (including the GitHub Actions workflow scan).
  They are handled individually.

## 7. Files the implementation PR would touch

| File | Change |
|---|---|
| `package.json`, `package-lock.json` | `"express-rate-limit": "8.7.3"` (exact) |
| `utils/rate_limit.js` (new) | `readRateLimitConfig`, `baseLimiterOptions`, `userRateLimitKey`, `withUserRateLimit`, startup warnings |
| `index.js` | trust proxy, the global limiter mounts, the wrapped `authenticate` |
| `.github/workflows/cloudrun-source.yml`, `cloudrun-promote-prd.yml` | `--max-instances` flags |
| `docs/DEPLOYMENT.md`, `README.md`, `env.example` | Section 4 and Section 5.6 docs |
| `test/rate_limit.test.js` (new), `test/index.test.js`, `test/route_permissions.test.js` | Section 8 |

Phase 1 creates those test files and a stub `utils/rate_limit.js`. The
implementation PR makes the tests pass.

## 8. Test plan

Baseline: **1,710 passing** on `526d2dd` (`npm test`). The count only goes up.
No existing test is edited to make it pass. Existing route tests call
handlers directly through `app._router.stack`, so global limiters do not
affect them. Coverage stays at 100% statements and lines for application
code.

**New `test/rate_limit.test.js`.** Each test builds a throwaway Express app on
port 0 and uses Node's built-in `fetch`, so no new dev dependency is needed.
Each test gets its own limiter instance.

- Config: defaults, env overrides, bad or zero values fall back with a
  warning, `off` disables the flood limiter, and `RATE_LIMIT_DISABLED`
  works locally and is ignored with `K_SERVICE` set.
- Pre-auth limiter (limit 3): three `401`s, then `429`. `200`, `403`, and
  `404` responses never count. `429` has `RateLimit`, `RateLimit-Policy`,
  `Retry-After`, the JSON `message`, and no `X-RateLimit-*` headers.
- Trust proxy: with `trust proxy` 1, a spoofed leading `X-Forwarded-For`
  entry does not change the key.
- Flood limiter: counts every status, and is not mounted when `off`.
- Per-user limiter (limit 3): the fourth request from one email gets `429`.
  The key is case-insensitive. A second user is unaffected. The fallback
  key is used when there is no email.
- `withUserRateLimit`: the returned function is named `authenticate`. The
  limiter is not called when auth responds `401`, `403`, or `503`. It is
  called once after `next()`.
- Handler log line contains the limiter name and key, and never the
  `Authorization` header.

**`test/index.test.js` (additions):** `app.get('trust proxy') === 1`. The
`cors` layer comes before the limiter layers, and the limiter layers come
before the first route layer.

**`test/route_permissions.test.js` (additions only):** every one of the 64
routes has its first handler named `authenticate` or `authenticateIntake`,
and the global limiter's stack index is lower than every route's. The
existing adjacency assertions stay unchanged and must pass.

Expected: about 25-30 new tests.

## 9. Phased delivery (TDD)

1. **Phase 0:** the plan. Steve approved the Section 10 decisions on
   2026-11-04.
2. **Phase 1, tests first (Grok 4.7):** add the Section 8 tests and a stub
   `utils/rate_limit.js` that exports the names and throws. New tests fail
   for the expected reason, and the existing 1,710 still pass.
3. **Review pause:** Steve reviews the tests before any implementation.
4. **Phase 2, implementation (a different model, Steve's choice):** the
   dependency, utility, `index.js`, workflows, and docs. `npm test` and
   `npm run coverage` must pass. The PR's CodeQL check must report the
   `js/missing-rate-limiting` alerts as fixed. If it does not, move the
   `rateLimit` call or confirm it is still called directly in `index.js`.
5. **Phase 3, rollout:** check live max-instances values, merge (deploys
   dev), run the Section 5.1 `req.ip` check, then release to prd. After the
   next `main` scan, Steve handles the old Won't-fix alerts (decision 5).

## 10. Open questions for Steve

Accepted on 2026-11-04 as recommended below.

| # | Question | Recommendation |
|---|---|---|
| 1 | Limits | 50 `401`s per 15 min per IP, 300 per min per user, flood ceiling 2,000 per min per IP, all per instance and env-tunable. If shared event Wi-Fi ever trips the pre-auth limit because of in-flight counting (5.2), raise it to 100 through env with no code change. |
| 2 | Keying | Pre-auth by IP (401s only), post-auth by verified email. Pure IP keying would penalize volunteers sharing one connection. |
| 3 | Max instances | prd 5, dev 2, set in the workflows so they cannot drift. Lower them only after the live values are checked. |
| 4 | `/openapi.json` and `/api-docs` behind the IP limiter? | Yes, with no exemption. They never return `401`, so only the flood ceiling can touch them, and the prod smoke test makes one request. |
| 5 | Old Won't-fix alerts after merge | Steve, after the first `main` scan with the limiter: reopen the Won't-fix `js/missing-rate-limiting` alerts so CodeQL closes them as Fixed. Dismiss any that stay open only after checking why the limiter did not cover them. |
