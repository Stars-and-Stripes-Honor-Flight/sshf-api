# CouchDB design document deploy

Design document sources live under `couchdb/design/basic/` (`_design/basic`) and `couchdb/design/hf-app-review/` (`_design/hf-app-review`, `new_apps` view). Each view is `views/<name>/map.js` with an optional `reduce.js`. Each list is `lists/<name>.js` (required for `basic`; optional for `hf-app-review` — a missing `lists/` folder is fine, an empty one is not).

Deploy with:

```bash
npm run deploy-design
```

That is a **dry run** against `_design/basic` on dev (`DEV_DB_NAME`): it prints the diff and **nothing will be written**. To deploy the review design:

```bash
npm run deploy-design -- --design hf-app-review
npm run deploy-design -- --design hf-app-review --apply --env dev
npm run deploy-design -- --design hf-app-review --apply --env prd
```

`--design` accepts `basic` (default when omitted) or `hf-app-review`. `--apply` requires `--env dev` or `--env prd`.

## Target databases (`basic`)

- `--env dev` uses **`DEV_DB_NAME` only**
- `--env prd` uses **`PRD_DB_NAME` only**

The deploy script never reads DB_NAME and has no fallback to DB_NAME. Set both names in `.env`. They must be non-empty and must differ.

## Target databases (`hf-app-review`)

- `--env dev` uses **`DEV_REVIEW_DB_NAME` only**
- `--env prd` uses **`PRD_REVIEW_DB_NAME` only**

The deploy script never reads REVIEW_DB_NAME and has no fallback to REVIEW_DB_NAME, DEV_DB_NAME, or PRD_DB_NAME. `DEV_REVIEW_DB_NAME` and `PRD_REVIEW_DB_NAME` must be non-empty, must differ, and must be set for deploy. Connection settings use `REVIEW_DB_URL`, `REVIEW_DB_USER`, and `REVIEW_DB_PASS`, which default to `DB_URL`, `DB_USER`, and `DB_PASS` when unset.

Production apply (`--env prd --apply`) asks you to type the **database name** to confirm (`Type the database name to confirm apply to production: `). There is no flag or environment variable to skip that prompt.

## Backups

Before a replace, the full live design document (including attachment bytes) is written under `maintenance-backups/` as `deploy-design-basic-<timestamp>.json` or `deploy-design-hf-app-review-<timestamp>.json`, using the same shape as maintenance runner backups.

## Editing views and lists

After you change `map.js`, `reduce.js`, or a list file, run a dry run, then apply when the diff looks right. **Changing a view rebuilds its index** in CouchDB; allow time for the index to catch up after deploy.