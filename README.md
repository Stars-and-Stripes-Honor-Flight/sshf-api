# SSHF API

A RESTful API for managing Stars and Stripes Honor Flight operations, including veteran and guardian registration, flight management, and search functionality.

## Overview

This API provides the backend services for the SSHF application, enabling:

- **Veteran Management** — Create, retrieve, update, and delete veteran records with full validation
- **Guardian Management** — Manage guardian records with veteran pairing support
- **Flight Management** — Track honor flights, capacity, and completion status
- **Search** — Query veterans and guardians by name, status, or flight assignment
- **User Authentication** — Google OAuth integration with domain-based group membership

## Technology Stack

- **Runtime**: Node.js with ES Modules
- **Framework**: Express.js
- **Database**: CouchDB (accessed via REST API)
- **Authentication**: Google OAuth 2.0 with Google Workspace group support
- **Hosting**: Google Cloud Run
- **Documentation**: OpenAPI 3.0 / Swagger UI

## Getting Started

### Prerequisites

- Node.js 18+
- Access to a CouchDB instance
- Google Cloud project with OAuth configured
- Google Workspace domain (for group-based authorization)

### Environment Configuration

Copy the example environment file and configure your settings:

```bash
cp env.example .env
```

Required environment variables:

| Variable | Description |
|----------|-------------|
| `DB_URL` | CouchDB server URL |
| `DB_NAME` | Database name |
| `DB_USER` | CouchDB username |
| `DB_PASS` | CouchDB password |
| `ALLOWED_ORIGINS` | Comma-separated CORS allowed origins (defaults to `http://localhost:3000,http://127.0.0.1:3000,http://localhost:8080`) |
| `API_URL` | Public API base URL for OpenAPI/Swagger (defaults to `http://localhost:8080`) |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID for Swagger UI auth, and the client whose access tokens the API accepts (audience validation) |
| `ALLOWED_CLIENT_IDS` | Optional. Comma-separated OAuth client IDs accepted for token audience validation (overrides `GOOGLE_CLIENT_ID` when set) |
| `ALLOWED_EMAIL_DOMAINS` | Optional. Comma-separated email domains permitted to access the API; unset disables the domain check |
| `ALLOWED_GROUP_EMAILS` | Optional. Comma-separated Workspace group emails required for data routes; unset disables the group gate. Dev: `sshf_app_dev_full_access@…`; prod: `sshf_app_prd_full_access@…` |
| `REVIEW_DB_NAME` | CouchDB database name for online applications (VeteranApp/GuardianApp); required for `/review/applications` routes |
| `REVIEW_DB_URL` | Optional. CouchDB URL for the review database; defaults to `DB_URL` |
| `REVIEW_DB_USER` | Optional. CouchDB username for the review database; defaults to `DB_USER` |
| `REVIEW_DB_PASS` | Optional. CouchDB password for the review database; defaults to `DB_PASS` |
| `REVIEW_INTAKE_SERVICE_ACCOUNTS` | Optional. Comma-separated service-account emails permitted to POST applications; unset disables intake (401) |
| `REVIEW_INTAKE_AUDIENCE` | Optional. Expected Google ID-token audience for intake auth; defaults to `API_URL` |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service account email (local dev) |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Service account private key (local dev) |

> **Note**: In Cloud Run, Application Default Credentials are used automatically. Locally, the API prefers `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` so a developer's `gcloud` user ADC (which often fails Directory API with expired reauth) does not hide Workspace group membership.

### Installation

```bash
npm install
```

### Running Locally

```bash
node index.js
```

The server starts at `http://localhost:8080`.

### Running Tests

```bash
npm test
```

Parity comparer and deny-list tests are included in `npm test`. They do not contact CouchDB.

### Data parity harness (optional, live databases)

Compares write-path results between hf-basic on living `test` and the new API on the sshf-db-prd copy. Never points at production `hf`. Not part of default CI. The `parity` and `parity:align` scripts load `.env` from the repo root the same way the API does.

```bash
# Optional one-shot align (dry-run first). Overwrites the sshf-db-prd copy only.
npm run parity:align
npm run parity:align -- --apply

# Operation-layer scenarios. Pass unused people; do not re-replicate between runs.
npm run parity -- 00-empty-clone
npm run parity -- 01-edit-vet-note --veteran <id>
npm run parity -- 02-pair-guardian --veteran <id> --guardian <id>

# Compare two full Couch documents that may have different _ids (manual dual-entry).
# Legacy id is living test; modern id is the sshf-db-prd copy the API writes.
npm run parity:docs -- --legacy <oldId> --modern <newId>
```

| Variable | Description |
| --- | --- |
| `PARITY_LEGACY_DB_URL` | Full URL of living `test` (hf-basic), e.g. `https://db.starsandstripeshonorflight.org/test` |
| `PARITY_LEGACY_DB_USER` / `PARITY_LEGACY_DB_PASS` | CouchDB basic-auth for the **old** host. Required for `--apply` and live scenarios. Not `DB_USER`. |
| `PARITY_MODERN_DB_URL` | Full URL of the sshf-db-prd copy |
| `PARITY_MODERN_DB_USER` / `PARITY_MODERN_DB_PASS` | Optional override for the **new** copy. Defaults to `DB_USER` / `DB_PASS` |
| `PARITY_API_URL` | Base URL of an API whose `DB_NAME` is that copy (local process or `sshf-api-prd`, never `sshf-api-dev`) |
| `PARITY_API_TOKEN` | Bearer token for that API |
| `PARITY_USER_NAME` | Actor string written into history on both adapters |
| `PARITY_SOURCE_URL` / `PARITY_TARGET_URL` | Align-only; source is living `test`, target is the sshf-db-prd copy |

`parity:docs` compares **raw Couch JSON** from the two databases (the same documents the API stored), not `GET /veterans/:id` response shapes. `_id` and pairing foreign keys are listed as expected id references. `ok` is field-data only; history is reported separately as `historyMatch` because independently entered docs almost never share Evently history strings.

### Test Coverage

```bash
npm run coverage
```

## Dependency Maintenance

Use a conservative update flow so GitHub alerts can be cleared without pulling in unnecessary breakage:

1. Start from a clean branch and install the locked dependency set with `npm ci`.
2. Establish a baseline with `npm run deps:verify`.
3. Review direct dependency drift with `npm run deps:outdated`.
4. Check production vulnerabilities first with `npm run deps:audit`.
5. Refresh packages within the existing semver ranges with `npm run deps:update`.
6. Re-run `npm run deps:audit` and `npm run deps:verify`.
7. If a GitHub alert remains, upgrade only the direct parent package that pulls in the vulnerable dependency, then re-run the audit and tests.
8. If the parent cannot yet take a patched child (for example mocha 11 still depending on `serialize-javascript` 6.x), pin the patched version with `package.json` `overrides` scoped to that parent, then re-run the audit and tests. Prefer waiting for the parent when a compatible release exists; do not override across incompatible majors (for example do not force `brace-expansion` 5.x onto mocha's `minimatch` 9.x).
9. Use `npm run deps:audit:all` when you want to inspect dev-only warnings separately from production risk.

Avoid manually editing `package-lock.json`. If the lockfile truly needs to be regenerated, delete `node_modules` and `package-lock.json`, run `npm install`, and then re-run the full verification flow before committing the new lockfile.

## Deployment

Deployments are fully automated with GitHub Actions:

- Merging a PR to `main` deploys to the **dev** environment (`sshf-api-dev`).
- Publishing a GitHub Release tagged `vX.Y.Z` promotes the exact dev-tested image to **production** (`sshf-api-prd`), behind a manual approval gate.

See the [CI/CD and Deployment Guide](docs/DEPLOYMENT.md) for the full process: release preparation, promotion steps, post-release verification, rollback, and environment configuration.

## Authentication & Authorization

Protected endpoints require a Google OAuth2 access token as a Bearer token.
The API enforces these checks before a request proceeds:

1. **Audience validation** — the token is introspected and rejected with `401`
   unless it was issued for this API's OAuth client (`GOOGLE_CLIENT_ID`, or any
   ID in `ALLOWED_CLIENT_IDS`). This ensures a valid Google token minted for
   some other application cannot be replayed against this API.
2. **Email domain (optional)** — when `ALLOWED_EMAIL_DOMAINS` is set, an
   authenticated user whose verified email falls outside those domains receives
   `403`.
3. **Workspace group membership (optional, required in deployed envs)** — when
   `ALLOWED_GROUP_EMAILS` is set, data routes require membership in at least
   one listed group (`403` otherwise, including when Admin SDK returns no
   roles). `GET /user/hasgroup` stays auth-only so the UI can probe membership
   during sign-in.

Responses: `401` for a missing, invalid, expired, or wrong-audience token;
`403` for a permitted-token account that is not allowed (domain or group);
`503` if token introspection is temporarily unavailable.

## API Documentation

Interactive API documentation is available at `/api-docs` when the server is running.

The OpenAPI specification can be accessed directly at `/openapi.json`.

### Application review

Online veteran and guardian applications are stored in a separate review CouchDB
database (`REVIEW_DB_NAME`). The database must contain the legacy `hf-app-review`
design document; its `new_apps` view backs the list endpoint.

| Method | Path | Description | Status codes |
| --- | --- | --- | --- |
| `POST` | `/review/applications` | Intake: create application from legacy form JSON (service-account ID token). Permissive — only `type` is required; incomplete payloads are stored for review. | 201, 400, 401, 403, 503 |
| `GET` | `/review/applications` | List applications by status (query: `status`, `limit`) | 200, 400, 401, 403, 503 |
| `GET` | `/review/applications/:id` | Retrieve one application (normalized shape) | 200, 400, 401, 403, 404, 503 |
| `PUT` | `/review/applications/:id` | Update application fields (cannot set Accepted; use accept endpoint) | 200, 400, 401, 403, 404, 503 |
| `PATCH` | `/review/applications/:id/status` | Update status and optional note (cannot set Accepted) | 200, 400, 401, 403, 404, 503 |
| `POST` | `/review/applications/:id/accept` | Accept application into logistics DB (same `_id`). Enforces Veteran/Guardian model validation before any write. | 200, 400, 401, 403, 404, 409, 503 |

### Cloud Function (hf_appcollector) changes

The `hf_appcollector` Cloud Function should obtain a Google identity token from
the metadata server:

```
GET http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=<API_URL>
Metadata-Flavor: Google
```

Send the token as `Authorization: Bearer <token>` when posting the form JSON
to `POST <API_URL>/review/applications`. Remove the `cburi`, `cbusr`, and
`cbpwd` form fields — CouchDB credentials are no longer passed through the
intake payload.

### Key Flight Detail Endpoints

- `GET /flights/:id/detail`
- `PATCH /veterans/:id/seat`
- `PATCH /veterans/:id/bus`
- `PATCH /veterans/:id/mail-call-received`
- `PATCH /veterans/:id/mail-call-adopt`
- `PATCH /veterans/:id/medical-form`
- `PATCH /veterans/:id/medical-review`
- `PATCH /veterans/:id/vaccinated`
- `PATCH /veterans/:id/homecoming-destination`
- `PATCH /veterans/:id/apparel-shirt-size`
- `PATCH /veterans/:id/apparel-jacket-size`
- `PATCH /veterans/:id/apparel-notes`
- `PATCH /guardians/:id/seat`
- `PATCH /guardians/:id/bus`
- `PATCH /guardians/:id/training-notes`
- `PATCH /guardians/:id/training-complete`
- `PATCH /guardians/:id/waiver`
- `PATCH /guardians/:id/training-see-doc`
- `PATCH /guardians/:id/vaccinated`
- `PATCH /guardians/:id/medical-form`
- `PATCH /guardians/:id/paid`
- `PATCH /guardians/:id/books-ordered`
- `PATCH /guardians/:id/apparel-shirt-size`
- `PATCH /guardians/:id/apparel-jacket-size`
- `PATCH /guardians/:id/apparel-notes`

## Project Structure

```
sshf-api/
├── index.js           # Application entry point and middleware
├── models/            # Data models with validation
├── routes/            # Route handlers for each resource
├── schemas/           # OpenAPI schema definitions (YAML)
├── swagger/           # Swagger/OpenAPI configuration
├── utils/             # Shared utilities (database helpers)
└── test/              # Unit tests
```

## Contributing

### Code Style

- Use ES Module syntax (`import`/`export`)
- Follow existing patterns for route handlers and models
- Include JSDoc comments for public functions

### Adding New Features

1. Create or update models in `models/` with validation
2. Add route handlers in `routes/`
3. Document endpoints using JSDoc OpenAPI annotations
4. Add corresponding tests in `test/`
5. Ensure 100% test coverage is maintained

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes with appropriate tests
3. Run `npm run coverage` to verify tests pass with full coverage
4. Submit a pull request for review

### Dependency Updates

Use the `Dependency Review` GitHub Actions workflow for a scheduled or on-demand production audit. It installs the locked dependency set, reports outdated direct dependencies, audits production packages, and then runs the test suite and coverage checks.

## License

ISC License — see [LICENSE](LICENSE) for details.
