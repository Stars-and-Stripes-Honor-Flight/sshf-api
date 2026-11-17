# Agent conventions (sshf-api)

Shared workflow for AI agents on this repository. **Behavioral guardrails** live in [`.cursor/index.mdc`](.cursor/index.mdc) and [`.cursor/rules/`](.cursor/rules/index.mdc) — follow those for implementation detail; this file covers team process only.

**Sibling UI:** [sshf-ui](https://github.com/Stars-and-Stripes-Honor-Flight/sshf-ui) — see [sshf-ui `AGENTS.md`](https://github.com/Stars-and-Stripes-Honor-Flight/sshf-ui/blob/main/AGENTS.md) for front-end conventions.

## Issues and pull requests

- Every PR tracks an issue. PR bodies use **`Refs #N` only** (never `Closes` / `Fixes` / `Resolves`); maintainers close issues.
- Open **draft** PRs with a title that describes the **final outcome**, not an intermediate “tests only” phase.
- Before opening or updating a PR: `git fetch` and `git merge --ff-only origin/main` (stay **0 commits behind** `main`).

## Phased TDD (maintainer-gated)

1. Post a short plan on the issue; wait for a **maintainer** to approve.
2. Open a draft PR with **tests only** (no production implementation yet).
3. Maintainer reviews tests and any pinned decisions on the PR.
4. Add implementation on the **same PR**; do not change tests unless a maintainer approves.
5. Maintainer reviews again, dry-runs in dev, then merges.

For plan/test/implementation sequencing aligned with the codebase, also follow [`test-first-planning.mdc`](.cursor/rules/test-first-planning.mdc).

## Quality bar

- Match existing patterns in routes, models, middleware, and tests.
- **Test count only increases** (no removing tests to green-light code).
- `npm test` must pass on **Linux and Windows**. There is no `npm run lint`; run `node --check` on changed `.js` / `.mjs` files.
- Keep OpenAPI/Swagger in sync with route behavior ([`openapi-sync-rule.mdc`](.cursor/rules/openapi-sync-rule.mdc)).
- Prefer durable tests over brittle mocks; avoid fragile timing or environment assumptions.

## Database safety (`maint` and `deploy-design`)

Scripts default to **dry run**. Writes require explicit flags. Details: [`scripts/maintenance/README.md`](scripts/maintenance/README.md), [`scripts/design/README.md`](scripts/design/README.md).

| Command | Env vars (no generic fallback) |
| --- | --- |
| `npm run maint -- <script> [--env dev\|prd] [--apply]` | `--env dev` → `DEV_DB_NAME`; `--env prd` → `PRD_DB_NAME` (never `DB_NAME`) |
| `npm run deploy-design [--design basic\|hf-app-review] [--env dev\|prd] [--apply]` | `basic`: `DEV_DB_NAME` / `PRD_DB_NAME`. `hf-app-review`: `DEV_REVIEW_DB_NAME` / `PRD_REVIEW_DB_NAME` (never `REVIEW_DB_NAME` or logistics names) |

- Missing or empty required names → error **before** any database access.
- Identical dev and prd names for a pair → refused.
- **`--env prd --apply`:** type the database name at the exact prompt `Type the database name to confirm apply to production: ` — no skip flag.
- Non-TTY (piped) runs **fail safe** instead of applying.

Design sources: `couchdb/design/` (`basic`, `hf-app-review`). View changes rebuild indexes after deploy.

## Models

Use **Cursor / Grok** models for coding agents unless a maintainer directs otherwise: stronger reasoning and test work on **Grok**; implementation on **Composer**.

## Domain facts (Honor Flight)

- **Bus colors:** bus number → color on every user-visible output — 1 Red, 2 White, 3 Blue, 4 Green, 5 Gold (e.g. Alpha4 = Alpha Green).
- **Medical Team:** guardians with crew position **Medical Team** (not a separate veteran role).
- **Never** store or log SSNs.
- **AI features** stay on Google (Gemini / Vertex AI).

## Security

- No secrets in source, logs, commits, or chat.
- GitHub access only through team-sanctioned integrations (e.g. Cursor GitHub app), not ad-hoc tokens in agent sessions.