# Flight status utility endpoints: implementation plan

Covers [#125 Utility endpoint for flight completion](https://github.com/Stars-and-Stripes-Honor-Flight/sshf-api/issues/125)
and [#126 Utility endpoint to move future status to active](https://github.com/Stars-and-Stripes-Honor-Flight/sshf-api/issues/126).

**Status:** approved by Steve on 2026-10-03. Decision 6 was reversed later
the same day. The decisions are recorded in [Section 9](#9-decisions). This
document is the plan. Endpoints, routes,
models, tests, and the OpenAPI spec are not changed in this PR. The OpenAPI
and code blocks below are sketches for the implementation PR.

## Summary

| Issue | Endpoint | What it does | Permission |
|---|---|---|---|
| #125 | `POST /flights/:id/complete` | Reads the flight document by `_id`. Every Veteran and Guardian whose `flight.id` equals that flight's `name` and whose `flight.status` is `Active` becomes `Flown`, including no-fly people. Then the flight's `completed` changes from `false` to `true`, but only if every person save succeeded. A flight with nobody to change is still completed. | `flights:manage` |
| #126 | `POST /flights/future-status/activate` with JSON body `{ "status": "Future-Spring" }` | Every Veteran and Guardian whose `flight.status` exactly equals the given value becomes `Active`. Any value beginning with `Future-` is accepted. A matched person who is unexpectedly on a flight is still changed, and their id is returned in `assignedToFlight`. | `flights:manage` |

Both endpoints count the matching people before any write and save in
batches through CouchDB `_bulk_docs`. **Every person whose status changes
is recorded the same way as an individual user edit.** The existing model
helpers `updateHistory` and `prepareForSave` append the `flight.history`
status line and set `metadata.updated_at` and `metadata.updated_by`
(Section 3.2).

Both return the same JSON result shape. The status is `200` when every save
succeeded and `207`, with `failed[]` ids, when some attempted saves failed.
It is `503` when the database is unreachable before any save. There is no
preview or dry-run mode.

---

## 1. How the data is stored today

### 1.1 Flight documents

| Field | Type | Evidence |
|---|---|---|
| `_id` | CouchDB id (32 hex chars in practice) | Path parameter for every `/flights/:id` route ([routes/flights.js](../routes/flights.js)) |
| `type` | `"Flight"` | Checked by every flight route, for example [routes/flights.js:272](../routes/flights.js#L272) and [routes/flight-assignments.js:170](../routes/flight-assignments.js#L170) |
| `name` | non-empty string, for example `"SSHF-Nov2024"` | [models/flight.js:9](../models/flight.js#L9), [schemas/Flight.yaml](../schemas/Flight.yaml) |
| `flight_date` | `YYYY-MM-DD` string | [models/flight.js:10](../models/flight.js#L10) |
| `capacity` | positive integer (model rule) | [models/flight.js:42-46](../models/flight.js#L42-L46) |
| `completed` | **boolean** | [models/flight.js:12](../models/flight.js#L12) defaults to `false`, and [models/flight.js:49-51](../models/flight.js#L49-L51) rejects non-booleans. [schemas/Flight.yaml:26-29](../schemas/Flight.yaml#L26-L29) is `type: boolean`. New flights are stored with `false` by [routes/flights.js:170](../routes/flights.js#L170) and [models/generic_document.js:156-158](../models/generic_document.js#L156-L158) |
| `metadata.{created,updated}_{at,by}` | strings | [models/flight.js:13-18](../models/flight.js#L13-L18) |

Flight documents have no `history` array.

The issue text writes `completed` as `"false"` and `"true"` in quotes. The
code stores it as a boolean, and so did the historical importer:
[hf-import models.py:233](https://github.com/shmakes/hf-import/blob/master/models.py#L233)
(`self.completed = valueDict["Completed"] == "true"`). The legacy UI tested
it as a truthy value (`!doc.completed`) in
[hf-basic evently/vetedit/loggedIn/async.js](https://github.com/shmakes/hf-basic/blob/master/evently/vetedit/loggedIn/async.js),
and `listFlights` does the same with `flightDoc.completed || false`
([routes/flights.js:104](../routes/flights.js#L104)). Production data was
not checked, and that check does not block the plan. The endpoint handles a
string `"true"` defensively (decision 8).

The same importer stored `capacity` as the raw CSV string
([models.py:229](https://github.com/shmakes/hf-import/blob/master/models.py#L229)).
If any such flights remain, `Flight.validate()` would reject them, which
matters for Section 3.2.

### 1.2 Person documents (Veteran and Guardian)

Only `Veteran` and `Guardian` documents carry a `flight` object. The legacy
`Volunteer` type has no `flight`, and imported "crew" were written as
`type: 'Guardian'`
([models.py Volunteer and Crew](https://github.com/shmakes/hf-import/blob/master/models.py#L169-L300)).

| Field | Type and values | Evidence |
|---|---|---|
| `type` | `"Veteran"` or `"Guardian"` | [models/veteran.js:222-224](../models/veteran.js#L222-L224), [models/guardian.js:8](../models/guardian.js#L8) |
| `flight.id` | **The flight's `name`**, not its document `_id`. `"None"` when the person is not assigned | Defaults in [models/veteran.js:35](../models/veteran.js#L35) and [models/guardian.js:29](../models/guardian.js#L29). Assignment writes `vetDoc.flight.id = flightName` ([routes/flight-assignments.js:13](../routes/flight-assignments.js#L13), [:35](../routes/flight-assignments.js#L35)). Sample data has `"id": "SSHF-Nov2024"` ([Veteran_Data_Example.json:13](Previous_App/Veteran_Data_Example.json), [Guardian_Data_Example.json:16](Previous_App/Guardian_Data_Example.json)) |
| `flight.status` | string, default `"Active"` | [models/veteran.js:36](../models/veteran.js#L36), [models/guardian.js:30](../models/guardian.js#L30) |
| `flight.history` | array of `{ id: "YYYY-MM-DDTHH:MM:SSZ", change: "changed <field> from: <old> to: <new> by: <First Last>" }` | [models/veteran.js:479-487](../models/veteran.js#L479-L487), [routes/flight-assignments.js:18-21](../routes/flight-assignments.js#L18-L21). **Written by these endpoints** for each changed person (decision 6) |
| `flight.nofly` | boolean | [models/veteran.js:44](../models/veteran.js#L44), [models/guardian.js:38](../models/guardian.js#L38) |
| `metadata.updated_at`, `metadata.updated_by` | strings | Set by `prepareForSave` ([models/veteran.js:359-371](../models/veteran.js#L359-L371), [models/guardian.js:339-351](../models/guardian.js#L339-L351)) and by every API write path. **Written by these endpoints** for each changed person (decision 6) |

### 1.3 `flight.status` values

| Value | Veteran model | Guardian model | Notes |
|---|---|---|---|
| `Active` | yes | yes | Default. Waitlisted or assigned to an upcoming flight |
| `Flown` | yes | yes | Target of #125 |
| `Deceased`, `Removed` | yes | yes | Must not be changed by either endpoint |
| `Future-Spring`, `Future-Fall`, `Future-PostRestriction` | yes | yes | Known sources for #126. Any `Future-` value is accepted (decision 2) |
| `Copied` | no | yes | Guardian only |

Sources: [models/veteran.js:326-329](../models/veteran.js#L326-L329) and
[models/guardian.js:289-292](../models/guardian.js#L289-L292). The legacy
views list the same three `Future-*` values
([hf-basic waitlist_veterans_active](https://github.com/shmakes/hf-basic/blob/master/views/waitlist_veterans_active/map.js)).
The legacy UI only allowed a person on a flight when their status was
`Active` or `Flown`
([hf-basic vetedit after.js](https://github.com/shmakes/hf-basic/blob/master/evently/vetedit/loggedIn/after.js)),
so `Future-*` people should be on `flight.id: "None"`. The code does not
enforce this, so #126 reports any exceptions (decision 7).

### 1.4 CouchDB views the API already uses

The API queries `_design/basic` views (the legacy `hf-basic` couchapp
design document). All three views below are already called by shipped
routes, so they exist in the deployed database:

| View | Key (from hf-basic map.js) | Used today by | Fit |
|---|---|---|---|
| [`active_by_flight`](https://github.com/shmakes/hf-basic/blob/master/views/active_by_flight/map.js) | `[flight.id, type]`, value `null`. Emitted for any doc with `flight.id`, with no status filter despite the name | `GET /exports/flight`, `GET /exports/callcenterfollowup` ([routes/exports.js:157](../routes/exports.js#L157), [:223](../routes/exports.js#L223)) | **#125.** One row per document. No dependency on name fields |
| [`all_by_flight_and_name`](https://github.com/shmakes/hf-basic/blob/master/views/all_by_flight_and_name/map.js) | `[flight.id, name.last stripped]`. Requires `name.last` | `GET /search` ([models/search_request.js:44-45](../models/search_request.js#L44-L45)) | Used by the historical #125 script. Fallback for #125 |
| [`all_by_status_and_name`](https://github.com/shmakes/hf-basic/blob/master/views/all_by_status_and_name/map.js) | `[flight.status, name.last stripped]`. Requires `flight` and `name.last` | `GET /search` ([models/search_request.js:41-42](../models/search_request.js#L41-L42)) | **#126.** Used by the historical #126 script |

`flight_assignment` and `flight_pairings` are a poor fit. They emit one row
per pairing, so a guardian paired with several veterans appears several
times.

**Exact key ranges are required.** The existing flight routes query with
`endkey: [name + '\ufff0']`
([routes/flight-assignments.js:180](../routes/flight-assignments.js#L180),
[routes/flight-detail.js:98](../routes/flight-detail.js#L98)). That is a
prefix match, so a query for `SSHF-Nov2024` would also return people on
`SSHF-Nov2024-B`. The new endpoints use `startkey: [value]` and
`endkey: [value, {}]`, which match the first key element exactly, as the
historical scripts did. They also check `doc.flight.id === flight.name` and
`doc.flight.status === <expected>` in code. Changing the existing routes is
out of scope here.

### 1.5 What the historical scripts did

Steve's [shmakes/hf-import](https://github.com/shmakes/hf-import) holds the
Python scripts that performed these operations by hand. They are used here
only to confirm the conditions, not as a design.

[`couch_db_flight_completion.py`](https://github.com/shmakes/hf-import/blob/master/couch_db_flight_completion.py):

- Its `flight_id` argument is the **flight name** (`SSHF-Oct2011` in the usage text). It matches people by `flight.id == name` with `basic/all_by_flight_and_name`, `startkey=[name]` and `endkey=[name, {}]` (line 16).
- It changes only people whose `flight.status == "Active"` (line 20). Everyone else on the flight (Removed, Deceased, already Flown) is left alone. There is no `nofly` check, so no-fly people who are `Active` become `Flown`. There is no type filter.
- It appends `{ id: now, change: "changed status from: Active to: Flown by: Steve Schmechel" }` to `flight.history` (lines 28-31), using one timestamp per run. The two sample documents show exactly this entry at the same second ([Veteran_Data_Example.json:47-50](Previous_App/Veteran_Data_Example.json), [Guardian_Data_Example.json:65-68](Previous_App/Guardian_Data_Example.json)).
- It does not update `metadata.updated_at` or `updated_by`. The samples' `metadata.updated_at` is earlier than the Flown entry.
- It stops after 101 documents (lines 34-35) and saves them with one `db.update` call, which is `_bulk_docs` (line 39). Larger flights took several runs. Reruns were safe because people already `Flown` no longer match.
- It **never changes the flight document's `completed` flag.** That step is new in #125.
- It ignores the per-document results of the bulk save.

[`couch_db_future_to_active.py`](https://github.com/shmakes/hf-import/blob/master/couch_db_future_to_active.py):

- It matches by exact status with `basic/all_by_status_and_name`, `startkey=[status]` and `endkey=[status, {}]` (line 16). It does not filter by `flight.id` or type.
- It does not check that the value starts with `Future-`. #126 adds that check.
- The history entry is `"changed status from: <status> to: Active by: ..."` (line 29). It does not update metadata, has no batch limit, and makes one `_bulk_docs` call.

The new endpoints keep the scripts' conditions: who matches, `Active` only
for #125, no-fly included, and exact status for #126. Like the scripts,
they append a `changed status from: ... to: ... by: ...` history line. They
differ in four ways:

- #125 sets the flight's `completed` flag.
- #126 requires the `Future-` prefix.
- **Each changed person is recorded the way an individual user edit is**
  (decision 6). The history line names the calling user, and
  `metadata.updated_at` and `updated_by` are set, which the scripts skipped.
- Per-document failures are reported instead of ignored.

### 1.6 Drift noticed during investigation (out of scope)

- [schemas/Veteran.yaml:107](../schemas/Veteran.yaml#L107) includes `All` in the `flight.status` enum. The model rejects `All`.
- The prefix-range queries described in Section 1.4.
- `PUT /flights/:id` can rename a flight, but people's `flight.id` is not updated to match ([routes/flights.js:337-411](../routes/flights.js#L337-L411)). Steve confirmed flights are never renamed, so this is monitored rather than changed (decision 1).

---

## 2. Endpoint contracts

Both endpoints follow the repo's JSON-only style. Errors are
`{ "error": "<message>" }` ([schemas/Error.yaml](../schemas/Error.yaml)).
`403` keeps the existing `requirePermission` body,
`{ "message": "Forbidden: requires permission flights:manage", "requiredPermission": "flights:manage" }`
([utils/auth.js:212-218](../utils/auth.js#L212-L218)).

### 2.1 `POST /flights/:id/complete` (#125)

- **Path parameter** `id` is the flight document `_id`. It is validated with `buildCouchDocumentUrlOrRespond` ([utils/document_id.js:45-52](../utils/document_id.js#L45-L52)). The document id is only used to read the flight. People are matched by the flight's `name` (decision 1).
- **Request body:** none. A body sent anyway is ignored.
- **Preconditions**, checked in this order before any write:
  1. Invalid id: `400 { "error": "Invalid document id" }`
  2. Not found: `404 { "error": "Flight not found" }`
  3. `type !== "Flight"`: `400 { "error": "Document is not a flight record" }`
  4. Already completed: `409 { "error": "Flight is already completed" }`. "Completed" means `completed === true` or the string `"true"` (decision 8).
  5. Guard: if `name` is empty or `"None"`, return `400 { "error": "Flight name cannot be used to match people" }`. A flight named `"None"` would otherwise match every unassigned person.
- **Who is changed:** Veteran and Guardian documents whose `flight.id === flight.name` exactly and whose `flight.status === "Active"`. No-fly people (`flight.nofly: true`) who are `Active` on the flight are included (decision 5).
- **Success:** `200` with the result body (Section 2.3) and `flight.completed: true`. This includes a flight with zero matching people (decision 3).
- **Partial failure:** `207` with the result body. `failed[]` lists every document that was not saved. When any person failed, the flight is left `completed: false` so a retry can finish the job (decision 4, Section 3.4).

### 2.2 `POST /flights/future-status/activate` (#126)

- **Request body:** JSON `{ "status": "Future-Spring" }` (decision 2). The status is not read from the query string or the path.
- **Validation:** `status` must be a string that, after trimming, starts with `Future-` (case-sensitive) and has at least one character after the hyphen. Otherwise the response is `400 { "error": "status must begin with \"Future-\"" }`. **Any** such value is accepted, not only the three known values (decision 2). No database call happens before validation.
- **Who is changed:** every Veteran and Guardian whose `flight.status` exactly equals `status`, regardless of `flight.id` (decision 7).
- **People already on a flight:** nobody with a `Future-` status should be on a flight. A matched person counts as on a flight when their `flight.id` is a non-empty string other than `"None"`. That person's status is **still changed**, and their document id is listed in `assignedToFlight` so the caller can see the anomaly (decision 7). The list is informational:
  - It does not affect the `200` or `207` status.
  - It lists the person whether or not their save succeeded. A failed save also appears in `failed[]`.
- **Success:** `200`. **Partial failure:** `207`. Both use the result body.

### 2.3 Shared result body (`FlightStatusBulkResult`)

#125 example:

```json
{
  "fromStatus": "Active",
  "toStatus": "Flown",
  "flight": { "id": "422fc05d0401190a7a13ad7ffde62d3c", "name": "SSHF-Nov2024", "completed": true },
  "counts": { "matched": 252, "changed": 248, "skipped": 4, "failed": 0 },
  "failed": []
}
```

#126 example with one anomaly and one failed save:

```json
{
  "fromStatus": "Future-Spring",
  "toStatus": "Active",
  "counts": { "matched": 40, "changed": 39, "skipped": 0, "failed": 1 },
  "failed": [{ "id": "29d8dae1191db7e9b9ed5dcbeb038bcc", "type": "veteran", "status": 409, "error": "Document update conflict." }],
  "assignedToFlight": ["29d8dae1191db7e9b9ed5dcbeb516766"]
}
```

| Field | Meaning |
|---|---|
| `fromStatus`, `toStatus` | `Active` to `Flown` for #125. `<Future-*>` to `Active` for #126 |
| `flight` | #125 only. `completed` is the stored value after the request |
| `counts.matched` | Determined before any write. #125: Veteran and Guardian documents on the flight, whatever their status ("how many were on the flight"). #126: Veteran and Guardian documents with that status ("how many had that status") |
| `counts.changed` | People saved with `toStatus` in this request ("how many were changed") |
| `counts.skipped` | Matched but not changed because the status was not `fromStatus` (for example Removed, Deceased, already Flown), or because a conflict re-read showed the person no longer qualified |
| `counts.failed` | People who qualified but could not be saved |
| `failed[]` | `{ id, type, status, error }`. Same item shape as `AddVeteransResult.failed` ([schemas/FlightAssignment.yaml:153-171](../schemas/FlightAssignment.yaml#L153-L171)), with `type` extended to `veteran`, `guardian`, or `flight`. `status` is the per-document HTTP-style code (`409` conflict, `403` rejected by CouchDB, `500` other, `503` database lost mid-run). `error` is a stable message, and CouchDB `reason` text is only logged ([utils/db.js:36-53](../utils/db.js#L36-L53)) |
| `assignedToFlight` | #126 only, always present, and `[]` when there are none. Ids of matched people whose `flight.id` was present and not `"None"` when read (decision 7) |

Invariant: `matched = changed + skipped + failed`. A failed flight save
appears in `failed[]` with `type: "flight"`. It is not counted in
`counts.failed`, which counts people only.

The response does not list every saved id. Each changed person carries the
record of the run in their own document: a `flight.history` status line and
`metadata.updated_at`/`updated_by` naming the calling user (decision 6,
Section 3.2). The response counts and the server log line (Section 3.3)
summarize the run.

### 2.4 Status codes

| Code | #125 | #126 |
|---|---|---|
| 200 | Every qualifying person saved, including when nobody qualified or nobody is on the flight, and the flight saved as completed | Every matched person saved, or nobody had the status |
| 207 | Some documents were attempted and at least one person or the flight was not saved | Some documents were attempted and at least one person was not saved |
| 400 | Invalid id, not a flight, or unusable flight name | `status` missing or not `Future-*` |
| 401 | Missing or invalid token (existing middleware) | Same |
| 403 | Missing `flights:manage` (existing middleware) | Same |
| 404 | Flight not found | Not used |
| 409 | Flight already completed. Nothing is written | Not used |
| 500 | CouchDB answered with an error **before any save**, for example a failed view read | Same |
| 503 | Database unreachable or session not established **before any save**: `dbSession` middleware, or `DatabaseSessionError` from `dbFetch` (existing pattern) | Same |

`207` means at least one attempted save failed, and the caller should
inspect `failed[]`. It applies even if every attempted save failed.

`503` is returned only when the database is unreachable before any save.
Once a save has been attempted, an outage is reported as `207`, with the
unsaved people failed as `503` (decision 9).

---

## 3. How the bulk update runs

### 3.1 Read phase (counts before writes)

- #125: `GET {DB_URL}/{DB_NAME}/_design/basic/_view/active_by_flight?startkey=["<name>"]&endkey=["<name>",{}]&include_docs=true` through `dbFetch`.
- #126: `GET .../_view/all_by_status_and_name?startkey=["<status>"]&endkey=["<status>",{}]&include_docs=true`.
- Keep only rows where `doc.type` is `Veteran` or `Guardian`, the key field matches exactly (`doc.flight.id === name`, or `doc.flight.status === status`), and the id is not already in the set. The `matched` count is the size of this set. For #126, `assignedToFlight` is collected here.
- Read every page before writing so the counts are final first. Writes then cannot shift page boundaries, which matters for #126 because changed people leave the key range. Page with `limit=500` plus `startkey`/`startkey_docid`. A flight is a few hundred people (the `/flights` example has capacity 448), so one page is the normal case.
- A non-OK view response before any save is `500` with a stable message. If the database is unreachable (`DatabaseSessionError`), the response is `503`.

### 3.2 Per-person change: the same as an individual status edit

Every person whose `flight.status` changes is recorded exactly as an
individual user's status edit is (decision 6).

The repo has no exported per-document save function. An individual status
edit goes through `PUT /veterans/:id` or `PUT /guardians/:id`
([routes/veterans.js:253-275](../routes/veterans.js#L253-L275),
[routes/guardians.js:375-399](../routes/guardians.js#L375-L399)). Those
routes build the stored and the edited model, then call the two model
helpers that write history and metadata:

- `updateHistory(current, user)` ([models/veteran.js:419-487](../models/veteran.js#L419-L487), [models/guardian.js:401-472](../models/guardian.js#L401-L472)) appends one `flight.history` entry for each tracked field that changed. For `flight.status` the entry is `{ id: "YYYY-MM-DDTHH:MM:SSZ", change: "changed status from: Active to: Flown by: First Last" }`.
- `prepareForSave(user)` ([models/veteran.js:359-371](../models/veteran.js#L359-L371), [models/guardian.js:339-351](../models/guardian.js#L339-L351)) sets `metadata.updated_at` and `metadata.updated_by`. It also sets `created_at` and `created_by` when they are empty.

The `PATCH` field handlers (`patchVeteranField`, `patchGuardianField`) are
bound to one request and one `PUT`, and no `PATCH` route covers status, so
they cannot be reused for a batch. The bulk endpoints call the same two
model helpers for each person. **The helpers must not be bypassed**, and
the history line and metadata values must not be built by hand:

```js
const Model = doc.type === 'Veteran' ? Veteran : Guardian;
const current = Model.fromJSON(structuredClone(doc));
const updated = Model.fromJSON(structuredClone(doc));
updated.flight.status = toStatus;
updated.updateHistory(current, req.user);
updated.prepareForSave(req.user);

doc.flight.status = updated.flight.status;
doc.flight.history = updated.flight.history;
doc.metadata = { ...doc.metadata, ...updated.metadata };
```

- `current` and `updated` come from the same stored document, so `flight.status` is the only tracked difference and exactly one history line is added. Both are built from copies because the constructors keep references to the stored `history` arrays ([models/veteran.js:43](../models/veteran.js#L43), [models/guardian.js:37](../models/guardian.js#L37), [utils/trim_strings.js:1](../utils/trim_strings.js#L1)).
- `req.user` is the caller, so the history line and `updated_by` name the FULL user who ran the endpoint, as for an individual edit.
- Each person gets their timestamp from the helpers at the moment they are changed, as an individual edit does. The historical script used one timestamp for the whole run.
- The runs appear in `GET /recent-activity`, because `admin_recent_changes` keys on `metadata.updated_at` and `admin_recent_flight_changes` keys on the last `flight.history` entry ([models/recent_activity_request.js:6-9](../models/recent_activity_request.js#L6-L9)). A completed flight of a few hundred people fills the recent list. Steve accepted this.

**One documented exception to the `PUT` path:** only `flight.status`,
`flight.history`, and `metadata` are copied from the model onto the stored
raw document, which is saved with its stored `_rev`. `validate()` is not
called, and the model's `toJSON()` is not saved. Saving `toJSON()` would
drop fields the models do not know and trim every string in legacy
documents. Validating unrelated legacy fields (phones, names) could block a
status change. The new values `Flown` and `Active` are valid in both model
enums. If Steve wants the full `PUT` behavior instead, `applyStatusChange`
would call `validate()` and save `toJSON()`, and people who fail legacy
validation would be listed in `failed[]` with status `400`.

The flight document for #125 changes `completed` to `true` and is saved
with its stored `_rev`. It keeps its normal last-updated fields:
`Flight.prepareForSave` ([models/flight.js:61-73](../models/flight.js#L61-L73))
sets `metadata.updated_at` and `updated_by`, as `PUT /flights/:id` does
([routes/flights.js:373-377](../routes/flights.js#L373-L377)), and they are
copied onto the stored document in the same way. `Flight.validate()` is not
called, because legacy flights may have a string `capacity` (Section 1.1).

### 3.3 Write phase

- `POST {DB_URL}/{DB_NAME}/_bulk_docs` with `{ "docs": [...] }` through `dbFetch`, in batches of **100**. That is the historical batch size and the existing `veteranCount` maximum. `all_or_nothing` is not used, because it was removed in CouchDB 2.x and CouchDB has no multi-document transactions. That is why partial results, and `207`, exist at all.
- `_bulk_docs` returns `201` with one result per document: `{ id, rev, ok }` or `{ id, error, reason }`. Errors map to `conflict` → `409`, `forbidden` → `403`, `unauthorized` → `401`, anything else → `500`.
- **Conflict retry, once.** This mirrors `putWithConflictRetry` ([routes/flight-assignments.js:65-82](../routes/flight-assignments.js#L65-L82)). Conflicted documents are re-read with `POST _all_docs?include_docs=true` and `{ keys }`. A document that still qualifies gets the Section 3.2 change applied to the re-read document, so it carries one new history line, not two, and is saved in one more `_bulk_docs` call. A document that no longer qualifies (someone changed its status or flight in the meantime) is `skipped`, not failed. A conflict that remains is a `409` failure.
- **Whole-batch failure.** If a `_bulk_docs` call returns non-2xx, every document in that batch is failed with that status, and the run continues with the next batch. If `dbFetch` throws `DatabaseSessionError` after a save was attempted, the run stops. Every unsaved person is failed with `503`, the flight is not changed, and the response is `207` (decision 9).
- Each run writes one summary log line on the server: endpoint, flight id (#125) or status (#126), counts, failed ids, and `assignedToFlight` ids. The line contains no document bodies, personal data, cookies, or credentials.

### 3.4 Ordering for #125: people first, flight last, only on full success

1. Preconditions (Section 2.1).
2. Read and count (3.1).
3. Save qualifying people (3.2 and 3.3).
4. **Only if no person failed** (including when nobody needed saving, decision 3): save the flight with `completed: true`. On a `409` conflict, re-read the flight once. If it is already `completed: true` (a concurrent request finished first), treat that as success. Otherwise apply the change again and save once more.
5. Respond.

Why this order (decision 4):

- If people fail, the flight stays `completed: false`, so the operator can **call the endpoint again**. The rerun skips everyone already `Flown` and retries only the failures. Marking the flight first would make the rerun return `409` and leave the failures to be handled by hand.
- **The flight save fails after all people saved.** Every person is `Flown`, the flight is still `completed: false`, and the response is `207` with `failed: [{ id: <flightId>, type: "flight", ... }]`. A rerun finds `matched` people with nobody qualifying (all `skipped`), saves the flight, and returns `200`.

### 3.5 Request duration

A flight is a few hundred documents, about five `_bulk_docs` calls, well
within Cloud Run's default request timeout. Volume was not checked against
production, and that does not block the plan (decision 12). Read paging
(3.1) and write batching (3.3) handle larger `Future-*` sets.

---

## 4. Authorization

- Add two entries to `ROUTE_PERMISSIONS` in [utils/permissions.js](../utils/permissions.js):
  - `'POST /flights/:id/complete': Object.freeze(['flights:manage'])`
  - `'POST /flights/future-status/activate': Object.freeze(['flights:manage'])`
- `flights:manage` is already FULL-only ([utils/permissions.js:24](../utils/permissions.js#L24)). FULL is the only role that grants it ([utils/permissions.js:99-109](../utils/permissions.js#L99-L109)). The authorization plan says batch endpoints default to FULL ([docs/AUTHORIZATION_PLAN.md:208](AUTHORIZATION_PLAN.md), [:222](AUTHORIZATION_PLAN.md)).
- **No new permission, and no changes** to `ROLE_PERMISSIONS`, `FULL_ONLY_PERMISSIONS`, role inheritance, `AUTHZ_ROLE_*_GROUPS`, Cloud Run env, GCP, or Workspace groups.
- The resulting role behavior: READ, WRITE, REVIEW, and MEDICAL get `403` with `requiredPermission: "flights:manage"`. FULL is allowed. The existing role matrix in [test/route_permissions.test.js](../test/route_permissions.test.js) already expects this for any non-`/veterans`, non-`/guardians` POST.
- The implementation PR adds both endpoints to the `flights:manage` row of [docs/AUTHORIZATION_PLAN.md](AUTHORIZATION_PLAN.md) Section 3.2. That is a docs-only edit.

---

## 5. Idempotency, empty sets, partial failure, concurrency

| Situation | #125 | #126 |
|---|---|---|
| Second call after full success | `409`, nothing written | `200`, `matched: 0`, nothing written |
| Call after a `207` caused by people | Changes only people still `Active`, then completes the flight. `200` if all succeed | Changes only people still at that status |
| Call after a `207` caused only by the flight save | `matched: N`, `changed: 0`, `skipped: N`, flight saved, `200` | Not applicable |
| Nobody on the flight | Flight completed, `200`, all counts `0` (decision 3) | Not applicable |
| People on the flight, none `Active` | Flight completed, `200`, `changed: 0` | Not applicable |
| No-fly person who is `Active` on the flight | Changed to `Flown` (decision 5) | Not applicable |
| Nobody has the status | Not applicable | `200`, all counts `0`, `assignedToFlight: []` (not `404`) |
| Matched person already on a flight | Not applicable | Changed to `Active` and listed in `assignedToFlight`. Status code unaffected (decision 7) |
| Database unreachable before any save | `503`, nothing written | `503`, nothing written |
| Database lost after saves began | `207`, unsaved people failed as `503`, flight left not completed | `207`, unsaved people failed as `503` |
| Two identical requests at once | The slower request's saves conflict. The re-read shows `Flown`, so those people are `skipped`. Its flight save conflicts, and the re-read shows `completed: true`, which counts as success. Each person is written once and gets one history line | Same skip-on-re-read behavior |
| Someone edits a person mid-run | A conflict, retried once and re-qualified. The other user's edit is kept | Same |
| A person is assigned to the flight during the run | Not in the read set. They stay `Active` on a completed flight. Rare, and visible on the assignments page | Not applicable |

---

## 6. Route registration and OpenAPI sketch

### 6.1 Registration in `index.js`

The paths are fixed (decision 10). Place this in the "Flight-specific
routes" block. It is after `app.use(express.json())`
([index.js:145](../index.js#L145)), so #126's body is parsed. The order is
authenticate, then permission, then `dbSession`, then the handler, as on
every protected route:

```js
app.post("/flights/:id/complete", authenticate, requireRoutePermission('POST', '/flights/:id/complete'), dbSession, completeFlight);
app.post("/flights/future-status/activate", authenticate, requireRoutePermission('POST', '/flights/future-status/activate'), dbSession, activateFutureStatus);
```

Neither path overlaps an existing route. `/flights/:id` has two segments,
and `/flights/:id/assignments` and `/flights/:id/detail` have different
literal third segments.

### 6.2 JSDoc OpenAPI sketch

```yaml
/flights/{id}/complete:
  post:
    summary: Mark a flight completed and its active people as Flown
    description: |
      Matches people by flight name (flight.id). Each changed person gets a
      flight.history status line and updated metadata.updated_at and
      metadata.updated_by, the same as an individual status edit.
    tags: [Flights]
    security:
      - GoogleAuth: []
    x-required-permission: flights:manage
    parameters:
      - in: path
        name: id
        required: true
        schema: { type: string }
        description: Flight document ID
    responses:
      200: { description: Every qualifying person and the flight were saved, including when nobody needed changing, content: { application/json: { schema: { $ref: '#/components/schemas/FlightStatusBulkResult' } } } }
      207: { description: Some documents were attempted and one or more were not saved. failed lists their ids. The flight stays not completed when any person failed, content: { application/json: { schema: { $ref: '#/components/schemas/FlightStatusBulkResult' } } } }
      400: { description: Invalid document id, document is not a flight record, or flight name cannot be used to match people }
      401: { description: Unauthorized }
      403: { description: Forbidden - missing required permission }
      404: { description: Flight not found }
      409: { description: Flight is already completed. Nothing was changed }
      500: { description: Server error before any document was saved }
      503: { description: Database unreachable before any document was saved }

/flights/future-status/activate:
  post:
    summary: Change every person with a Future-* status to Active
    description: |
      Accepts any status beginning with "Future-". Each changed person gets a
      flight.history status line and updated metadata.updated_at and
      metadata.updated_by, the same as an individual status edit. Matched
      people who are on a flight are still changed and listed in
      assignedToFlight.
    tags: [Flights]
    security:
      - GoogleAuth: []
    x-required-permission: flights:manage
    requestBody:
      required: true
      content:
        application/json:
          schema: { $ref: '#/components/schemas/FutureStatusActivateRequest' }
    responses:
      200: { description: Every matching person was saved }
      207: { description: Some documents were attempted and one or more were not saved. failed lists their ids }
      400: { description: status is missing or does not begin with "Future-" }
      401: { description: Unauthorized }
      403: { description: Forbidden - missing required permission }
      500: { description: Server error before any document was saved }
      503: { description: Database unreachable before any document was saved }
```

New schema files `schemas/FlightStatusBulkResult.yaml` (including
`assignedToFlight: { type: array, items: { type: string } }`, #126 only) and
`schemas/FutureStatusActivateRequest.yaml`
(`required: [status]`, `status: { type: string, pattern: '^Future-.+' }`)
must also be added to `loadAllSchemas(...)` in
[swagger/swagger.js:119-147](../swagger/swagger.js#L119-L147). Schemas are
listed there explicitly. The `x-required-permission` value is checked
against `ROUTE_PERMISSIONS` by
[test/swagger-specs.test.js:247-303](../test/swagger-specs.test.js#L247-L303).

---

## 7. Files the implementation PR would touch

| File | Change |
|---|---|
| `routes/flight-status.js` (new, kebab-case) | `completeFlight`, `activateFutureStatus` handlers with `@swagger` JSDoc |
| `models/flight_status_update.js` (new, snake_case) | `FutureStatusRequest` (validation), `applyStatusChange(doc, toStatus, user)` (sets `flight.status` and writes history and metadata through the model helpers, Section 3.2), `isOnFlight(doc)` (`flight.id` present and not `"None"`), and `FlightStatusBulkResult` (counts, `failed`, `assignedToFlight`, `statusCode()` returning 200 or 207, `toJSON()`) |
| `utils/bulk_docs.js` (new) | Batched `_bulk_docs` save through `dbFetch`, result normalization, and one conflict re-read and retry with a re-qualify callback. URLs built from `DB_URL`/`DB_NAME` |
| `utils/permissions.js` | Two `ROUTE_PERMISSIONS` entries. Nothing else |
| `index.js` | Import and two registrations (Section 6.1) |
| `schemas/FlightStatusBulkResult.yaml`, `schemas/FutureStatusActivateRequest.yaml` (new) and `swagger/swagger.js` | OpenAPI schemas |
| `README.md` | A short "Flight status utilities" table (method, path, description, status codes), like the Application review table |
| `docs/AUTHORIZATION_PLAN.md` | Add both endpoints to the `flights:manage` row |

No changes to `package.json` scripts, `.c8rc.json` (the new files fall
under existing `routes/`, `models/`, and `utils/` globs), env, or deployment
workflows.

---

## 8. Test plan (tests are written first in the implementation PR)

Following `.cursor/rules/test-first-planning.mdc`, the tests are written
first and run to confirm they fail for the expected reason ("route not
found" or "module not found"). Then the code is implemented and the full
suite plus `npm run coverage` is run. Tests stub `global.fetch` with sinon,
as [test/flight-assignments.test.js](../test/flight-assignments.test.js)
does.

`test/flight_status_update.test.js` (model):

- `FutureStatusRequest` accepts `Future-Spring`, `Future-Fall`, `Future-PostRestriction`, an unknown `Future-Winter` (decision 2), and a padded `" Future-Spring "` (trimmed). It rejects a missing value, a non-string, `""`, `"Future-"`, `"future-spring"`, `"Active"`, and `"Flown"`.
- `applyStatusChange` writes history and metadata **the same way as a single-person status edit** (decision 6). With a fixed clock (`sinon.useFakeTimers`) and the same user, its `flight.history` and `metadata` deep-equal what the `PUT /veterans/:id` and `PUT /guardians/:id` steps produce for the same stored document (`fromJSON`, set `flight.status`, `updateHistory(current, user)`, `prepareForSave(user)`). This is covered for a Veteran and a Guardian, for `Active` to `Flown` and for `Future-Spring` to `Active`.
- Exactly one `flight.history` entry is appended after the existing ones: `{ id: <fixed timestamp>, change: "changed status from: Active to: Flown by: First Last" }`. `call.history` and the pairing history arrays are unchanged.
- `metadata.updated_at` is the fixed timestamp and `updated_by` is `First Last`. Existing `created_at` and `created_by` are kept. Empty or missing ones are filled, as `prepareForSave` does.
- Unknown legacy fields are kept and other strings are not trimmed (the Section 3.2 exception).
- `isOnFlight` is true for `"SSHF-Nov2024"`. It is false for `"None"`, `""`, and a missing `flight.id`.
- `FlightStatusBulkResult` keeps `matched = changed + skipped + failed`. It returns 200 with no failures and 207 with any failure (including a flight-only failure), and `assignedToFlight` does not affect the status. Its `toJSON` shape matches the schema (`assignedToFlight` only for #126).

`test/bulk_docs.test.js` (utility):

- 250 documents are sent as batches of 100, 100, and 50, to `.../_bulk_docs` with `Content-Type: application/json` through `dbFetch`.
- Per-document `conflict`, `forbidden`, and other errors map to 409, 403, and 500.
- A conflict is re-read and saved once. A re-read that no longer qualifies is skipped. A second conflict is a `409` failure.
- A non-2xx batch fails every document in that batch and the next batch still runs.
- `DatabaseSessionError` after a save was attempted fails the remaining documents with `503` and stops.

`test/flight-status.test.js` (routes):

- #125 rejects: an invalid id (400), not found (404), not a Flight (400), `completed: true` and `"true"` (409, no further fetch calls), and a name of `""` or `"None"` (400).
- #125 happy path:
  - The view is queried with exact `startkey`/`endkey` and `include_docs`.
  - The returned rows include an `SSHF-Nov2024-B` person and a non-person type, and both are ignored.
  - Only `Active` people are written, **including an `Active` no-fly person** (decision 5). Removed, Deceased, and Flown people count as skipped.
  - Every saved person body has exactly one new `flight.history` entry, `changed status from: Active to: Flown by: <caller>`, and `metadata.updated_at` and `updated_by` set for the caller (decision 6). Other fields are unchanged.
  - The flight is saved with `completed: true` and its `metadata.updated_at` and `updated_by` set for the caller. The response is 200 with correct counts.
- #125 matches a single-person edit: for the same stored veteran, the same caller, and a fake clock, the body saved by the endpoint and the body saved by `PUT /veterans/:id` (with only `flight.status` changed) have equal `flight.history` and `metadata`. The same test covers a guardian through `PUT /guardians/:id`.
- #125 conflict retry: a person whose first save conflicts is re-read and saved with one new history line, not two.
- #125 with zero people on the flight: the flight is saved as completed and the response is 200 with zero counts (decision 3).
- #125 partial failure: one person conflicts twice. The response is 207 with that id in `failed`, and **no flight save** is attempted (decision 4).
- #125 flight save fails after the people succeed: 207 with `type: "flight"` in `failed`.
- #125 flight save conflicts and the re-read shows completed: 200.
- #125 rerun with every person already Flown: `changed: 0`, flight saved, 200.
- #125 error before any save: a failed view read is 500, and an unreachable database (`DatabaseSessionError`) is 503. Neither writes anything.
- #126 validation and matching:
  - A bad status is 400 with no fetch calls.
  - The happy path uses the exact key range. Each saved body has one new `changed status from: Future-Spring to: Active by: <caller>` history line and updated `metadata`, the same as a single-person status edit, and no other field changes.
  - Zero matches is 200 with zeros and `assignedToFlight: []`.
  - A people-only filter applies.
- #126 people already on a flight: a matched person with `flight.id: "SSHF-Nov2024"` is still changed and listed in `assignedToFlight`, and the status stays 200 (decision 7). People with `"None"`, `""`, or a missing `flight.id` are not listed. A listed person whose save fails is in both lists, and the status is 207.
- #126 partial failure is 207. A failed view read is 500, an unreachable database before any save is 503, and a database lost after saves began is 207 with `503` items.

`test/route_permissions.test.js` and `test/swagger-specs.test.js`:

- The existing matrix covers the new routes automatically (authenticate then `requirePermission`, FULL allowed, everyone else denied). Add explicit assertions that WRITE gets `requiredPermission: "flights:manage"` on both, and that both are mounted.
- Assert that both OpenAPI operations exist with `x-required-permission: flights:manage`, the documented response codes (200, 207, 400, 401, 403, and 404 and 409 for #125, 500, 503), the `Invalid document id` 400 text on #125, and the new schemas, including `assignedToFlight`.

Manual check before merge: run against `sshf-db-dev` (or a parity clone)
with a FULL user and a WRITE user. Use a test flight that has a few Active
people (one of them no-fly), one Removed person, and one `Future-*` person
whose `flight.id` is set. On the saved documents, confirm the new status,
one new history line naming the FULL user, and updated
`metadata.updated_at` and `updated_by`. Compare them with a status change
made by hand on another test person, and confirm the run shows in recent
activity. This is a dev-database check. It does not depend on production
data.

---

## 9. Decisions

The first seven decisions are Steve's, approved 2026-10-03. Decision 6 was
reversed later that day. Decisions 8 to 12 settle the smaller questions
Steve delegated.

1. **Decided: match people by flight name**, the value stored in `flight.id`, not the flight document id. The endpoint takes the document id in the path only to read the flight and get its `name`. Flights are never renamed.
   - *Readability tradeoff:* `flight.id` reads like a document id but holds a name, which is easy to misread in code and logs. Implementation names the value `flightName`, as `routes/flight-assignments.js` does.
   - *Renames:* a flight renamed after people were assigned would match nobody. That case is monitored operationally, not handled in code. No data model change is proposed.
2. **Decided: #126 takes a JSON body** `{ "status": "..." }`. Any status beginning with `Future-` is accepted, not only `Future-Spring`, `Future-Fall`, and `Future-PostRestriction`.
3. **Decided: a flight with zero matching people is still marked completed.** The response is `200` with zero counts.
4. **Decided: the flight is marked completed only after every person update succeeds.** If any person fails, `completed` stays `false` and a retry finishes the job (Section 3.4).
5. **Decided: no-fly people who are `Active` on the flight also become `Flown`**, the same as the old script.
6. **Reversed, now decided: each changed person is saved through the model helpers that write history and metadata.** Steve reversed the earlier "no metadata or history change" decision on 2026-10-03. Each person document is saved anyway, so the save must not bypass the helpers that record an edit. For every person whose `flight.status` changes, `updateHistory(current, user)` appends the `changed status from: X to: Y by: First Last` line to `flight.history`, and `prepareForSave(user)` sets `metadata.updated_at` and `metadata.updated_by`, the same as an individual status edit (Section 3.2). The hf-import scripts skipped the metadata, and the API does it correctly instead. The runs filling `GET /recent-activity` is accepted. The flight document keeps its normal `metadata.updated_at` and `updated_by` when `completed` is set.
7. **Decided: #126 updates everyone with that exact status.** Nobody with a `Future-` status should be on a flight. If a matched person is on one (`flight.id` present and not `"None"`), their status is still changed, and their document id is returned in `assignedToFlight` so the caller can see the anomaly.
8. **Decided, not blocking: non-boolean `completed`.** No production check is required before implementation. `completed === true` or the string `"true"` returns `409`. Any other value proceeds and is written as boolean `true`.
9. **Decided: partial failure and outages.** If some documents were attempted and some failed, the response is `207` with the failed ids. That includes a database outage after saves began, where the unsaved people are failed as `503`. If the database is unreachable before any save, the response is `503`.
10. **Decided: paths** stay `POST /flights/:id/complete` and `POST /flights/future-status/activate`.
11. **Decided: no preview or dry-run mode.**
12. **Decided, not blocking: deployed views and volume.** The plan relies on `active_by_flight` and `all_by_status_and_name`, which shipped routes already query. Read paging and write batching cover larger sets. No live production check is required before implementation.

---

## 10. Sequence for implementation

1. Open the implementation PR and write the tests first (Section 8). Run them and confirm they fail for the expected reason.
2. Implement the model, then the utility, then the routes, then the registration, permissions, OpenAPI, README, and authorization-plan row.
3. Run `npm test` and `npm run coverage` (100% statements and lines for application code), then the manual dev-database check.
