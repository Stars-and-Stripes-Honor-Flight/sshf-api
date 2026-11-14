# CouchDB design document deploy (`_design/basic`)

The repo copy of the SSHF CouchDB design document lives under `couchdb/design/basic/`. Each view is `views/<name>/map.js` with an optional `reduce.js`. Each list is `lists/<name>.js`.

Deploy with:

```bash
npm run deploy-design
```

That is a **dry run**: it prints the diff and **nothing will be written**. To apply changes:

```bash
npm run deploy-design -- --apply --env dev
npm run deploy-design -- --apply --env prd
```

`--apply` requires `--env dev` or `--env prd`. A bare command dry-runs against dev.

## Target databases

- `--env dev` uses **`DEV_DB_NAME` only**
- `--env prd` uses **`PRD_DB_NAME` only**

The deploy script never reads DB_NAME and has no fallback to DB_NAME. Set both names in `.env`. They must be non-empty and must differ.

Production apply (`--env prd --apply`) asks you to type the **database name** to confirm (`Type the database name to confirm apply to production: `). There is no flag or environment variable to skip that prompt.

## Backups

Before a replace, the full live `_design/basic` document (including attachment bytes) is written under `maintenance-backups/` as `deploy-design-basic-<timestamp>.json`, using the same shape as maintenance runner backups.

## Editing views and lists

After you change `map.js`, `reduce.js`, or a list file, run a dry run, then apply when the diff looks right. **Changing a view rebuilds its index** in CouchDB; allow time for the index to catch up after deploy.