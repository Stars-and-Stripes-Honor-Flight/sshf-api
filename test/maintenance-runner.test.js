/**
 * Behavioral contract for the one-time maintenance runner (issue #163).
 *
 * Implemented later, imported here:
 *   scripts/maintenance/errors.mjs
 *     MaintenanceError
 *   scripts/maintenance/runner.mjs
 *     parseMaintArgs, resolveMaintTarget, confirmApply,
 *     backupFileName, backupPath, writeBackup,
 *     MAINT_BULK_BATCH_SIZE, writeBulkDocs,
 *     resolveScriptPath, loadMaintenanceScript,
 *     formatSummary, runMaintenance
 *   scripts/maintenance/couch.mjs
 *     createCouchMaintenanceDb
 */
import { expect } from 'chai';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BULK_BATCH_SIZE } from '../utils/bulk_docs.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const runnerHref = '../scripts/maintenance/runner.mjs';
const couchHref = '../scripts/maintenance/couch.mjs';
const errorsHref = '../scripts/maintenance/errors.mjs';

const SCRIPT_NAME = '2026-11-14-remove-loc-zipcode-docs';
const FIXED_DATE = new Date('2026-11-14T18:22:00.123Z');
const BACKUP_FILENAME = `${SCRIPT_NAME}-2026-11-14T182200.123Z.json`;

const targetEnv = {
    DB_URL: 'http://127.0.0.1:5984',
    DB_NAME: 'hf-default',
    DEV_DB_NAME: 'hf-dev',
    PRD_DB_NAME: 'hf',
    DB_USER: 'maint-user',
    DB_PASS: 'maint-secret'
};

function emptyPlan() {
    return {
        matched: 0,
        writes: [],
        originals: [],
        skipped: [],
        flagged: [],
        sample: []
    };
}

function scriptModule(plan) {
    return {
        name: SCRIPT_NAME,
        SCRIPT_NAME,
        plan
    };
}

function planThatReads(build) {
    return async (db) => {
        await db.allDocs({ startkey: 'loc-' });
        return build();
    };
}

function deletion(id, rev = '1-a') {
    return { _id: id, _rev: rev, _deleted: true };
}

function deletions(count) {
    return Array.from({ length: count }, (_, index) => deletion(
        `loc-${String(index).padStart(5, '0')}`
    ));
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

function header(headers, name) {
    if (!headers) {
        return undefined;
    }
    if (typeof headers.get === 'function') {
        return headers.get(name);
    }
    const match = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
    return match ? headers[match] : undefined;
}

function requestUrl(input) {
    return new URL(String(input));
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

describe('maintenance runner', () => {
    describe('repo contract', () => {
        it('registers a cross-platform npm run maint command', () => {
            const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
            expect(pkg.scripts.maint).to.equal('node scripts/maintenance/runner.mjs');
            expect(pkg.scripts.maint).to.not.match(/\b(bash|sh|powershell|cmd\.exe|export)\b/i);
            expect(pkg.scripts.maint).to.not.match(/^[A-Za-z_][A-Za-z0-9_]*=/);
        });

        it('gitignores maintenance-backups/', () => {
            const lines = readFileSync(join(repoRoot, '.gitignore'), 'utf8').split(/\r?\n/);
            expect(lines).to.include('maintenance-backups/');
        });

        it('documents how to write and run a maintenance script', () => {
            const readmePath = join(repoRoot, 'scripts', 'maintenance', 'README.md');
            expect(existsSync(readmePath), readmePath).to.equal(true);
            const readme = readFileSync(readmePath, 'utf8');
            expect(readme).to.match(/npm run maint/);
            expect(readme).to.match(/--apply/);
            expect(readme).to.match(/--env/);
            expect(readme).to.match(/maintenance-backups/);
            expect(readme).to.match(/dry[- ]run/i);
            expect(readme).to.match(/database name/i);
            expect(readme).to.match(/YYYY-MM-DD/);
        });
    });

    describe('MaintenanceError', () => {
        it('is an Error with a stable code', async () => {
            const { MaintenanceError } = await import(errorsHref);
            const error = new MaintenanceError('Confirmation was missing.', {
                code: 'CONFIRMATION_REQUIRED'
            });
            expect(error).to.be.instanceOf(Error);
            expect(error.name).to.equal('MaintenanceError');
            expect(error.code).to.equal('CONFIRMATION_REQUIRED');
            expect(error.message).to.equal('Confirmation was missing.');
        });
    });

    describe('parseMaintArgs', () => {
        it('reads the script name, --apply, and --env prd from argv tokens', async () => {
            const { parseMaintArgs } = await import(runnerHref);
            expect(parseMaintArgs([SCRIPT_NAME, '--apply', '--env', 'prd'])).to.deep.equal({
                scriptName: SCRIPT_NAME,
                apply: true,
                env: 'prd'
            });
            expect(parseMaintArgs(['--env', 'dev', '--apply', SCRIPT_NAME])).to.deep.equal({
                scriptName: SCRIPT_NAME,
                apply: true,
                env: 'dev'
            });
        });

        it('defaults to a dev dry run when --apply and --env are omitted', async () => {
            const { parseMaintArgs } = await import(runnerHref);
            expect(parseMaintArgs([SCRIPT_NAME])).to.deep.equal({
                scriptName: SCRIPT_NAME,
                apply: false,
                env: 'dev'
            });
            expect(parseMaintArgs([`${SCRIPT_NAME}.mjs`]).scriptName).to.equal(SCRIPT_NAME);
        });

        it('rejects --apply when --env is missing', async () => {
            const { parseMaintArgs } = await import(runnerHref);
            expectSyncCode(() => parseMaintArgs([SCRIPT_NAME, '--apply']), 'USAGE');
            expectSyncCode(() => parseMaintArgs(['--apply', SCRIPT_NAME]), 'USAGE');
        });

        it('accepts --env=dev and --env=prd as a single argv token', async () => {
            const { parseMaintArgs } = await import(runnerHref);
            expect(parseMaintArgs([SCRIPT_NAME, '--env=prd'])).to.deep.equal({
                scriptName: SCRIPT_NAME,
                apply: false,
                env: 'prd'
            });
            expect(parseMaintArgs([SCRIPT_NAME, '--apply', '--env=dev']).env).to.equal('dev');
        });

        it('does not take the mode from process.env', async () => {
            const previous = { MAINT_ENV: process.env.MAINT_ENV };
            process.env.MAINT_ENV = 'prd';
            try {
                const { parseMaintArgs } = await import(runnerHref);
                expect(parseMaintArgs([SCRIPT_NAME])).to.deep.equal({
                    scriptName: SCRIPT_NAME,
                    apply: false,
                    env: 'dev'
                });
            } finally {
                restoreEnv(previous);
            }
        });

        it('rejects a missing script name', async () => {
            const { parseMaintArgs } = await import(runnerHref);
            for (const argv of [[], ['--apply'], ['--env', 'prd'], ['--apply', '--env', 'dev']]) {
                expectSyncCode(() => parseMaintArgs(argv), 'USAGE');
            }
        });

        it('rejects unknown flags, duplicate flags, and bad --env values', async () => {
            const { parseMaintArgs } = await import(runnerHref);
            const cases = [
                [SCRIPT_NAME, '--force'],
                [SCRIPT_NAME, '--help'],
                [SCRIPT_NAME, '--apply=true'],
                [SCRIPT_NAME, '--env'],
                [SCRIPT_NAME, '--env='],
                [SCRIPT_NAME, '--env', 'staging'],
                [SCRIPT_NAME, '--env', 'PRD'],
                [SCRIPT_NAME, '--env', 'prd', '--env', 'dev'],
                [SCRIPT_NAME, '--apply', '--apply'],
                [SCRIPT_NAME, '--env=production']
            ];
            for (const argv of cases) {
                expectSyncCode(() => parseMaintArgs(argv), 'USAGE');
            }
        });

        it('rejects path-like, uppercase, and otherwise malformed script names', async () => {
            const { parseMaintArgs } = await import(runnerHref);
            const names = [
                '../utils/db',
                'scripts/maintenance/2026-11-14-remove-loc-zipcode-docs',
                '2026-11-14-remove-loc-zipcode-docs\\extra',
                '2026-11-14-Remove-Loc',
                '2026-11-14',
                '2026-11-14-',
                'remove-loc-zipcode-docs',
                `${SCRIPT_NAME}.js`,
                `${SCRIPT_NAME}.mjs.mjs`,
                ''
            ];
            for (const name of names) {
                expectSyncCode(() => parseMaintArgs([name]), 'USAGE');
            }
            expectSyncCode(() => parseMaintArgs([SCRIPT_NAME, 'extra']), 'USAGE');
        });
    });

    describe('resolveMaintTarget', () => {
        it('uses the injected env object rather than a shell prefix on process.env', async () => {
            const previous = {
                DB_URL: process.env.DB_URL,
                DB_NAME: process.env.DB_NAME,
                DB_USER: process.env.DB_USER,
                DB_PASS: process.env.DB_PASS
            };
            process.env.DB_URL = 'http://from-shell.example/ignored';
            process.env.DB_NAME = 'from-shell';
            process.env.DB_USER = 'shell-user';
            process.env.DB_PASS = 'shell-secret';
            try {
                const { resolveMaintTarget } = await import(runnerHref);
                const target = resolveMaintTarget({ envName: 'dev', env: targetEnv });
                expect(target).to.include({
                    envName: 'dev',
                    host: '127.0.0.1:5984',
                    database: 'hf-dev',
                    url: 'http://127.0.0.1:5984',
                    user: 'maint-user',
                    pass: 'maint-secret'
                });
            } finally {
                restoreEnv(previous);
            }
        });

        it('reports the URL host and strips a trailing slash from DB_URL', async () => {
            const { resolveMaintTarget } = await import(runnerHref);
            const target = resolveMaintTarget({
                envName: 'prd',
                env: { ...targetEnv, DB_URL: 'http://127.0.0.1:5984/' }
            });
            expect(target.host).to.equal('127.0.0.1:5984');
            expect(target.url).to.equal('http://127.0.0.1:5984');
            expect(target.database).to.equal('hf');
        });

        it('selects DEV_DB_NAME and PRD_DB_NAME for each --env mode with shared credentials', async () => {
            const { resolveMaintTarget } = await import(runnerHref);
            const env = {
                ...targetEnv,
                DEV_DB_NAME: 'dev-db',
                PRD_DB_NAME: 'prd-db'
            };
            expect(resolveMaintTarget({ envName: 'dev', env }).database).to.equal('dev-db');
            expect(resolveMaintTarget({ envName: 'prd', env }).database).to.equal('prd-db');
            expect(resolveMaintTarget({ envName: 'dev', env }).user).to.equal(env.DB_USER);
            expect(resolveMaintTarget({ envName: 'prd', env }).pass).to.equal(env.DB_PASS);
        });

        it('rejects incomplete database settings and an invalid DB_URL', async () => {
            const { resolveMaintTarget } = await import(runnerHref);
            const keys = ['DB_URL', 'DB_USER', 'DB_PASS'];
            for (const key of keys) {
                const env = { ...targetEnv };
                delete env[key];
                expectSyncCode(() => resolveMaintTarget({ envName: 'dev', env }), 'CONFIG');
            }
            expectSyncCode(() => resolveMaintTarget({
                envName: 'dev',
                env: { ...targetEnv, DEV_DB_NAME: undefined, DB_NAME: undefined }
            }), 'CONFIG');
            expectSyncCode(() => resolveMaintTarget({
                envName: 'dev',
                env: { ...targetEnv, DB_URL: 'not-a-url' }
            }), 'CONFIG');
            expectSyncCode(() => resolveMaintTarget({
                envName: 'staging',
                env: targetEnv
            }), 'USAGE');
        });
    });

    describe('confirmApply', () => {
        it('accepts the database name on prd --apply after trimming a Windows newline', async () => {
            const { confirmApply } = await import(runnerHref);
            const questions = [];
            await confirmApply({
                envName: 'prd',
                apply: true,
                database: 'hf',
                prompt: async (question) => {
                    questions.push(question);
                    return 'hf\r\n';
                }
            });
            expect(questions).to.have.length(1);
            expect(questions[0]).to.include('hf');
            expect(questions[0]).to.not.include('maint-secret');
        });

        it('aborts prd --apply when the confirmation is wrong or missing', async () => {
            const { confirmApply } = await import(runnerHref);
            const answers = ['HF', 'hf-copy', '127.0.0.1:5984', '', '   ', 'hf\nextra'];
            for (const answer of answers) {
                await expectCode(confirmApply({
                    envName: 'prd',
                    apply: true,
                    database: 'hf',
                    prompt: async () => answer
                }), 'CONFIRMATION_REQUIRED');
            }
            await expectCode(confirmApply({
                envName: 'prd',
                apply: true,
                database: 'hf',
                prompt: async () => undefined
            }), 'CONFIRMATION_REQUIRED');
            await expectCode(confirmApply({
                envName: 'prd',
                apply: true,
                database: 'hf'
            }), 'CONFIRMATION_REQUIRED');
        });

        it('does not prompt for dev --apply or for a dry run', async () => {
            const { confirmApply } = await import(runnerHref);
            let calls = 0;
            const prompt = async () => {
                calls += 1;
                return 'hf';
            };
            await confirmApply({ envName: 'dev', apply: true, database: 'hf-dev', prompt });
            await confirmApply({ envName: 'prd', apply: false, database: 'hf', prompt });
            await confirmApply({ envName: 'dev', apply: false, database: 'hf-dev', prompt });
            expect(calls).to.equal(0);
        });
    });

    describe('backups', () => {
        it('builds a Windows-safe backup file name without colon characters', async () => {
            const { backupFileName } = await import(runnerHref);
            const fileName = backupFileName(SCRIPT_NAME, FIXED_DATE);
            expect(fileName).to.equal(BACKUP_FILENAME);
            expect(fileName).to.not.include(':');
        });

        it('joins backup paths with the provided path implementation', async () => {
            const { backupPath } = await import(runnerHref);
            const winRoot = 'C:\\Users\\steve\\Repos\\sshf-api';
            const posixRoot = '/home/steve/Repos/sshf-api';
            expect(backupPath(winRoot, SCRIPT_NAME, FIXED_DATE, path.win32)).to.equal(
                path.win32.join(winRoot, 'maintenance-backups', BACKUP_FILENAME)
            );
            expect(backupPath(posixRoot, SCRIPT_NAME, FIXED_DATE, path.posix)).to.equal(
                path.posix.join(posixRoot, 'maintenance-backups', BACKUP_FILENAME)
            );
        });

        it('writes the full original documents before returning the backup path', async () => {
            const { writeBackup } = await import(runnerHref);
            const rootDir = join('var', 'maint-root');
            const documents = [{ _id: 'loc-10001', _rev: '1-a', city: 'New York' }];
            let mkdirArgs;
            let written;
            const filePath = await writeBackup({
                rootDir,
                scriptName: SCRIPT_NAME,
                date: FIXED_DATE,
                documents,
                meta: {
                    env: 'prd',
                    host: '127.0.0.1:5984',
                    database: 'hf'
                },
                fs: {
                    mkdir: async (dir, options) => {
                        mkdirArgs = [dir, options];
                    },
                    writeFile: async (file, data) => {
                        written = [file, data];
                    }
                }
            });

            expect(filePath).to.equal(join(rootDir, 'maintenance-backups', BACKUP_FILENAME));
            expect(mkdirArgs[0]).to.equal(join(rootDir, 'maintenance-backups'));
            expect(mkdirArgs[1]).to.include({ recursive: true });
            expect(written[0]).to.equal(filePath);
            const payload = JSON.parse(written[1]);
            expect(payload).to.deep.include({
                script: SCRIPT_NAME,
                createdAt: '2026-11-14T18:22:00.123Z',
                env: 'prd',
                host: '127.0.0.1:5984',
                database: 'hf'
            });
            expect(payload.documents).to.deep.equal(documents);
            expect(JSON.stringify(payload)).to.not.include('maint-secret');
            expect(payload).to.not.have.property('pass');
            expect(payload).to.not.have.property('password');
        });

        it('defaults the backup root to the repository root', async () => {
            const { writeBackup } = await import(runnerHref);
            const previous = process.cwd();
            process.chdir(dirname(repoRoot));
            let directory;
            try {
                await writeBackup({
                    scriptName: SCRIPT_NAME,
                    date: FIXED_DATE,
                    documents: [],
                    fs: {
                        mkdir: async (dir) => {
                            directory = dir;
                        },
                        writeFile: async () => {}
                    }
                });
            } finally {
                process.chdir(previous);
            }
            expect(path.resolve(directory)).to.equal(path.resolve(repoRoot, 'maintenance-backups'));
        });

        it('propagates a backup write failure and does not continue to writeFile', async () => {
            const { writeBackup } = await import(runnerHref);
            let wrote = false;
            try {
                await writeBackup({
                    rootDir: join('var', 'maint-root'),
                    scriptName: SCRIPT_NAME,
                    date: FIXED_DATE,
                    documents: [{ _id: 'loc-10001', _rev: '1-a' }],
                    fs: {
                        mkdir: async () => {
                            throw new Error('disk full');
                        },
                        writeFile: async () => {
                            wrote = true;
                        }
                    }
                });
                expect.fail('expected writeBackup to fail');
            } catch (error) {
                if (error?.code === 'ERR_MODULE_NOT_FOUND') {
                    throw error;
                }
                expect(error.message).to.equal('disk full');
            }
            expect(wrote).to.equal(false);
        });
    });

    describe('writeBulkDocs', () => {
        it('sends documents in batches of 100 without dropping or adding fields', async () => {
            const { writeBulkDocs, MAINT_BULK_BATCH_SIZE } = await import(runnerHref);
            expect(MAINT_BULK_BATCH_SIZE).to.equal(100);
            expect(MAINT_BULK_BATCH_SIZE).to.equal(BULK_BATCH_SIZE);
            const docs = deletions(250);
            const sizes = [];
            const result = await writeBulkDocs({
                docs,
                bulkDocs: async (batch) => {
                    sizes.push(batch.length);
                    expect(batch.every((doc) => doc._rev === '1-a' && doc._deleted === true)).to.equal(true);
                    return batch.map((doc) => ({ id: doc._id, ok: true, rev: '2-b' }));
                }
            });
            expect(sizes).to.deep.equal([100, 100, 50]);
            expect(result.saved).to.have.length(250);
            expect(result.conflicts).to.deep.equal([]);
            expect(result.failed).to.deep.equal([]);
            expect(result.saved[0]).to.deep.equal({ id: 'loc-00000', rev: '2-b' });
            expect(result.saved[249].id).to.equal('loc-00249');
        });

        it('reports a _rev conflict once and does not force or retry it', async () => {
            const { writeBulkDocs } = await import(runnerHref);
            const seen = [];
            const result = await writeBulkDocs({
                docs: deletions(3),
                bulkDocs: async (batch) => {
                    seen.push(batch);
                    return batch.map((doc, index) => (index === 1
                        ? { id: doc._id, error: 'conflict', reason: 'secret-conflict-reason' }
                        : { id: doc._id, ok: true, rev: '2-b' }));
                }
            });
            expect(seen).to.have.length(1);
            expect(seen[0][1]).to.deep.equal(deletion('loc-00001'));
            expect(result.saved.map((item) => item.id)).to.deep.equal(['loc-00000', 'loc-00002']);
            expect(result.conflicts).to.deep.equal([{ id: 'loc-00001', error: 'conflict' }]);
            expect(result.failed).to.deep.equal([]);
            expect(JSON.stringify(result)).to.not.include('secret-conflict-reason');
        });

        it('counts non-conflict per-document errors as failures', async () => {
            const { writeBulkDocs } = await import(runnerHref);
            const result = await writeBulkDocs({
                docs: deletions(2),
                bulkDocs: async (batch) => ([
                    { id: batch[0]._id, error: 'forbidden', reason: 'secret-forbidden' },
                    undefined
                ])
            });
            expect(result.saved).to.deep.equal([]);
            expect(result.conflicts).to.deep.equal([]);
            expect(result.failed.map((item) => item.id)).to.deep.equal(['loc-00000', 'loc-00001']);
            expect(result.failed[0].error).to.equal('forbidden');
            expect(JSON.stringify(result)).to.not.include('secret-forbidden');
        });

        it('refuses a document that has no _rev and does not call bulkDocs', async () => {
            const { writeBulkDocs } = await import(runnerHref);
            let called = false;
            await expectCode(writeBulkDocs({
                docs: [{ _id: 'loc-10001', _deleted: true }],
                bulkDocs: async () => {
                    called = true;
                    return [];
                }
            }), 'INVALID_SCRIPT');
            expect(called).to.equal(false);
        });

        it('does not call bulkDocs when there is nothing to write', async () => {
            const { writeBulkDocs } = await import(runnerHref);
            let called = false;
            const result = await writeBulkDocs({
                docs: [],
                bulkDocs: async () => {
                    called = true;
                    return [];
                }
            });
            expect(called).to.equal(false);
            expect(result).to.deep.equal({ saved: [], conflicts: [], failed: [] });
        });
    });

    describe('script loading', () => {
        it('joins the script path for Windows and POSIX and imports a file URL', async () => {
            const { resolveScriptPath, loadMaintenanceScript } = await import(runnerHref);
            const winDir = 'C:\\Users\\steve\\Repos\\sshf-api\\scripts\\maintenance';
            const posixDir = '/home/steve/Repos/sshf-api/scripts/maintenance';
            expect(resolveScriptPath(winDir, SCRIPT_NAME, path.win32)).to.equal(
                path.win32.join(winDir, `${SCRIPT_NAME}.mjs`)
            );
            expect(resolveScriptPath(posixDir, `${SCRIPT_NAME}.mjs`, path.posix)).to.equal(
                path.posix.join(posixDir, `${SCRIPT_NAME}.mjs`)
            );

            let href;
            const loaded = await loadMaintenanceScript(SCRIPT_NAME, {
                importModule: async (url) => {
                    href = url;
                    return scriptModule(async () => emptyPlan());
                }
            });
            expect(href).to.equal(pathToFileURL(
                join(repoRoot, 'scripts', 'maintenance', `${SCRIPT_NAME}.mjs`)
            ).href);
            expect(loaded.name).to.equal(SCRIPT_NAME);
            expect(loaded.plan).to.be.a('function');
        });

        it('rejects traversal and a module that does not export plan', async () => {
            const { resolveScriptPath, loadMaintenanceScript } = await import(runnerHref);
            const dir = join(repoRoot, 'scripts', 'maintenance');
            for (const name of ['../db', 'foo/bar', 'foo\\bar', '2026-11-14', 'Not-A-Script']) {
                expectSyncCode(() => resolveScriptPath(dir, name), 'USAGE');
            }

            await expectCode(loadMaintenanceScript(SCRIPT_NAME, {
                scriptsDir: dir,
                importModule: async () => ({})
            }), 'INVALID_SCRIPT');
            await expectCode(loadMaintenanceScript(SCRIPT_NAME, {
                scriptsDir: dir,
                importModule: async () => ({
                    name: '2099-01-01-other',
                    plan: async () => emptyPlan()
                })
            }), 'INVALID_SCRIPT');
            const missing = Object.assign(new Error('missing'), { code: 'ERR_MODULE_NOT_FOUND' });
            await expectCode(loadMaintenanceScript('2099-01-01-missing', {
                scriptsDir: dir,
                importModule: async () => {
                    throw missing;
                }
            }), 'UNKNOWN_SCRIPT');
        });

        it('rejects a well-formed script name that is not in scripts/maintenance', async () => {
            const { loadMaintenanceScript } = await import(runnerHref);
            await expectCode(
                loadMaintenanceScript('2099-01-01-missing'),
                'UNKNOWN_SCRIPT'
            );
        });
    });

    describe('formatSummary', () => {
        it('lists matched, changed, skipped, conflicts, flagged ids, and the backup', async () => {
            const { formatSummary } = await import(runnerHref);
            const backup = join('maintenance-backups', BACKUP_FILENAME);
            const text = formatSummary({
                script: SCRIPT_NAME,
                env: 'prd',
                host: '127.0.0.1:5984',
                database: 'hf',
                dryRun: false,
                matched: 4,
                changed: 2,
                skipped: 1,
                conflicts: 1,
                failed: 0,
                flagged: 1,
                flaggedIds: ['loc-abc'],
                sample: [
                    { id: 'loc-10001' },
                    { id: 'loc-abc' }
                ],
                backupPath: backup
            });
            expect(text).to.equal([
                `script: ${SCRIPT_NAME}`,
                'env: prd',
                'host: 127.0.0.1:5984',
                'database: hf',
                'dryRun: false',
                'matched: 4',
                'changed: 2',
                'skipped: 1',
                'conflicts: 1',
                'failed: 0',
                'flagged: 1',
                'flaggedIds: loc-abc',
                'sample: loc-10001, loc-abc',
                `backup: ${backup}`
            ].join('\n'));
            expect(text).to.not.include('\r');

            const empty = formatSummary({
                script: SCRIPT_NAME,
                env: 'dev',
                host: '127.0.0.1:5984',
                database: 'hf',
                dryRun: true,
                matched: 0,
                changed: 0,
                skipped: 0,
                conflicts: 0,
                failed: 0,
                flagged: 0,
                flaggedIds: [],
                sample: [],
                backupPath: null
            });
            expect(empty).to.include('flaggedIds: none');
            expect(empty).to.include('sample: none');
            expect(empty).to.include('backup: none');
            expect(empty).to.include('dryRun: true');
        });
    });

    describe('runMaintenance', () => {
        function originalDoc(id = 'loc-10001') {
            return { _id: id, _rev: '1-a', city: 'New York' };
        }

        function planned(docs, extras = {}) {
            const originals = docs.map(originalDoc);
            return {
                matched: originals.length + (extras.skipped || []).length,
                writes: originals.map((doc) => deletion(doc._id, doc._rev)),
                originals,
                skipped: extras.skipped || [],
                flagged: extras.flagged || [],
                sample: originals.slice(0, 5).map((doc) => ({
                    id: doc._id,
                    before: doc,
                    after: deletion(doc._id, doc._rev),
                    flagged: false
                }))
            };
        }

        it('dry run reports the plan and does not back up, write, or prompt', async () => {
            const { runMaintenance, formatSummary } = await import(runnerHref);
            const events = [];
            const logs = [];
            const original = originalDoc();
            const sample = [{
                id: original._id,
                before: original,
                after: deletion(original._id),
                flagged: false
            }];
            const result = await runMaintenance([SCRIPT_NAME, '--env', 'dev'], {
                env: targetEnv,
                log: (line) => logs.push(String(line)),
                prompt: async () => {
                    events.push('prompt');
                    return 'hf';
                },
                loadScript: async () => scriptModule(planThatReads(() => ({
                    matched: 2,
                    writes: [deletion(original._id)],
                    originals: [original],
                    skipped: [{ id: 'loc-abc', reason: 'unexpected-id' }],
                    flagged: [{ id: 'loc-abc', reason: 'unexpected-id' }],
                    sample
                }))),
                writeBackup: async () => {
                    events.push('backup');
                    return 'backup.json';
                },
                db: {
                    allDocs: async () => {
                        events.push('read');
                        return { rows: [] };
                    },
                    bulkDocs: async () => {
                        events.push('bulk');
                        return [];
                    }
                }
            });

            expect(events).to.deep.equal(['read']);
            expect(result).to.include({
                dryRun: true,
                script: SCRIPT_NAME,
                env: 'dev',
                host: '127.0.0.1:5984',
                database: 'hf-dev',
                matched: 2,
                changed: 0,
                skipped: 1,
                conflicts: 0,
                failed: 0,
                flagged: 1,
                backupPath: null
            });
            expect(result.flaggedIds).to.deep.equal(['loc-abc']);
            expect(result.sample).to.deep.equal(sample);
            expect(logs[0]).to.equal('Target host=127.0.0.1:5984 database=hf-dev env=dev');
            expect(logs.at(-1)).to.equal(formatSummary(result));
            expect(logs.join('\n')).to.not.include('maint-secret');
        });

        it('writes the backup and waits for it before any _bulk_docs update', async () => {
            const { runMaintenance } = await import(runnerHref);
            const events = [];
            let backupArgs;
            let inBackup = false;
            let bulkDuringBackup = false;
            const original = originalDoc();
            const result = await runMaintenance([SCRIPT_NAME, '--apply', '--env', 'dev'], {
                env: targetEnv,
                log: () => {},
                now: () => FIXED_DATE,
                loadScript: async () => scriptModule(async (db) => {
                    await db.allDocs({ startkey: 'loc-' });
                    return planned([original._id]);
                }),
                writeBackup: async (args) => {
                    inBackup = true;
                    events.push('backup');
                    backupArgs = args;
                    await new Promise((resolve) => {
                        setImmediate(resolve);
                    });
                    bulkDuringBackup = events.includes('bulk');
                    inBackup = false;
                    return join('maintenance-backups', BACKUP_FILENAME);
                },
                db: {
                    allDocs: async () => {
                        events.push('read');
                        return { rows: [] };
                    },
                    bulkDocs: async (docs) => {
                        expect(inBackup).to.equal(false);
                        events.push('bulk');
                        expect(docs).to.deep.equal([deletion(original._id)]);
                        return [{ id: original._id, ok: true, rev: '2-b' }];
                    }
                }
            });

            expect(events).to.deep.equal(['read', 'backup', 'bulk']);
            expect(bulkDuringBackup).to.equal(false);
            expect(backupArgs.scriptName).to.equal(SCRIPT_NAME);
            expect(backupArgs.documents).to.deep.equal([original]);
            expect(backupArgs.date.toISOString()).to.equal(FIXED_DATE.toISOString());
            expect(backupArgs.meta).to.include({
                env: 'dev',
                host: '127.0.0.1:5984',
                database: 'hf-dev'
            });
            expect(JSON.stringify(backupArgs.meta)).to.not.include('maint-secret');
            expect(result.changed).to.equal(1);
            expect(result.backupPath).to.equal(join('maintenance-backups', BACKUP_FILENAME));
            expect(result.dryRun).to.equal(false);
        });

        it('does not update when the backup fails', async () => {
            const { runMaintenance } = await import(runnerHref);
            let bulkCalled = false;
            await expectCode(runMaintenance([SCRIPT_NAME, '--apply', '--env', 'dev'], {
                env: targetEnv,
                log: () => {},
                loadScript: async () => scriptModule(async () => planned(['loc-10001'])),
                writeBackup: async () => {
                    throw new Error('disk full');
                },
                db: {
                    allDocs: async () => ({ rows: [] }),
                    bulkDocs: async () => {
                        bulkCalled = true;
                        return [];
                    }
                }
            }), 'BACKUP_FAILED');
            expect(bulkCalled).to.equal(false);
        });

        it('aborts a prd apply before any read or write when confirmation is wrong or missing', async () => {
            const { runMaintenance } = await import(runnerHref);
            for (const prompt of [async () => 'nope', async () => '', undefined]) {
                const events = [];
                let sawTarget = false;
                const deps = {
                    env: targetEnv,
                    log: (line) => {
                        const text = String(line);
                        if (text === 'Target host=127.0.0.1:5984 database=hf env=prd') {
                            sawTarget = true;
                        }
                    },
                    loadScript: async () => {
                        events.push('load');
                        return scriptModule(planThatReads(() => planned(['loc-10001'])));
                    },
                    writeBackup: async () => {
                        events.push('backup');
                        return 'backup.json';
                    },
                    db: {
                        allDocs: async () => {
                            events.push('read');
                            return { rows: [] };
                        },
                        bulkDocs: async () => {
                            events.push('bulk');
                            return [];
                        }
                    }
                };
                if (prompt) {
                    deps.prompt = async (question) => {
                        expect(sawTarget).to.equal(true);
                        expect(question).to.include('hf');
                        events.push('prompt');
                        return prompt();
                    };
                }
                await expectCode(
                    runMaintenance([SCRIPT_NAME, '--apply', '--env', 'prd'], deps),
                    'CONFIRMATION_REQUIRED'
                );
                expect(events).to.deep.equal(prompt ? ['load', 'prompt'] : ['load']);
                expect(sawTarget).to.equal(true);
            }
        });

        it('applies on prd after the operator types the database name', async () => {
            const { runMaintenance } = await import(runnerHref);
            const events = [];
            const result = await runMaintenance([SCRIPT_NAME, '--apply', '--env=prd'], {
                env: targetEnv,
                log: () => {},
                prompt: async () => {
                    events.push('prompt');
                    return ' hf ';
                },
                loadScript: async () => scriptModule(planThatReads(() => planned(['loc-10001']))),
                writeBackup: async () => {
                    events.push('backup');
                    return 'backup.json';
                },
                db: {
                    allDocs: async () => {
                        events.push('read');
                        return { rows: [] };
                    },
                    bulkDocs: async (docs) => {
                        events.push('bulk');
                        return docs.map((doc) => ({ id: doc._id, ok: true, rev: '2-b' }));
                    }
                }
            });
            expect(events).to.deep.equal(['prompt', 'read', 'backup', 'bulk']);
            expect(result.changed).to.equal(1);
            expect(result.conflicts).to.equal(0);
            expect(result.env).to.equal('prd');
        });

        it('applies on dev without asking for a typed confirmation', async () => {
            const { runMaintenance } = await import(runnerHref);
            const events = [];
            const result = await runMaintenance([SCRIPT_NAME, '--apply', '--env', 'dev'], {
                env: targetEnv,
                log: () => {},
                prompt: async () => {
                    events.push('prompt');
                    return 'hf';
                },
                loadScript: async () => scriptModule(planThatReads(() => planned(['loc-10001', 'loc-10002']))),
                writeBackup: async (args) => {
                    events.push('backup');
                    expect(args.documents.map((item) => item._id)).to.deep.equal(['loc-10001', 'loc-10002']);
                    return 'backup.json';
                },
                db: {
                    allDocs: async () => {
                        events.push('read');
                        return { rows: [] };
                    },
                    bulkDocs: async (docs) => {
                        events.push('bulk');
                        expect(docs.map((item) => item._id)).to.deep.equal(['loc-10001', 'loc-10002']);
                        return docs.map((item) => ({ id: item._id, ok: true, rev: '2-b' }));
                    }
                }
            });
            expect(events).to.deep.equal(['read', 'backup', 'bulk']);
            expect(result.dryRun).to.equal(false);
            expect(result.changed).to.equal(2);
            expect(result.env).to.equal('dev');
        });

        it('does not prompt or write for a prd dry run', async () => {
            const { runMaintenance } = await import(runnerHref);
            const events = [];
            const result = await runMaintenance([SCRIPT_NAME, '--env', 'prd'], {
                env: targetEnv,
                log: () => {},
                prompt: async () => {
                    events.push('prompt');
                    return 'hf';
                },
                loadScript: async () => scriptModule(planThatReads(() => planned(['loc-10001']))),
                writeBackup: async () => {
                    events.push('backup');
                    return 'backup.json';
                },
                db: {
                    allDocs: async () => {
                        events.push('read');
                        return { rows: [] };
                    },
                    bulkDocs: async () => {
                        events.push('bulk');
                        return [];
                    }
                }
            });
            expect(events).to.deep.equal(['read']);
            expect(result.dryRun).to.equal(true);
            expect(result.changed).to.equal(0);
            expect(result.backupPath).to.equal(null);
        });

        it('rejects an unknown script name before prompting or writing', async () => {
            const { runMaintenance } = await import(runnerHref);
            const events = [];
            await expectCode(runMaintenance(['2099-01-01-missing', '--apply', '--env', 'prd'], {
                env: targetEnv,
                log: () => {},
                prompt: async () => {
                    events.push('prompt');
                    return 'hf';
                },
                writeBackup: async () => {
                    events.push('backup');
                    return 'backup.json';
                },
                db: {
                    allDocs: async () => {
                        events.push('read');
                        return { rows: [] };
                    },
                    bulkDocs: async () => {
                        events.push('bulk');
                        return [];
                    }
                }
            }), 'UNKNOWN_SCRIPT');
            expect(events).to.deep.equal([]);
        });

        it('summarizes matched, changed, skipped, and conflicts without forcing a conflict', async () => {
            const { runMaintenance, formatSummary } = await import(runnerHref);
            const sent = [];
            const logs = [];
            const originals = ['loc-10001', 'loc-10002', 'loc-10003'].map((id) => originalDoc(id));
            const result = await runMaintenance([SCRIPT_NAME, '--apply', '--env', 'dev'], {
                env: targetEnv,
                log: (line) => logs.push(String(line)),
                loadScript: async () => scriptModule(async () => ({
                    matched: 4,
                    writes: originals.map((doc) => deletion(doc._id, doc._rev)),
                    originals,
                    skipped: [{ id: 'loc-abc', reason: 'unexpected-id' }],
                    flagged: [{ id: 'loc-abc', reason: 'unexpected-id' }],
                    sample: [{ id: 'loc-10001', before: originals[0], after: deletion('loc-10001'), flagged: false }]
                })),
                writeBackup: async () => 'backup.json',
                db: {
                    allDocs: async () => ({ rows: [] }),
                    bulkDocs: async (docs) => {
                        sent.push(docs);
                        return docs.map((doc) => (doc._id === 'loc-10002'
                            ? { id: doc._id, error: 'conflict', reason: 'secret-conflict-reason' }
                            : { id: doc._id, ok: true, rev: '2-b' }));
                    }
                }
            });

            expect(sent).to.have.length(1);
            expect(sent[0].map((doc) => doc._id)).to.deep.equal(['loc-10001', 'loc-10002', 'loc-10003']);
            expect(sent[0].every((doc) => doc._rev === '1-a' && doc._deleted === true)).to.equal(true);
            expect(result.matched).to.equal(4);
            expect(result.changed).to.equal(2);
            expect(result.skipped).to.equal(1);
            expect(result.conflicts).to.equal(1);
            expect(result.conflictIds).to.deep.equal(['loc-10002']);
            expect(result.flagged).to.equal(1);
            expect(result.flaggedIds).to.deep.equal(['loc-abc']);
            expect(result.failed).to.equal(0);
            expect(logs.at(-1)).to.equal(formatSummary(result));
            expect(logs.join('\n')).to.not.include('secret-conflict-reason');
            expect(logs.join('\n')).to.not.include('maint-secret');
        });

        it('does not back up or write when the plan has no changes', async () => {
            const { runMaintenance } = await import(runnerHref);
            const events = [];
            const result = await runMaintenance([SCRIPT_NAME, '--apply', '--env', 'dev'], {
                env: targetEnv,
                log: () => {},
                loadScript: async () => scriptModule(planThatReads(() => ({
                    ...emptyPlan(),
                    matched: 1,
                    skipped: [{ id: 'loc-abc', reason: 'unexpected-id' }],
                    flagged: [{ id: 'loc-abc', reason: 'unexpected-id' }]
                }))),
                writeBackup: async () => {
                    events.push('backup');
                    return 'backup.json';
                },
                db: {
                    allDocs: async () => {
                        events.push('read');
                        return { rows: [] };
                    },
                    bulkDocs: async () => {
                        events.push('bulk');
                        return [];
                    }
                }
            });
            expect(events).to.deep.equal(['read']);
            expect(result.dryRun).to.equal(false);
            expect(result.matched).to.equal(1);
            expect(result.changed).to.equal(0);
            expect(result.skipped).to.equal(1);
            expect(result.backupPath).to.equal(null);
        });

        it('rejects an unsafe plan before creating a backup', async () => {
            const { runMaintenance } = await import(runnerHref);
            const events = [];
            await expectCode(runMaintenance([SCRIPT_NAME, '--apply', '--env', 'dev'], {
                env: targetEnv,
                log: () => {},
                loadScript: async () => scriptModule(async () => ({
                    matched: 1,
                    writes: [deletion('loc-10001')],
                    originals: [],
                    skipped: [],
                    flagged: [],
                    sample: []
                })),
                writeBackup: async () => {
                    events.push('backup');
                    return 'backup.json';
                },
                db: {
                    bulkDocs: async () => {
                        events.push('bulk');
                        return [];
                    },
                    allDocs: async () => ({ rows: [] })
                }
            }), 'INVALID_SCRIPT');

            await expectCode(runMaintenance([SCRIPT_NAME, '--apply', '--env', 'dev'], {
                env: targetEnv,
                log: () => {},
                loadScript: async () => scriptModule(async () => ({
                    matched: 1,
                    writes: [{ _id: 'loc-10001', _deleted: true }],
                    originals: [originalDoc()],
                    skipped: [],
                    flagged: [],
                    sample: []
                })),
                writeBackup: async () => {
                    events.push('backup');
                    return 'backup.json';
                },
                db: {
                    bulkDocs: async () => {
                        events.push('bulk');
                        return [];
                    },
                    allDocs: async () => ({ rows: [] })
                }
            }), 'INVALID_SCRIPT');
            expect(events).to.deep.equal([]);
        });

        it('constructs the database client from the resolved target when none is injected', async () => {
            const { runMaintenance } = await import(runnerHref);
            let seen;
            const result = await runMaintenance([SCRIPT_NAME], {
                env: targetEnv,
                log: () => {},
                createDb: (target) => {
                    seen = target;
                    return {
                        allDocs: async () => ({ rows: [] }),
                        bulkDocs: async () => []
                    };
                },
                loadScript: async () => scriptModule(planThatReads(() => emptyPlan()))
            });
            expect(seen).to.include({
                host: '127.0.0.1:5984',
                database: 'hf-dev',
                url: 'http://127.0.0.1:5984',
                user: 'maint-user',
                pass: 'maint-secret'
            });
            expect(result.matched).to.equal(0);
            expect(result.changed).to.equal(0);
        });

        it('propagates a bulk transport failure instead of recording a conflict', async () => {
            const { runMaintenance } = await import(runnerHref);
            let backedUp = false;
            try {
                await runMaintenance([SCRIPT_NAME, '--apply', '--env', 'dev'], {
                    env: targetEnv,
                    log: () => {},
                    loadScript: async () => scriptModule(async () => planned(['loc-10001'])),
                    writeBackup: async () => {
                        backedUp = true;
                        return 'backup.json';
                    },
                    db: {
                        allDocs: async () => ({ rows: [] }),
                        bulkDocs: async () => {
                            throw new Error('couch down');
                        }
                    }
                });
                expect.fail('expected the bulk failure to propagate');
            } catch (error) {
                if (error?.code === 'ERR_MODULE_NOT_FOUND') {
                    throw error;
                }
                expect(error.message).to.equal('couch down');
                expect(error.code).to.not.equal('CONFIRMATION_REQUIRED');
            }
            expect(backedUp).to.equal(true);
        });
    });

    describe('createCouchMaintenanceDb', () => {
        function sessionResponse() {
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

        it('reads _all_docs with a cookie session and a JSON key range', async () => {
            const { createCouchMaintenanceDb } = await import(couchHref);
            const calls = [];
            const db = createCouchMaintenanceDb({
                url: 'http://127.0.0.1:5984/',
                name: 'db name',
                user: 'maint-user',
                pass: 'maint-secret',
                fetchImpl: async (url, options = {}) => {
                    calls.push([url, options]);
                    if (String(url).includes('/_session')) {
                        return sessionResponse();
                    }
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({ rows: [] })
                    };
                }
            });

            await db.allDocs({
                startkey: 'loc-',
                endkey: 'loc-\ufff0',
                include_docs: true,
                limit: 100
            });

            expect(calls).to.have.length(2);
            const [loginUrl, loginOptions] = calls[0];
            expect(requestUrl(loginUrl).pathname).to.equal('/_session');
            expect(loginOptions.method).to.equal('POST');
            expect(header(loginOptions.headers, 'Accept')).to.equal('application/json');
            expect(header(loginOptions.headers, 'Content-Type')).to.equal('application/json');
            expect(JSON.parse(loginOptions.body)).to.deep.equal({
                name: 'maint-user',
                password: 'maint-secret'
            });
            expect(String(loginUrl)).to.not.include('maint-secret');

            const [docsUrl, docsOptions] = calls[1];
            const parsed = requestUrl(docsUrl);
            expect(String(docsUrl)).to.not.include('db name');
            expect(decodeURIComponent(parsed.pathname)).to.equal('/db name/_all_docs');
            expect(JSON.parse(parsed.searchParams.get('startkey'))).to.equal('loc-');
            expect(JSON.parse(parsed.searchParams.get('endkey'))).to.equal('loc-\ufff0');
            expect(parsed.searchParams.get('include_docs')).to.equal('true');
            expect(parsed.searchParams.get('limit')).to.equal('100');
            expect(docsOptions.method || 'GET').to.equal('GET');
            expect(header(docsOptions.headers, 'Accept')).to.equal('application/json');
            expect(header(docsOptions.headers, 'Cookie')).to.equal('AuthSession=abc123');
            expect(header(docsOptions.headers, 'Authorization') ?? null).to.equal(null);
        });

        it('posts _bulk_docs with the current _rev and without forcing edits', async () => {
            const { createCouchMaintenanceDb } = await import(couchHref);
            const calls = [];
            const db = createCouchMaintenanceDb({
                url: 'http://127.0.0.1:5984',
                name: 'hf',
                user: 'maint-user',
                pass: 'maint-secret',
                fetchImpl: async (url, options = {}) => {
                    calls.push([url, options]);
                    if (String(url).includes('/_session')) {
                        return sessionResponse();
                    }
                    return {
                        ok: true,
                        status: 201,
                        json: async () => [{ ok: true, id: 'loc-10001', rev: '2-b' }]
                    };
                }
            });

            const payload = [deletion('loc-10001')];
            const results = await db.bulkDocs(payload);
            expect(results).to.deep.equal([{ ok: true, id: 'loc-10001', rev: '2-b' }]);

            const bulkCall = calls.find((call) => String(call[0]).includes('/_bulk_docs'));
            expect(bulkCall, 'bulk request').to.not.equal(undefined);
            const [url, options] = bulkCall;
            expect(requestUrl(url).pathname).to.equal('/hf/_bulk_docs');
            expect(options.method).to.equal('POST');
            expect(header(options.headers, 'Content-Type')).to.equal('application/json');
            expect(header(options.headers, 'Accept')).to.equal('application/json');
            expect(header(options.headers, 'Cookie')).to.equal('AuthSession=abc123');
            expect(typeof options.body).to.equal('string');
            const body = JSON.parse(options.body);
            expect(Object.keys(body)).to.deep.equal(['docs']);
            expect(body.docs).to.deep.equal(payload);
            expect(body).to.not.have.property('new_edits');
            expect(body).to.not.have.property('all_or_nothing');
        });

        it('logs in once and reuses the session cookie', async () => {
            const { createCouchMaintenanceDb } = await import(couchHref);
            let sessions = 0;
            const db = createCouchMaintenanceDb({
                url: 'http://127.0.0.1:5984',
                name: 'hf',
                user: 'maint-user',
                pass: 'maint-secret',
                fetchImpl: async (url) => {
                    if (String(url).includes('/_session')) {
                        sessions += 1;
                        return sessionResponse();
                    }
                    if (String(url).includes('/_bulk_docs')) {
                        return {
                            ok: true,
                            status: 201,
                            json: async () => [{ ok: true, id: 'loc-10001', rev: '2-b' }]
                        };
                    }
                    return { ok: true, status: 200, json: async () => ({ rows: [] }) };
                }
            });
            await db.allDocs({ startkey: 'loc-', endkey: 'loc-\ufff0', include_docs: true });
            await db.bulkDocs([deletion('loc-10001')]);
            expect(sessions).to.equal(1);
        });

        it('fails login and bulk errors without the password or CouchDB reason', async () => {
            const { createCouchMaintenanceDb } = await import(couchHref);
            const loginDb = createCouchMaintenanceDb({
                url: 'http://127.0.0.1:5984',
                name: 'hf',
                user: 'maint-user',
                pass: 'maint-secret',
                fetchImpl: async () => ({
                    ok: false,
                    status: 401,
                    json: async () => ({
                        error: 'unauthorized',
                        reason: 'Name or password is incorrect. maint-secret'
                    })
                })
            });
            const loginError = await expectCode(
                loginDb.allDocs({ startkey: 'loc-' }),
                'DB'
            );
            expect(loginError.message).to.not.include('maint-secret');
            expect(loginError.message).to.not.include('unauthorized');

            const bulkDb = createCouchMaintenanceDb({
                url: 'http://127.0.0.1:5984',
                name: 'hf',
                user: 'maint-user',
                pass: 'maint-secret',
                fetchImpl: async (url) => {
                    if (String(url).includes('/_session')) {
                        return sessionResponse();
                    }
                    return {
                        ok: false,
                        status: 500,
                        json: async () => ({
                            error: 'internal',
                            reason: 'maint-secret leaked'
                        })
                    };
                }
            });
            const bulkError = await expectCode(
                bulkDb.bulkDocs([deletion('loc-10001')]),
                'DB'
            );
            expect(bulkError.message).to.not.include('maint-secret');
            expect(bulkError.message).to.not.include('leaked');
        });

        it('rejects a client constructed without credentials before fetch', async () => {
            const { createCouchMaintenanceDb } = await import(couchHref);
            let called = false;
            expectSyncCode(() => createCouchMaintenanceDb({
                url: 'http://127.0.0.1:5984',
                name: 'hf',
                user: 'maint-user',
                fetchImpl: async () => {
                    called = true;
                    return sessionResponse();
                }
            }), 'CONFIG');
            expect(called).to.equal(false);
        });
    });
});
