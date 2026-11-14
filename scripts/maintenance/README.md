# One-time database maintenance scripts

Scripts under `scripts/maintenance/` apply reviewed, one-off CouchDB changes through the shared Node runner. Run them locally against the GCP tunnel target; the runner does not expose an HTTP API.

## Command

```bash
npm run maint -- <script> [--env dev|prd] [--apply]
```

`<script>` can be:

- the script id: `2026-11-14-remove-loc-zipcode-docs`
- the same with extension: `2026-11-14-remove-loc-zipcode-docs.mjs`
- a relative or absolute path to that file under `scripts/maintenance/` (forward or backslashes on Windows)

Examples:

```bash
npm run maint -- 2026-11-14-remove-loc-zipcode-docs
npm run maint -- 2026-11-14-remove-loc-zipcode-docs.mjs
npm run maint -- scripts/maintenance/2026-11-14-remove-loc-zipcode-docs.mjs
npm run maint -- .\scripts\maintenance\2026-11-14-remove-loc-zipcode-docs.mjs
npm run maint -- 2026-11-14-remove-loc-zipcode-docs --env dev --apply
npm run maint -- 2026-11-14-remove-loc-zipcode-docs --env prd --apply
```

- **Dry run by default.** Without `--apply`, the script only reports what it would change.
- **`--apply` requires `--env`.** Choose `dev` or `prd` so the runner picks the correct database name from configuration.
- **Shared credentials.** `DB_URL`, `DB_USER`, and `DB_PASS` come from `.env`. Dev vs prod is selected by database name: `DEV_DB_NAME` or `PRD_DB_NAME` (each falls back to `DB_NAME` when unset).
- **Production confirmation.** For `prd` with `--apply`, the runner prints the host and database name, then asks you to type the database name before any read or write.
- **Backups.** Before an apply that changes documents, every touched document is written to `maintenance-backups/<script>-<timestamp>.json` (gitignored).
- **Writes.** Updates use CouchDB `_bulk_docs` with each document's current `_rev`. Conflicts are reported, not forced.

## Adding a script

1. Create `YYYY-MM-DD-short-description.mjs` in this directory.
2. Export `name` (or `SCRIPT_NAME`) and an async `plan(db)` function.
3. `plan` should return `{ matched, writes, originals, skipped, flagged, sample }` and must not write to CouchDB itself.
4. Add mocha coverage in `test/` and run `npm test`.

The runner loads `.env` the same way as the API (`dotenv/config`).