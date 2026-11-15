/**
 * Behavioral contract for deploying couchdb/design/basic (issue #165).
 * No production deploy script exists yet. Dry run is the default and prints
 * the diff. --apply writes only after the checks below.
 *
 * Implemented later, imported here:
 *   scripts/design/deploy-basic.mjs
 *     DEPLOY_SCRIPT_NAME === 'deploy-design-basic'
 *     parseDesignDeployArgs(argv) => { apply: boolean, env: 'dev'|'prd' }
 *     formatDesignDeployReport(result) => string (LF only, labels below)
 *     runDesignDeploy(argv, deps) => result
 *   package.json
 *     "deploy-design": "node scripts/design/deploy-basic.mjs"
 *   scripts/design/README.md and a short note in the repo README
 *
 * runDesignDeploy deps, all optional:
 *   env, log, now, prompt, stdin, stdout, isTTY, fetchImpl,
 *   sourceDir, sourceFs, pathImpl, buildDesignDoc,
 *   db: { getDesignDoc(id), putDesignDoc(doc) },
 *   createDb(target),
 *   rootDir, fs: { mkdir, writeFile }, writeBackup
 *
 * Defaults:
 *   env selection is resolveMaintTarget from scripts/maintenance/runner.mjs
 *     (--env dev => DEV_DB_NAME, --env prd => PRD_DB_NAME, never DB_NAME)
 *   omitted --env dry-runs against dev; --apply requires --env dev|prd
 *   prd --apply uses confirmApply + createMaintenancePrompt + PRD_CONFIRM_PROMPT
 *     from scripts/maintenance/runner.mjs (no flag or env var skips it)
 *   source directory is <repo>/couchdb/design/basic
 *   db factory is createDesignDeployDb from scripts/design/couch.mjs
 *   backups use writeBackup from scripts/maintenance/runner.mjs
 *     script name deploy-design-basic, directory maintenance-backups/
 *   the entry file uses isDirectRun so importing it does not deploy
 *   every dry run starts with a DRY RUN header and ends with a count
 *     summary plus an `--apply --env <env>` hint (substring checks)
 *
 * Apply replaces _design/basic with the repo document plus the live _rev.
 * The PUT body keys are only _id, _rev (when the doc exists), language,
 * views, and lists. A 409 is returned as conflicts: 1 and
 * conflictIds: ['_design/basic'], and is not retried.
 * A missing live doc is created with no _rev and no backup file.
 * Attachment stubs (no data) abort apply with MaintenanceError
 * INCOMPLETE_BACKUP before writeBackup and before put. Dry run still lists them.
 */
import { expect } from 'chai';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const deployHref = '../scripts/design/deploy-basic.mjs';
const runnerHref = '../scripts/maintenance/runner.mjs';

const FIXED_DATE = new Date('2026-11-14T18:22:00.123Z');
const BACKUP_FILENAME = 'deploy-design-basic-2026-11-14T182200.123Z.json';
const MAP_LF = 'function(doc) {\n  emit(doc._id, null);\n}\n';
const MAP_CRLF = 'function(doc) {\r\n  emit(doc._id, null);\r\n}\r\n';
const MAP_OLD = 'function(doc) {\n  emit(doc.city, null);\n}\n';
const LIST_LF = 'function(head, req) {\n  send("ok\\n");\n}\n';
const LIST_CRLF = 'function(head, req) {\r\n  send("ok\\n");\r\n}\r\n';
const LIST_OLD = 'function(head, req) {\n  send("old\\n");\n}\n';

function couchappText(text) {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

const targetEnv = {
    DB_URL: 'http://127.0.0.1:5984',
    DB_NAME: 'accidental-production',
    DEV_DB_NAME: 'hf-dev',
    PRD_DB_NAME: 'hf',
    DB_USER: 'maint-user',
    DB_PASS: 'maint-secret'
};

function builtDoc() {
    return {
        _id: '_design/basic',
        language: 'javascript',
        views: {
            active_by_flight: { map: MAP_LF },
            all_by_name: { map: 'function(doc) {\n  emit(doc.name, null);\n}\n' },
            flights: { map: MAP_LF }
        },
        lists: {
            'callcenterfollowup-csv': LIST_LF,
            'flight-csv': 'function(head, req) {\n  send("new\\n");\n}\n',
            'tourlead-csv': LIST_LF
        }
    };
}

function couchappLive() {
    return {
        _id: '_design/basic',
        _rev: '8-live',
        language: 'javascript',
        couchapp: { name: 'basic' },
        evently: { profile: { html: '<p>old</p>' } },
        shows: { welcome: 'function() { return "hi"; }' },
        rewrites: [{ from: '/', to: 'index.html' }],
        vendor: { couchapp: { version: '0.8' } },
        lib: { util: 'exports.ok = true;' },
        updates: { touch: 'function() {}' },
        filters: { recent: 'function() { return true; }' },
        validate_doc_update: 'function() {}',
        indexes: { old: {} },
        signatures: { signed: true },
        views: {
            admin_duplicates: { map: MAP_OLD, reduce: '_count\n' },
            all_by_city: { map: MAP_OLD },
            all_by_name: { map: MAP_OLD },
            flights: { map: MAP_LF }
        },
        lists: {
            'accommodations-csv': LIST_OLD,
            'flight-csv': LIST_OLD,
            'tourlead-csv': LIST_LF,
            'volunteer-full-csv': LIST_OLD
        },
        _attachments: {
            'images/logo.png': {
                content_type: 'image/png',
                data: 'iVBORw0K'
            },
            'index.html': {
                content_type: 'text/html',
                data: 'PGh0bWw+'
            },
            'style/app.css': {
                content_type: 'text/css',
                data: 'Ym9keXt9'
            },
            'vendor/couchapp/jquery.js': {
                content_type: 'application/javascript',
                data: 'anF1ZXJ5'
            }
        }
    };
}

function joinNames(names) {
    return names.length > 0 ? names.join(', ') : 'none';
}

function expectedReport(result) {
    return [
        `design: ${result.design}`,
        `env: ${result.env}`,
        `host: ${result.host}`,
        `database: ${result.database}`,
        `dryRun: ${result.dryRun}`,
        `equivalent: ${result.equivalent}`,
        `languageChanged: ${result.languageChanged}`,
        `viewsAdded: ${joinNames(result.viewsAdded)}`,
        `viewsChanged: ${joinNames(result.viewsChanged)}`,
        `viewsKept: ${joinNames(result.viewsKept)}`,
        `viewsRemoved: ${joinNames(result.viewsRemoved)}`,
        `listsAdded: ${joinNames(result.listsAdded)}`,
        `listsChanged: ${joinNames(result.listsChanged)}`,
        `listsKept: ${joinNames(result.listsKept)}`,
        `listsRemoved: ${joinNames(result.listsRemoved)}`,
        `keysRemoved: ${joinNames(result.keysRemoved)}`,
        `attachmentsRemoved: ${joinNames(result.attachmentsRemoved)}`,
        `changed: ${result.changed}`,
        `conflicts: ${result.conflicts}`,
        `backup: ${result.backupPath || 'none'}`
    ].join('\n');
}

async function loadDeploy() {
    try {
        return await import(deployHref);
    } catch (error) {
        if (error?.code === 'ERR_MODULE_NOT_FOUND') {
            expect.fail(
                'Missing scripts/design/deploy-basic.mjs. Export DEPLOY_SCRIPT_NAME, '
                + 'parseDesignDeployArgs, formatDesignDeployReport, and runDesignDeploy.'
            );
        }
        throw error;
    }
}

async function expectCode(promise, code) {
    try {
        await promise;
    } catch (error) {
        if (error?.code === 'ERR_MODULE_NOT_FOUND') {
            throw error;
        }
        expect(error.name).to.equal('MaintenanceError');
        expect(error.code).to.equal(code);
        expect(error.message).to.be.a('string').and.not.empty;
        return error;
    }
    expect.fail(`expected MaintenanceError ${code}`);
}

function expectSyncCode(fn, code) {
    try {
        fn();
    } catch (error) {
        if (error?.code === 'ERR_MODULE_NOT_FOUND') {
            throw error;
        }
        expect(error.name).to.equal('MaintenanceError');
        expect(error.code).to.equal(code);
        expect(error.message).to.be.a('string').and.not.empty;
        return error;
    }
    expect.fail(`expected MaintenanceError ${code}`);
}

function restoreEnv(previous) {
    for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = value;
        }
    }
}

function recordingDb(live, putResult) {
    const events = [];
    const puts = [];
    return {
        events,
        puts,
        async getDesignDoc(id) {
            events.push(['get', id]);
            return live;
        },
        async putDesignDoc(doc) {
            events.push(['put', doc._id]);
            puts.push(JSON.parse(JSON.stringify(doc)));
            if (typeof putResult === 'function') {
                return putResult(doc);
            }
            return putResult || { ok: true, id: doc._id, rev: '9-new' };
        }
    };
}

function mockTerminal({ tty = true } = {}) {
    const input = new PassThrough();
    const output = new PassThrough();
    input.isTTY = tty;
    output.isTTY = tty;
    return { input, output };
}

function memoryFs(root, pathImpl, files) {
    const full = new Map();
    const dirs = new Set([pathImpl.normalize(root)]);
    for (const [rel, content] of Object.entries(files)) {
        const parts = rel.split('/');
        let current = root;
        for (let index = 0; index < parts.length - 1; index += 1) {
            current = pathImpl.join(current, parts[index]);
            dirs.add(pathImpl.normalize(current));
        }
        full.set(pathImpl.normalize(pathImpl.join(current, parts[parts.length - 1])), content);
    }
    function missing(target) {
        const error = new Error(`ENOENT: ${target}`);
        error.code = 'ENOENT';
        return error;
    }
    return {
        readdirSync(dir) {
            const normalized = pathImpl.normalize(dir);
            const names = new Set();
            let known = dirs.has(normalized);
            for (const entry of dirs) {
                if (pathImpl.dirname(entry) === normalized) {
                    names.add(pathImpl.basename(entry));
                    known = true;
                }
            }
            for (const filePath of full.keys()) {
                if (pathImpl.dirname(filePath) === normalized) {
                    names.add(pathImpl.basename(filePath));
                    known = true;
                }
            }
            if (!known) {
                throw missing(dir);
            }
            return [...names].sort();
        },
        statSync(target) {
            const normalized = pathImpl.normalize(target);
            if (dirs.has(normalized)) {
                return { isDirectory: () => true, isFile: () => false };
            }
            if (full.has(normalized)) {
                return { isDirectory: () => false, isFile: () => true };
            }
            throw missing(target);
        },
        readFileSync(target, encoding) {
            expect(encoding).to.equal('utf8');
            const normalized = pathImpl.normalize(target);
            if (!full.has(normalized)) {
                throw missing(target);
            }
            return full.get(normalized);
        }
    };
}

describe('design deploy', () => {
    describe('repo contract', () => {
        it('registers a cross-platform npm run deploy-design command', () => {
            const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
            expect(pkg.scripts['deploy-design']).to.equal('node scripts/design/deploy-basic.mjs');
            expect(pkg.scripts['deploy-design']).to.not.match(/\b(bash|sh|powershell|cmd\.exe|export)\b/i);
            expect(pkg.scripts['deploy-design']).to.not.match(/^[A-Za-z_][A-Za-z0-9_]*=/);
        });

        it('documents editing a view or list and deploying it', () => {
            const readmePath = join(repoRoot, 'scripts', 'design', 'README.md');
            expect(existsSync(readmePath), readmePath).to.equal(true);
            const readme = readFileSync(readmePath, 'utf8');
            expect(readme).to.match(/npm run deploy-design/);
            expect(readme).to.match(/--apply/);
            expect(readme).to.match(/--env/);
            expect(readme).to.match(/DEV_DB_NAME/);
            expect(readme).to.match(/PRD_DB_NAME/);
            expect(readme).to.match(/no fallback to DB_NAME|never reads DB_NAME|does not (?:read|use|fall back to) DB_NAME/i);
            expect(readme).to.match(/maintenance-backups/);
            expect(readme).to.match(/couchdb\/design\/basic/);
            expect(readme).to.match(/map\.js/);
            expect(readme).to.match(/reduce\.js/);
            expect(readme).to.match(/dry[- ]run/i);
            expect(readme).to.match(/database name/i);
            expect(readme).to.match(/chang(?:e|ing) a view rebuilds its index/i);

            const rootReadme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
            expect(rootReadme).to.match(/npm run deploy-design/);
            expect(rootReadme).to.match(/couchdb\/design\/basic/);
            expect(rootReadme).to.match(/chang(?:e|ing) a view rebuilds its index/i);

            const example = readFileSync(join(repoRoot, 'env.example'), 'utf8');
            expect(example).to.match(/deploy-design/);
            expect(example).to.match(/DEV_DB_NAME/);
            expect(example).to.match(/PRD_DB_NAME/);
        });
    });

    describe('parseDesignDeployArgs', () => {
        it('defaults to a dev dry run and accepts --env before or after --apply', async () => {
            const { parseDesignDeployArgs } = await loadDeploy();
            expect(parseDesignDeployArgs([])).to.deep.equal({ apply: false, env: 'dev' });
            expect(parseDesignDeployArgs(['--env', 'prd'])).to.deep.equal({ apply: false, env: 'prd' });
            expect(parseDesignDeployArgs(['--apply', '--env', 'dev'])).to.deep.equal({
                apply: true,
                env: 'dev'
            });
            expect(parseDesignDeployArgs(['--env=prd', '--apply'])).to.deep.equal({
                apply: true,
                env: 'prd'
            });
            expect(parseDesignDeployArgs(['--env', 'dev', '--apply']).env).to.equal('dev');
        });

        it('rejects --apply without --env, unknown flags, and confirmation bypasses', async () => {
            const { parseDesignDeployArgs } = await loadDeploy();
            const cases = [
                ['--apply'],
                ['--yes'],
                ['--force'],
                ['--no-confirm'],
                ['--skip-confirm'],
                ['--assume-yes'],
                ['-y'],
                ['--confirm'],
                ['--apply', '--env', 'prd', '--yes'],
                ['--env'],
                ['--env='],
                ['--env', 'staging'],
                ['--env', 'PRD'],
                ['--env', 'production'],
                ['--env=prd', '--env', 'dev'],
                ['--apply', '--apply', '--env', 'dev'],
                ['basic'],
                ['--db', 'hf'],
                ['--design', 'hf-app-review']
            ];
            for (const argv of cases) {
                expectSyncCode(() => parseDesignDeployArgs(argv), 'USAGE');
            }
        });

        it('does not take the mode from the environment', async () => {
            const previous = {
                MAINT_ENV: process.env.MAINT_ENV,
                DESIGN_ENV: process.env.DESIGN_ENV
            };
            process.env.MAINT_ENV = 'prd';
            process.env.DESIGN_ENV = 'prd';
            try {
                const { parseDesignDeployArgs } = await loadDeploy();
                expect(parseDesignDeployArgs([])).to.deep.equal({ apply: false, env: 'dev' });
            } finally {
                restoreEnv(previous);
            }
        });
    });

    describe('formatDesignDeployReport', () => {
        it('prints every diff bucket and uses LF only', async () => {
            const { formatDesignDeployReport } = await loadDeploy();
            const result = {
                design: '_design/basic',
                env: 'prd',
                host: '127.0.0.1:5984',
                database: 'hf',
                dryRun: true,
                equivalent: false,
                languageChanged: false,
                viewsAdded: ['active_by_flight'],
                viewsChanged: ['all_by_name'],
                viewsKept: ['flights'],
                viewsRemoved: ['admin_duplicates', 'all_by_city'],
                listsAdded: ['callcenterfollowup-csv'],
                listsChanged: ['flight-csv'],
                listsKept: ['tourlead-csv'],
                listsRemoved: ['accommodations-csv', 'volunteer-full-csv'],
                keysRemoved: ['_attachments', 'evently', 'shows'],
                attachmentsRemoved: ['index.html', 'vendor/couchapp/jquery.js'],
                changed: 0,
                conflicts: 0,
                backupPath: null
            };
            const text = formatDesignDeployReport(result);
            expect(text).to.equal(expectedReport(result));
            expect(text).to.not.include('\r');
            expect(text).to.include('viewsRemoved: admin_duplicates, all_by_city');
            expect(text).to.include('attachmentsRemoved: index.html, vendor/couchapp/jquery.js');
            expect(text).to.include('backup: none');
        });
    });

    describe('runDesignDeploy', () => {
        function deployDeps(extra = {}) {
            return {
                env: targetEnv,
                log: () => {},
                now: () => FIXED_DATE,
                buildDesignDoc: () => builtDoc(),
                ...extra
            };
        }

        it('dry run prints the full diff and does not back up, write, or prompt', async () => {
            const { runDesignDeploy, formatDesignDeployReport } = await loadDeploy();
            const live = couchappLive();
            const db = recordingDb(live);
            const events = [];
            const logs = [];
            const result = await runDesignDeploy([], deployDeps({
                log: (line) => logs.push(String(line)),
                prompt: async () => {
                    events.push('prompt');
                    return 'hf';
                },
                writeBackup: async () => {
                    events.push('backup');
                    return 'backup.json';
                },
                db
            }));

            expect(events).to.deep.equal([]);
            expect(db.events).to.deep.equal([['get', '_design/basic']]);
            expect(db.puts).to.deep.equal([]);
            expect(result).to.include({
                design: '_design/basic',
                dryRun: true,
                env: 'dev',
                host: '127.0.0.1:5984',
                database: 'hf-dev',
                equivalent: false,
                languageChanged: false,
                changed: 0,
                conflicts: 0,
                backupPath: null
            });
            expect(result.viewsAdded).to.deep.equal(['active_by_flight']);
            expect(result.viewsChanged).to.deep.equal(['all_by_name']);
            expect(result.viewsKept).to.deep.equal(['flights']);
            expect(result.viewsRemoved).to.deep.equal(['admin_duplicates', 'all_by_city']);
            expect(result.listsAdded).to.deep.equal(['callcenterfollowup-csv']);
            expect(result.listsChanged).to.deep.equal(['flight-csv']);
            expect(result.listsKept).to.deep.equal(['tourlead-csv']);
            expect(result.listsRemoved).to.deep.equal(['accommodations-csv', 'volunteer-full-csv']);
            expect(result.keysRemoved).to.deep.equal([
                '_attachments',
                'couchapp',
                'evently',
                'filters',
                'indexes',
                'lib',
                'rewrites',
                'shows',
                'signatures',
                'updates',
                'validate_doc_update',
                'vendor'
            ]);
            expect(result.attachmentsRemoved).to.deep.equal([
                'images/logo.png',
                'index.html',
                'style/app.css',
                'vendor/couchapp/jquery.js'
            ]);
            const printed = logs.join('\n');
            expect(printed).to.include('Target host=127.0.0.1:5984 database=hf-dev env=dev');
            expect(printed).to.include(formatDesignDeployReport(result));
            expect(printed).to.include(expectedReport(result));
            expect(printed).to.not.include('maint-secret');
            expect(printed).to.not.include('\r');
        });

        it('prints a dry-run header, a one-line count summary, and an apply hint', async () => {
            const { runDesignDeploy } = await loadDeploy();
            const cases = [
                { argv: [], envName: 'dev', database: 'hf-dev', defaulted: true },
                { argv: ['--env', 'dev'], envName: 'dev', database: 'hf-dev', defaulted: false },
                { argv: ['--env', 'prd'], envName: 'prd', database: 'hf', defaulted: false }
            ];

            for (const spec of cases) {
                const logs = [];
                const db = recordingDb(couchappLive());
                let backedUp = false;
                let prompted = false;
                await runDesignDeploy(spec.argv, deployDeps({
                    log: (line) => logs.push(String(line)),
                    prompt: async () => {
                        prompted = true;
                        return spec.database;
                    },
                    writeBackup: async () => {
                        backedUp = true;
                        return 'backup.json';
                    },
                    db
                }));

                expect(prompted, spec.argv.join(' ')).to.equal(false);
                expect(backedUp, spec.argv.join(' ')).to.equal(false);
                expect(db.puts, spec.argv.join(' ')).to.deep.equal([]);

                const text = logs.join('\n');
                const label = spec.argv.join(' ') || '(no flags)';
                expect(text, label).to.match(/^\s*DRY RUN\b/);
                expect(text, label).to.not.include('\r');
                const targetAt = text.indexOf('Target host=');
                expect(targetAt, label).to.be.greaterThan(0);
                const header = text.slice(0, targetAt);
                expect(header, label).to.include('DRY RUN');
                expect(header, label).to.include('nothing will be written');
                expect(header, label).to.include('_design/basic');
                expect(header, label).to.include(spec.envName);
                expect(header, label).to.include(spec.database);
                if (spec.envName === 'prd') {
                    expect(header, label).to.not.include('hf-dev');
                }
                if (spec.defaulted) {
                    expect(header, label).to.include('defaulted to dev');
                } else {
                    expect(header, label).to.not.include('defaulted to dev');
                }

                const contentLines = text.split('\n').filter((line) => line.trim() !== '');
                const summary = contentLines[contentLines.length - 2];
                const hint = contentLines[contentLines.length - 1];
                expect(summary, label).to.match(/views\D+1\D+1\D+2/i);
                expect(summary, label).to.match(/lists\D+1\D+1\D+2/i);
                expect(summary, label).to.match(/top-level keys\D+12/i);
                expect(summary, label).to.match(/attachments\D+4/i);
                expect(summary, label).to.not.include('--apply');
                expect(hint, label).to.match(/re-?run/i);
                expect(hint, label).to.include(`--apply --env ${spec.envName}`);
            }
        });

        it('prints the first differing line for each changed view and list between the report and summary', async () => {
            const { runDesignDeploy, formatDesignDeployReport } = await loadDeploy();
            const logs = [];
            const result = await runDesignDeploy([], deployDeps({
                log: (line) => logs.push(String(line)),
                db: recordingDb(couchappLive())
            }));
            const text = logs.join('\n');
            const report = formatDesignDeployReport(result);
            expect(text).to.include(report);
            const afterReport = text.slice(text.indexOf(report) + report.length);
            const summaryAt = afterReport.indexOf('Summary:');
            expect(summaryAt).to.be.greaterThan(0);
            const detail = afterReport.slice(0, summaryAt);
            expect(detail).to.include('view all_by_name map line');
            expect(detail).to.match(/repo:.*\| live:/);
            expect(detail).to.include('emit(doc.name');
            expect(detail).to.include('emit(doc.city');
            expect(detail).to.include('list flight-csv line');
            expect(detail).to.match(/repo:.*send\("new/i);
            expect(detail).to.match(/live:.*send\("old/i);
        });

        it('uses DEV_DB_NAME or PRD_DB_NAME for the selected --env', async () => {
            const { runDesignDeploy } = await loadDeploy();
            for (const [envName, database] of [['dev', 'hf-dev'], ['prd', 'hf']]) {
                const db = recordingDb(couchappLive());
                const result = await runDesignDeploy(['--env', envName], deployDeps({ db }));
                expect(result.database).to.equal(database);
                expect(db.events[0]).to.deep.equal(['get', '_design/basic']);
                expect(db.puts).to.deep.equal([]);
            }

            const created = [];
            await runDesignDeploy(['--env', 'dev'], deployDeps({
                env: { ...targetEnv, DEV_DB_NAME: ' hf-dev ' },
                createDb: (target) => {
                    created.push(target);
                    return recordingDb(null);
                }
            }));
            await runDesignDeploy(['--env', 'prd'], deployDeps({
                env: { ...targetEnv, PRD_DB_NAME: ' hf ' },
                createDb: (target) => {
                    created.push(target);
                    return recordingDb(null);
                }
            }));
            expect(created.map((target) => target.database)).to.deep.equal(['hf-dev', 'hf']);
            expect(created[0]).to.include({
                envName: 'dev',
                host: '127.0.0.1:5984',
                url: 'http://127.0.0.1:5984',
                user: 'maint-user',
                pass: 'maint-secret'
            });
            expect(created[1]).to.include({
                envName: 'prd',
                host: '127.0.0.1:5984',
                database: 'hf',
                user: 'maint-user',
                pass: 'maint-secret'
            });
        });

        it('refuses a missing or shared database name before any database access', async () => {
            const { runDesignDeploy } = await loadDeploy();
            const cases = [
                {
                    argv: ['--env', 'dev'],
                    env: { ...targetEnv, DEV_DB_NAME: undefined, DB_NAME: 'hf-dev' },
                    needle: 'DEV_DB_NAME'
                },
                {
                    argv: ['--apply', '--env', 'prd'],
                    env: { ...targetEnv, PRD_DB_NAME: '   ' },
                    needle: 'PRD_DB_NAME'
                },
                {
                    argv: ['--apply', '--env', 'dev'],
                    env: { ...targetEnv, DEV_DB_NAME: 'hf', PRD_DB_NAME: ' hf ' },
                    needle: 'DEV_DB_NAME'
                },
                {
                    argv: ['--env', 'prd'],
                    env: { ...targetEnv, DB_URL: 'not-a-url' },
                    needle: null
                }
            ];
            for (const item of cases) {
                let called = false;
                const error = await expectCode(runDesignDeploy(item.argv, deployDeps({
                    env: item.env,
                    prompt: async () => 'hf',
                    db: {
                        async getDesignDoc() {
                            called = true;
                            return null;
                        },
                        async putDesignDoc() {
                            called = true;
                            return { ok: true, id: '_design/basic', rev: '1-a' };
                        }
                    },
                    createDb() {
                        called = true;
                        return recordingDb(null);
                    }
                })), 'CONFIG');
                expect(called).to.equal(false);
                if (item.needle) {
                    expect(error.message).to.include(item.needle);
                }
                if (item.env.DEV_DB_NAME === 'hf') {
                    expect(error.message).to.match(/PRD_DB_NAME/);
                }
            }
        });

        it('rejects --apply without --env and every confirmation bypass before database access', async () => {
            const { runDesignDeploy } = await loadDeploy();
            const previous = {
                DESIGN_SKIP_CONFIRM: process.env.DESIGN_SKIP_CONFIRM,
                MAINT_SKIP_CONFIRM: process.env.MAINT_SKIP_CONFIRM
            };
            process.env.DESIGN_SKIP_CONFIRM = '1';
            process.env.MAINT_SKIP_CONFIRM = '1';
            try {
                for (const argv of [
                    ['--apply'],
                    ['--apply', '--yes'],
                    ['--apply', '--env', 'prd', '--no-confirm'],
                    ['--apply', '--env', 'prd', '--force']
                ]) {
                    let called = false;
                    await expectCode(runDesignDeploy(argv, deployDeps({
                        prompt: async () => 'hf',
                        db: {
                            async getDesignDoc() {
                                called = true;
                                return null;
                            },
                            async putDesignDoc() {
                                called = true;
                                return { ok: true };
                            }
                        }
                    })), 'USAGE');
                    expect(called).to.equal(false);
                }
            } finally {
                restoreEnv(previous);
            }
        });

        it('aborts prd --apply before any read or write when confirmation is wrong, non-TTY, or closed', async () => {
            const { runDesignDeploy } = await loadDeploy();
            const { PRD_CONFIRM_PROMPT } = await import(runnerHref);

            const wrong = recordingDb(couchappLive());
            const wrongError = await expectCode(runDesignDeploy(['--apply', '--env', 'prd'], deployDeps({
                prompt: async (question) => {
                    expect(question).to.equal(PRD_CONFIRM_PROMPT);
                    expect(question).to.equal('Type the database name to confirm apply to production: ');
                    expect(question).to.not.include('hf');
                    expect(question).to.not.include('maint-secret');
                    return 'hf-copy';
                },
                db: wrong
            })), 'CONFIRMATION_REQUIRED');
            expect(wrongError.message).to.equal('Confirmation did not match the database name.');
            expect(wrong.events).to.deep.equal([]);
            expect(wrong.puts).to.deep.equal([]);

            const closedTerm = mockTerminal({ tty: true });
            closedTerm.input.end();
            const closedDb = recordingDb(couchappLive());
            const closedError = await expectCode(runDesignDeploy(['--apply', '--env=prd'], deployDeps({
                stdin: closedTerm.input,
                stdout: closedTerm.output,
                isTTY: true,
                db: closedDb
            })), 'CONFIRMATION_REQUIRED');
            expect(closedError.message).to.equal('Confirmation was missing.');
            expect(closedDb.events).to.deep.equal([]);

            const detached = mockTerminal({ tty: false });
            const detachedDb = recordingDb(couchappLive());
            const detachedError = await expectCode(runDesignDeploy(['--apply', '--env', 'prd'], deployDeps({
                stdin: detached.input,
                stdout: detached.output,
                isTTY: false,
                db: detachedDb
            })), 'CONFIRMATION_REQUIRED');
            expect(detachedError.message).to.equal(
                'Production apply requires an interactive terminal (stdin and stdout must be a TTY). '
                + 'Run from PowerShell, cmd, or a Linux shell instead of a piped or detached process.'
            );
            expect(detachedDb.events).to.deep.equal([]);
        });

        it('applies on prd only after the operator types the database name', async () => {
            const { runDesignDeploy } = await loadDeploy();
            const { PRD_CONFIRM_PROMPT } = await import(runnerHref);
            const db = recordingDb(couchappLive());
            const questions = [];
            const result = await runDesignDeploy(['--apply', '--env', 'prd'], deployDeps({
                prompt: async (question) => {
                    questions.push(question);
                    return 'hf\r\n';
                },
                writeBackup: async () => 'backup.json',
                db
            }));
            expect(questions).to.deep.equal([PRD_CONFIRM_PROMPT]);
            expect(db.events.map((event) => event[0])).to.deep.equal(['get', 'put']);
            expect(result.changed).to.equal(1);
            expect(result.conflicts).to.equal(0);
            expect(result.dryRun).to.equal(false);
            expect(result.env).to.equal('prd');
            expect(result.database).to.equal('hf');
        });

        it('applies on dev without a TTY and without asking for confirmation', async () => {
            const { runDesignDeploy } = await loadDeploy();
            const detached = mockTerminal({ tty: false });
            const db = recordingDb(couchappLive());
            let prompted = false;
            const result = await runDesignDeploy(['--apply', '--env', 'dev'], deployDeps({
                stdin: detached.input,
                stdout: detached.output,
                isTTY: false,
                prompt: async () => {
                    prompted = true;
                    return 'hf-dev';
                },
                writeBackup: async () => 'backup.json',
                db
            }));
            expect(prompted).to.equal(false);
            expect(db.puts).to.have.length(1);
            expect(result.changed).to.equal(1);
            expect(result.database).to.equal('hf-dev');
        });

        it('does not prompt or write for a prd dry run', async () => {
            const { runDesignDeploy } = await loadDeploy();
            const db = recordingDb(couchappLive());
            let prompted = false;
            let backedUp = false;
            const result = await runDesignDeploy(['--env', 'prd'], deployDeps({
                prompt: async () => {
                    prompted = true;
                    return 'hf';
                },
                writeBackup: async () => {
                    backedUp = true;
                    return 'backup.json';
                },
                db
            }));
            expect(prompted).to.equal(false);
            expect(backedUp).to.equal(false);
            expect(db.events).to.deep.equal([['get', '_design/basic']]);
            expect(result.dryRun).to.equal(true);
            expect(result.database).to.equal('hf');
            expect(result.changed).to.equal(0);
            expect(result.backupPath).to.equal(null);
        });

        it('backs up the full live doc, including attachment bytes, before the replace', async () => {
            const { runDesignDeploy, DEPLOY_SCRIPT_NAME } = await loadDeploy();
            expect(DEPLOY_SCRIPT_NAME).to.equal('deploy-design-basic');
            const live = couchappLive();
            const events = [];
            let inBackup = false;
            let backupArgs;
            const rootDir = join('var', 'design-root');
            const db = recordingDb(live);
            const originalPut = db.putDesignDoc.bind(db);
            db.putDesignDoc = async (doc) => {
                expect(inBackup).to.equal(false);
                events.push('put');
                return originalPut(doc);
            };
            const result = await runDesignDeploy(['--apply', '--env', 'dev'], deployDeps({
                rootDir,
                db,
                writeBackup: async (args) => {
                    inBackup = true;
                    events.push('backup');
                    backupArgs = args;
                    await new Promise((resolve) => {
                        setImmediate(resolve);
                    });
                    expect(events).to.not.include('put');
                    inBackup = false;
                    return join(rootDir, 'maintenance-backups', BACKUP_FILENAME);
                }
            }));

            expect(events).to.deep.equal(['backup', 'put']);
            expect(backupArgs.scriptName).to.equal('deploy-design-basic');
            expect(backupArgs.date.toISOString()).to.equal(FIXED_DATE.toISOString());
            expect(backupArgs.meta).to.deep.equal({
                env: 'dev',
                host: '127.0.0.1:5984',
                database: 'hf-dev'
            });
            expect(backupArgs.documents).to.have.length(1);
            expect(backupArgs.documents[0]).to.deep.equal(live);
            expect(backupArgs.documents[0]._attachments['index.html'].data).to.equal('PGh0bWw+');
            expect(backupArgs.documents[0]._attachments['vendor/couchapp/jquery.js'].data).to.equal('anF1ZXJ5');
            expect(backupArgs.documents[0].evently).to.deep.equal(live.evently);
            expect(backupArgs.documents[0].shows).to.deep.equal(live.shows);
            expect(backupArgs.documents[0].rewrites).to.deep.equal(live.rewrites);
            expect(backupArgs.documents[0].vendor).to.deep.equal(live.vendor);
            expect(JSON.stringify(backupArgs.meta)).to.not.include('maint-secret');
            expect(result.backupPath).to.equal(join(rootDir, 'maintenance-backups', BACKUP_FILENAME));
            expect(result.changed).to.equal(1);
        });

        it('writes a Windows-safe backup file with the same payload shape as maintenance backups', async () => {
            const { runDesignDeploy } = await loadDeploy();
            const live = couchappLive();
            const winRoot = 'C:\\Users\\steve\\Repos\\sshf-api';
            let written;
            await runDesignDeploy(['--apply', '--env', 'dev'], deployDeps({
                rootDir: winRoot,
                pathImpl: path.win32,
                db: recordingDb(live),
                fs: {
                    mkdir: async () => {},
                    writeFile: async (file, data) => {
                        written = [file, data];
                    }
                }
            }));
            const fileName = path.win32.basename(written[0]);
            expect(fileName).to.equal(BACKUP_FILENAME);
            expect(fileName).to.not.include(':');
            expect(written[0]).to.equal(path.win32.join(winRoot, 'maintenance-backups', BACKUP_FILENAME));
            expect(written[1].endsWith('\n')).to.equal(true);
            expect(written[1]).to.not.include('\r');
            const payload = JSON.parse(written[1]);
            expect(payload).to.deep.include({
                script: 'deploy-design-basic',
                createdAt: '2026-11-14T18:22:00.123Z',
                env: 'dev',
                host: '127.0.0.1:5984',
                database: 'hf-dev'
            });
            expect(payload.documents).to.deep.equal([live]);
            expect(payload.documents[0]._attachments['style/app.css'].data).to.equal('Ym9keXt9');
            expect(JSON.stringify(payload)).to.not.include('maint-secret');
            expect(payload).to.not.have.property('pass');
            expect(payload).to.not.have.property('password');
        });

        it('does not update when the backup fails', async () => {
            const { runDesignDeploy } = await loadDeploy();
            const db = recordingDb(couchappLive());
            await expectCode(runDesignDeploy(['--apply', '--env', 'dev'], deployDeps({
                db,
                writeBackup: async () => {
                    throw new Error('disk full');
                }
            })), 'BACKUP_FAILED');
            expect(db.events).to.deep.equal([['get', '_design/basic']]);
            expect(db.puts).to.deep.equal([]);
        });

        it('replaces the live doc with the repo version and the live _rev, without attachment stubs', async () => {
            const { runDesignDeploy } = await loadDeploy();
            const live = couchappLive();
            const repo = builtDoc();
            const db = recordingDb(live);
            await runDesignDeploy(['--apply', '--env', 'dev'], deployDeps({
                buildDesignDoc: () => repo,
                writeBackup: async () => 'backup.json',
                db
            }));
            expect(db.puts).to.have.length(1);
            const put = db.puts[0];
            expect(Object.keys(put).sort()).to.deep.equal(['_id', '_rev', 'language', 'lists', 'views']);
            expect(put).to.deep.equal({
                _id: '_design/basic',
                _rev: '8-live',
                language: 'javascript',
                views: repo.views,
                lists: repo.lists
            });
            expect(put).to.not.have.property('_attachments');
            expect(put).to.not.have.property('evently');
            expect(put).to.not.have.property('shows');
            expect(put).to.not.have.property('rewrites');
            expect(put).to.not.have.property('vendor');
            expect(put).to.not.have.property('lib');
            expect(put).to.not.have.property('couchapp');
            expect(JSON.stringify(put)).to.not.include('"stub"');
            expect(live._attachments['index.html'].data).to.equal('PGh0bWw+');
            expect(live.evently).to.deep.equal({ profile: { html: '<p>old</p>' } });
        });

        it('reports a 409 once and does not fetch or put another revision', async () => {
            const { runDesignDeploy, formatDesignDeployReport } = await loadDeploy();
            const logs = [];
            const db = recordingDb(couchappLive(), () => ({
                ok: false,
                id: '_design/basic',
                error: 'conflict',
                status: 409,
                reason: 'secret-conflict-reason'
            }));
            let backedUp = false;
            const result = await runDesignDeploy(['--apply', '--env', 'dev'], deployDeps({
                log: (line) => logs.push(String(line)),
                writeBackup: async () => {
                    backedUp = true;
                    return 'backup.json';
                },
                db
            }));
            expect(backedUp).to.equal(true);
            expect(db.events).to.deep.equal([
                ['get', '_design/basic'],
                ['put', '_design/basic']
            ]);
            expect(result.changed).to.equal(0);
            expect(result.conflicts).to.equal(1);
            expect(result.conflictIds).to.deep.equal(['_design/basic']);
            expect(result.dryRun).to.equal(false);
            expect(logs.at(-1)).to.equal(formatDesignDeployReport(result));
            expect(logs.join('\n')).to.include('conflicts: 1');
            expect(logs.join('\n')).to.not.include('secret-conflict-reason');
        });

        it('propagates a put transport failure after the backup instead of calling it a conflict', async () => {
            const { runDesignDeploy } = await loadDeploy();
            const db = recordingDb(couchappLive(), async () => {
                throw new Error('couch down');
            });
            let backedUp = false;
            try {
                await runDesignDeploy(['--apply', '--env', 'dev'], deployDeps({
                    writeBackup: async () => {
                        backedUp = true;
                        return 'backup.json';
                    },
                    db
                }));
                expect.fail('expected the put failure to propagate');
            } catch (error) {
                expect(error.message).to.equal('couch down');
                expect(error.code).to.not.equal('CONFLICT');
                expect(error.code).to.not.equal('CONFIRMATION_REQUIRED');
            }
            expect(backedUp).to.equal(true);
            expect(db.puts).to.have.length(1);
        });

        it('does not write when the repo and live docs are equivalent, including line endings', async () => {
            const { runDesignDeploy } = await loadDeploy();
            const sourceDir = '/home/steve/Repos/sshf-api/couchdb/design/basic';
            const sourceFs = memoryFs(sourceDir, path.posix, {
                'views/flights/map.js': MAP_CRLF,
                'views/flights/reduce.js': '_count\r\n',
                'lists/flight-csv.js': LIST_CRLF
            });
            const live = {
                _id: '_design/basic',
                _rev: '3-same',
                language: 'javascript',
                views: {
                    flights: { map: couchappText(MAP_LF), reduce: couchappText('_count\n') }
                },
                lists: { 'flight-csv': couchappText(LIST_LF) }
            };
            const db = recordingDb(live);
            let backedUp = false;
            const result = await runDesignDeploy(['--apply', '--env', 'dev'], {
                env: targetEnv,
                log: () => {},
                now: () => FIXED_DATE,
                sourceDir,
                sourceFs,
                pathImpl: path.posix,
                writeBackup: async () => {
                    backedUp = true;
                    return 'backup.json';
                },
                db
            });
            expect(db.events).to.deep.equal([['get', '_design/basic']]);
            expect(db.puts).to.deep.equal([]);
            expect(backedUp).to.equal(false);
            expect(result.equivalent).to.equal(true);
            expect(result.languageChanged).to.equal(false);
            expect(result.dryRun).to.equal(false);
            expect(result.changed).to.equal(0);
            expect(result.conflicts).to.equal(0);
            expect(result.backupPath).to.equal(null);
            expect(result.viewsKept).to.deep.equal(['flights']);
            expect(result.viewsChanged).to.deep.equal([]);
            expect(result.listsKept).to.deep.equal(['flight-csv']);
            expect(result.keysRemoved).to.deep.equal([]);
            expect(result.attachmentsRemoved).to.deep.equal([]);
        });

        it('creates the design doc when it does not exist, without a backup or a _rev', async () => {
            const { runDesignDeploy } = await loadDeploy();
            const repo = builtDoc();
            const db = recordingDb(null);
            let backedUp = false;
            const result = await runDesignDeploy(['--apply', '--env', 'dev'], deployDeps({
                buildDesignDoc: () => repo,
                writeBackup: async () => {
                    backedUp = true;
                    return 'backup.json';
                },
                db
            }));
            expect(backedUp).to.equal(false);
            expect(db.events.map((event) => event[0])).to.deep.equal(['get', 'put']);
            expect(Object.keys(db.puts[0]).sort()).to.deep.equal(['_id', 'language', 'lists', 'views']);
            expect(db.puts[0]).to.deep.equal({
                _id: '_design/basic',
                language: 'javascript',
                views: repo.views,
                lists: repo.lists
            });
            expect(db.puts[0]).to.not.have.property('_rev');
            expect(result.changed).to.equal(1);
            expect(result.conflicts).to.equal(0);
            expect(result.equivalent).to.equal(false);
            expect(result.backupPath).to.equal(null);
            expect(result.viewsAdded).to.deep.equal(['active_by_flight', 'all_by_name', 'flights']);
            expect(result.keysRemoved).to.deep.equal([]);
            expect(result.attachmentsRemoved).to.deep.equal([]);
        });

        it('lists stub attachments on a dry run and refuses to apply them', async () => {
            const { runDesignDeploy } = await loadDeploy();
            const live = couchappLive();
            live._attachments['images/logo.png'] = {
                content_type: 'image/png',
                stub: true,
                length: 4,
                digest: 'md5-logo'
            };
            delete live._attachments['images/logo.png'].data;

            const dryDb = recordingDb(live);
            const dry = await runDesignDeploy(['--env', 'dev'], deployDeps({ db: dryDb }));
            expect(dry.attachmentsRemoved).to.include('images/logo.png');
            expect(dry.attachmentsRemoved).to.include('index.html');
            expect(dryDb.puts).to.deep.equal([]);

            const applyDb = recordingDb(JSON.parse(JSON.stringify(live)));
            let backedUp = false;
            const error = await expectCode(runDesignDeploy(['--apply', '--env', 'dev'], deployDeps({
                db: applyDb,
                writeBackup: async () => {
                    backedUp = true;
                    return 'backup.json';
                }
            })), 'INCOMPLETE_BACKUP');
            expect(error.message).to.match(/images\/logo\.png/);
            expect(backedUp).to.equal(false);
            expect(applyDb.events).to.deep.equal([['get', '_design/basic']]);
            expect(applyDb.puts).to.deep.equal([]);
        });

        it('stops before database access when the source folder is invalid', async () => {
            const { runDesignDeploy } = await loadDeploy();
            const { MaintenanceError } = await import('../scripts/maintenance/errors.mjs');
            const db = recordingDb(couchappLive());
            await expectCode(runDesignDeploy(['--apply', '--env', 'dev'], deployDeps({
                buildDesignDoc: () => {
                    throw new MaintenanceError('views/flights is missing map.js', {
                        code: 'INVALID_SOURCE'
                    });
                },
                db
            })), 'INVALID_SOURCE');
            expect(db.events).to.deep.equal([]);
            expect(db.puts).to.deep.equal([]);
        });

        it('reads couchdb/design/basic from the repository root unless a source dir is injected', async () => {
            const { runDesignDeploy } = await loadDeploy();
            let seen;
            await runDesignDeploy([], deployDeps({
                buildDesignDoc: (dir) => {
                    seen = dir;
                    return builtDoc();
                },
                db: recordingDb(null)
            }));
            expect(path.resolve(seen)).to.equal(path.resolve(repoRoot, 'couchdb', 'design', 'basic'));
        });

        it('defaults the backup directory to the repository root', async () => {
            const { runDesignDeploy } = await loadDeploy();
            const previous = process.cwd();
            process.chdir(dirname(repoRoot));
            let directory;
            try {
                await runDesignDeploy(['--apply', '--env', 'dev'], deployDeps({
                    db: recordingDb(couchappLive()),
                    fs: {
                        mkdir: async (dir) => {
                            directory = dir;
                        },
                        writeFile: async () => {}
                    }
                }));
            } finally {
                process.chdir(previous);
            }
            expect(path.resolve(directory)).to.equal(path.resolve(repoRoot, 'maintenance-backups'));
        });

        it('dry run loads the live doc through createDesignDeployDb with attachment bodies', async () => {
            const { runDesignDeploy } = await loadDeploy();
            const calls = [];
            const live = {
                _id: '_design/basic',
                _rev: '2-a',
                language: 'javascript',
                views: builtDoc().views,
                lists: builtDoc().lists,
                _attachments: {
                    'index.html': { content_type: 'text/html', data: 'PGh0bWw+' }
                }
            };
            const result = await runDesignDeploy([], deployDeps({
                fetchImpl: async (url, options = {}) => {
                    calls.push([String(url), options.method || 'GET']);
                    if (String(url).includes('/_session')) {
                        return {
                            ok: true,
                            status: 200,
                            headers: {
                                get(name) {
                                    return name.toLowerCase() === 'set-cookie'
                                        ? 'AuthSession=abc123; Version=1; Path=/; HttpOnly'
                                        : null;
                                }
                            },
                            json: async () => ({ ok: true })
                        };
                    }
                    return { ok: true, status: 200, json: async () => live };
                }
            }));
            const designCalls = calls.filter((call) => call[0].includes('/_design/basic'));
            expect(designCalls).to.have.length(1);
            const parsed = new URL(designCalls[0][0]);
            expect(parsed.pathname).to.equal('/hf-dev/_design/basic');
            expect(parsed.searchParams.get('attachments')).to.equal('true');
            expect(designCalls[0][1]).to.not.equal('PUT');
            expect(calls.some((call) => call[1] === 'PUT')).to.equal(false);
            expect(result.dryRun).to.equal(true);
            expect(result.attachmentsRemoved).to.deep.equal(['index.html']);
            expect(result.changed).to.equal(0);
        });
    });
});
