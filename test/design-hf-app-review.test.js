/**
 * Behavioral contract for _design/hf-app-review (issue #168).
 * Basic stays covered by test/design-*.test.js and must not change.
 *
 * scripts/design/build.mjs
 *   buildDesignDoc(sourceDir, { fs, pathImpl, design } = {})
 *   design omitted or 'basic':
 *     _id is _design/basic, lists are required, same INVALID_SOURCE rules
 *   design 'hf-app-review':
 *     _id is _design/hf-app-review
 *     a missing lists/ directory is valid and the document has no lists key
 *     an empty lists/ directory is still INVALID_SOURCE
 *     couchapp leftovers (evently, validate_doc_update.js, _attachments) are
 *     still INVALID_SOURCE
 *   sources are still normalized and trimmed the way couchapp push does
 *
 * scripts/design/diff.mjs
 *   a repo document with no lists key diffs as having no lists
 *
 * scripts/design/couch.mjs
 *   getDesignDoc(id) GETs /{db}/{id}?attachments=true
 *   putDesignDoc(doc) PUTs /{db}/{doc._id} once
 *   the id is the argument or doc._id, not a hardcoded _design/basic
 *   the slash in _design/<name> stays a path slash
 *
 * scripts/design/deploy-basic.mjs
 *   parseDesignDeployArgs
 *     no --design flag returns exactly { apply, env } and no design property
 *     that omission means basic, which is what the existing tests deep-equal
 *     --design basic|hf-app-review and --design=<those> add design
 *     the flag may appear before or after --apply and --env
 *     missing, empty, unknown, and duplicate --design are MaintenanceError USAGE
 *       Unknown design not-a-design. Expected --design basic or --design hf-app-review.
 *       Unknown design. Expected --design basic or --design hf-app-review.
 *       Duplicate --design flag.
 *     --design hf-app-review --apply without --env is still
 *       --apply requires --env dev or --env prd.
 *   DEPLOY_SCRIPT_NAME stays 'deploy-design-basic'
 *   npm script stays node scripts/design/deploy-basic.mjs
 *   runDesignDeploy
 *     injected buildDesignDoc is still called as builder(sourceDir)
 *     the default builder receives { fs, pathImpl, design }
 *     --design basic (and a bare command) keep DEV_DB_NAME / PRD_DB_NAME,
 *       DB_URL / DB_USER / DB_PASS, _design/basic, couchdb/design/basic,
 *       and backup script deploy-design-basic
 *     --design hf-app-review selects:
 *       id _design/hf-app-review
 *       source <repo>/couchdb/design/hf-app-review unless sourceDir is injected
 *       backup script deploy-design-hf-app-review under maintenance-backups/
 *       --env dev uses only DEV_REVIEW_DB_NAME (trimmed)
 *       --env prd uses only PRD_REVIEW_DB_NAME (trimmed)
 *       no fallback to REVIEW_DB_NAME, DEV_DB_NAME, or PRD_DB_NAME
 *       url/user/pass are REVIEW_DB_URL || DB_URL, REVIEW_DB_USER || DB_USER,
 *         REVIEW_DB_PASS || DB_PASS, same || rules as getReviewDbConfig
 *       trailing slashes are stripped from the chosen URL; host is URL.host
 *     missing, blank, identical review names, a bad URL, or missing
 *     credentials are MaintenanceError CONFIG before buildDesignDoc,
 *     before confirmApply, and before any db method:
 *       DEV_REVIEW_DB_NAME is required for --design hf-app-review --env dev.
 *       PRD_REVIEW_DB_NAME is required for --design hf-app-review --env prd.
 *       DEV_REVIEW_DB_NAME and PRD_REVIEW_DB_NAME must name different databases.
 *       Database configuration is incomplete.
 *     prd --apply uses confirmApply and PRD_CONFIRM_PROMPT. The typed name
 *     is the review database, not PRD_DB_NAME. Dev --apply does not prompt.
 *     dry-run header names _design/hf-app-review and the review database
 *     an apply PUT for a views-only doc has _id, _rev when the live doc
 *     exists, language, and views. It has no lists key and no couchapp keys.
 */
import { expect } from 'chai';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const buildHref = '../scripts/design/build.mjs';
const diffHref = '../scripts/design/diff.mjs';
const couchHref = '../scripts/design/couch.mjs';
const deployHref = '../scripts/design/deploy-basic.mjs';
const runnerHref = '../scripts/maintenance/runner.mjs';

const FIXED_DATE = new Date('2026-11-14T18:22:00.123Z');
const REVIEW_BACKUP = 'deploy-design-hf-app-review-2026-11-14T182200.123Z.json';
const MAP_NEW = 'function(doc) {\n  emit([doc.app_status, doc.date_time], null);\n}\n';
const MAP_OLD = 'function(doc) {\n  emit(doc._id, null);\n}\n';
const MAP_CRLF = 'function(doc) {\r\n  emit([doc.app_status, doc.date_time], null);\r\n}\r\n';

const DEV_REQUIRED = 'DEV_REVIEW_DB_NAME is required for --design hf-app-review --env dev.';
const PRD_REQUIRED = 'PRD_REVIEW_DB_NAME is required for --design hf-app-review --env prd.';
const NAMES_DIFFER = 'DEV_REVIEW_DB_NAME and PRD_REVIEW_DB_NAME must name different databases.';
const CONFIG_INCOMPLETE = 'Database configuration is incomplete.';
const UNKNOWN_DESIGN = 'Unknown design not-a-design. Expected --design basic or --design hf-app-review.';
const DESIGN_EXPECTED = 'Unknown design. Expected --design basic or --design hf-app-review.';
const DUPLICATE_DESIGN = 'Duplicate --design flag.';
const APPLY_NEEDS_ENV = '--apply requires --env dev or --env prd.';

function couchappText(text) {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function reviewEnv(overrides = {}) {
    return {
        DB_URL: 'http://logistics.example:5984',
        DB_NAME: 'accidental-logistics',
        DEV_DB_NAME: 'logistics-dev',
        PRD_DB_NAME: 'logistics-prd',
        DB_USER: 'logistics-user',
        DB_PASS: 'logistics-secret',
        REVIEW_DB_URL: 'http://review.example:5984/',
        REVIEW_DB_NAME: 'legacy-apps',
        REVIEW_DB_USER: 'review-user',
        REVIEW_DB_PASS: 'review-secret',
        DEV_REVIEW_DB_NAME: 'apps-dev',
        PRD_REVIEW_DB_NAME: 'apps-prd',
        ...overrides
    };
}

function basicDoc() {
    return {
        _id: '_design/basic',
        language: 'javascript',
        views: { flights: { map: MAP_OLD } },
        lists: { 'flight-csv': 'function(head, req) {\n  send("ok\\n");\n}' }
    };
}

function reviewRepo() {
    return {
        _id: '_design/hf-app-review',
        language: 'javascript',
        views: { new_apps: { map: couchappText(MAP_NEW) } }
    };
}

function reviewLive() {
    return {
        _id: '_design/hf-app-review',
        _rev: '4-live',
        language: 'javascript',
        validate_doc_update: 'function(newDoc) {\n  if (!newDoc.type) throw({forbidden: "type"});\n}',
        evently: { profile: { html: '<p>review</p>' } },
        vendor: { couchapp: { version: '0.8' } },
        shows: { welcome: 'function() { return "hi"; }' },
        views: {
            admin_conflicts: {
                map: 'function(doc) {\n  if (doc._conflicts) emit(doc._id, doc._conflicts);\n}'
            },
            new_apps: { map: MAP_OLD },
            status_counts: {
                map: 'function(doc) {\n  emit(doc.app_status, 1);\n}',
                reduce: '_count'
            }
        },
        _attachments: {
            'index.html': { content_type: 'text/html', data: 'PGh0bWw+' },
            'vendor/couchapp/jquery.js': {
                content_type: 'application/javascript',
                data: 'anF1ZXJ5'
            }
        }
    };
}

function memoryFs(root, pathImpl, files) {
    const full = new Map();
    const dirs = new Set([pathImpl.normalize(root)]);
    for (const [rel, content] of Object.entries(files)) {
        const isDir = rel.endsWith('/');
        const parts = rel.split('/').filter((part) => part.length > 0);
        let current = root;
        const dirParts = isDir ? parts : parts.slice(0, -1);
        for (const part of dirParts) {
            current = pathImpl.join(current, part);
            dirs.add(pathImpl.normalize(current));
        }
        if (!isDir) {
            full.set(
                pathImpl.normalize(pathImpl.join(current, parts[parts.length - 1])),
                content
            );
        }
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

async function loadBuild() {
    return import(buildHref);
}

async function loadDeploy() {
    return import(deployHref);
}

function expectInvalid(buildDesignDoc, sourceDir, fs, pathImpl, design, needle) {
    try {
        buildDesignDoc(sourceDir, { fs, pathImpl, design });
    } catch (error) {
        expect(error.name).to.equal('MaintenanceError');
        expect(error.code).to.equal('INVALID_SOURCE');
        expect(error.message).to.include(needle);
        return;
    }
    expect.fail(`expected INVALID_SOURCE mentioning ${needle}`);
}

async function expectCode(promise, code) {
    try {
        await promise;
    } catch (error) {
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
        expect(error.name).to.equal('MaintenanceError');
        expect(error.code).to.equal(code);
        return error;
    }
    expect.fail(`expected MaintenanceError ${code}`);
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
            return putResult || { ok: true, id: doc._id, rev: '5-new' };
        }
    };
}

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
        json: async () => ({ ok: true, userCtx: { name: 'review-user' } })
    };
}

function headerValue(headers, name) {
    if (!headers) {
        return undefined;
    }
    if (typeof headers.get === 'function') {
        return headers.get(name);
    }
    const match = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
    return match ? headers[match] : undefined;
}

describe('hf-app-review design deploy', () => {
    describe('parseDesignDeployArgs', () => {
        it('keeps the basic result shape when --design is omitted', async () => {
            const { parseDesignDeployArgs } = await loadDeploy();
            expect(parseDesignDeployArgs([])).to.deep.equal({ apply: false, env: 'dev' });
            expect(parseDesignDeployArgs(['--env', 'prd'])).to.deep.equal({ apply: false, env: 'prd' });
            expect(parseDesignDeployArgs(['--apply', '--env', 'dev'])).to.not.have.property('design');
            expect(parseDesignDeployArgs(['--env=prd', '--apply'])).to.deep.equal({
                apply: true,
                env: 'prd'
            });
        });

        it('accepts --design basic and --design hf-app-review', async () => {
            const { parseDesignDeployArgs } = await loadDeploy();
            expect(parseDesignDeployArgs(['--design', 'basic'])).to.deep.equal({
                apply: false,
                env: 'dev',
                design: 'basic'
            });
            expect(parseDesignDeployArgs(['--design', 'hf-app-review'])).to.deep.equal({
                apply: false,
                env: 'dev',
                design: 'hf-app-review'
            });
            expect(parseDesignDeployArgs(['--design=basic', '--env', 'prd'])).to.deep.equal({
                apply: false,
                env: 'prd',
                design: 'basic'
            });
            expect(parseDesignDeployArgs([
                '--apply',
                '--env',
                'dev',
                '--design',
                'hf-app-review'
            ])).to.deep.equal({
                apply: true,
                env: 'dev',
                design: 'hf-app-review'
            });
            expect(parseDesignDeployArgs([
                '--design=hf-app-review',
                '--env=prd',
                '--apply'
            ])).to.deep.equal({
                apply: true,
                env: 'prd',
                design: 'hf-app-review'
            });
            expect(parseDesignDeployArgs(['--env', 'dev', '--design', 'basic']).design).to.equal('basic');
        });

        it('rejects an unknown, missing, empty, or duplicate --design as USAGE', async () => {
            const { parseDesignDeployArgs } = await loadDeploy();
            const unknown = expectSyncCode(
                () => parseDesignDeployArgs(['--design', 'not-a-design']),
                'USAGE'
            );
            expect(unknown.message).to.equal(UNKNOWN_DESIGN);
            const missing = expectSyncCode(() => parseDesignDeployArgs(['--design']), 'USAGE');
            expect(missing.message).to.equal(DESIGN_EXPECTED);
            const empty = expectSyncCode(() => parseDesignDeployArgs(['--design=']), 'USAGE');
            expect(empty.message).to.equal(DESIGN_EXPECTED);
            const duplicate = expectSyncCode(
                () => parseDesignDeployArgs(['--design', 'basic', '--design', 'hf-app-review']),
                'USAGE'
            );
            expect(duplicate.message).to.equal(DUPLICATE_DESIGN);
            const apply = expectSyncCode(
                () => parseDesignDeployArgs(['--design', 'hf-app-review', '--apply']),
                'USAGE'
            );
            expect(apply.message).to.equal(APPLY_NEEDS_ENV);
        });
    });

    describe('buildDesignDoc', () => {
        const posixRoot = '/home/steve/Repos/sshf-api/couchdb/design/hf-app-review';
        const winRoot = 'C:\\Users\\steve\\Repos\\sshf-api\\couchdb\\design\\hf-app-review';

        it('still requires lists for basic and still rejects couchapp leftovers', async () => {
            const { buildDesignDoc, DESIGN_DOC_ID } = await loadBuild();
            expect(DESIGN_DOC_ID).to.equal('_design/basic');
            const withLists = {
                'views/flights/map.js': MAP_OLD,
                'lists/flight-csv.js': 'function(head, req) {\n  send("ok\\n");\n}\n'
            };
            const fs = memoryFs(posixRoot, path.posix, withLists);
            const doc = buildDesignDoc(posixRoot, { fs, pathImpl: path.posix, design: 'basic' });
            expect(doc._id).to.equal('_design/basic');
            expect(doc.lists['flight-csv']).to.equal(couchappText('function(head, req) {\n  send("ok\\n");\n}\n'));

            expectInvalid(
                buildDesignDoc,
                posixRoot,
                memoryFs(posixRoot, path.posix, { 'views/flights/map.js': MAP_OLD }),
                path.posix,
                'basic',
                'lists'
            );
            expectInvalid(
                buildDesignDoc,
                posixRoot,
                memoryFs(posixRoot, path.posix, {
                    'views/new_apps/map.js': MAP_NEW,
                    'lists/': ''
                }),
                path.posix,
                'hf-app-review',
                'lists'
            );
            expectInvalid(
                buildDesignDoc,
                posixRoot,
                memoryFs(posixRoot, path.posix, {
                    'views/new_apps/map.js': MAP_NEW,
                    'evently/profile/mustache': 'x'
                }),
                path.posix,
                'hf-app-review',
                'evently'
            );
            expectInvalid(
                buildDesignDoc,
                posixRoot,
                memoryFs(posixRoot, path.posix, {
                    'views/new_apps/map.js': MAP_NEW,
                    'validate_doc_update.js': 'function() {}\n'
                }),
                path.posix,
                'hf-app-review',
                'validate_doc_update.js'
            );
        });

        it('builds a views-only _design/hf-app-review document with no lists key', async () => {
            const { buildDesignDoc } = await loadBuild();
            const files = { 'views/new_apps/map.js': `  ${MAP_CRLF}\n` };
            const linux = buildDesignDoc(posixRoot, {
                fs: memoryFs(posixRoot, path.posix, files),
                pathImpl: path.posix,
                design: 'hf-app-review'
            });
            const windows = buildDesignDoc(winRoot, {
                fs: memoryFs(winRoot, path.win32, files),
                pathImpl: path.win32,
                design: 'hf-app-review'
            });
            const expected = {
                _id: '_design/hf-app-review',
                language: 'javascript',
                views: { new_apps: { map: couchappText(MAP_NEW) } }
            };
            expect(linux).to.deep.equal(expected);
            expect(windows).to.deep.equal(linux);
            expect(linux).to.not.have.property('lists');
            expect(linux).to.not.have.property('_rev');
            expect(linux).to.not.have.property('_attachments');
            expect(linux).to.not.have.property('evently');
            expect(linux).to.not.have.property('validate_doc_update');
            expect(linux).to.not.have.property('vendor');
            expect(Object.keys(linux.views.new_apps)).to.deep.equal(['map']);
        });
    });

    describe('diffDesignDocs', () => {
        it('diffs a design with no lists and names every removed view and couchapp key', async () => {
            const { diffDesignDocs } = await import(diffHref);
            const diff = diffDesignDocs(reviewRepo(), reviewLive());
            expect(diff.viewsAdded).to.deep.equal([]);
            expect(diff.viewsChanged).to.deep.equal(['new_apps']);
            expect(diff.viewsKept).to.deep.equal([]);
            expect(diff.viewsRemoved).to.deep.equal(['admin_conflicts', 'status_counts']);
            expect(diff.listsAdded).to.deep.equal([]);
            expect(diff.listsChanged).to.deep.equal([]);
            expect(diff.listsKept).to.deep.equal([]);
            expect(diff.listsRemoved).to.deep.equal([]);
            expect(diff.keysRemoved).to.deep.equal([
                '_attachments',
                'evently',
                'shows',
                'validate_doc_update',
                'vendor'
            ]);
            expect(diff.attachmentsRemoved).to.deep.equal([
                'index.html',
                'vendor/couchapp/jquery.js'
            ]);
            expect(diff.languageChanged).to.equal(false);
            expect(diff.equivalent).to.equal(false);
            expect(diff.keysRemoved).to.not.include('status_counts');
            expect(diff.keysRemoved).to.not.include('admin_conflicts');
            expect(diff.viewsRemoved).to.not.include('validate_doc_update');
            expect(diff.viewsRemoved).to.not.include('evently');
            expect(diff.viewsRemoved).to.not.include('_attachments');
            expect(diff.viewsRemoved).to.not.include('vendor');
        });

        it('treats a views-only repo doc as equivalent when the live doc has the same view and no lists', async () => {
            const { diffDesignDocs } = await import(diffHref);
            const repo = reviewRepo();
            const live = {
                _id: '_design/hf-app-review',
                _rev: '9-same',
                language: 'javascript',
                views: {
                    new_apps: { map: repo.views.new_apps.map.replace(/\n/g, '\r\n') }
                }
            };
            expect(diffDesignDocs(repo, live)).to.deep.equal({
                equivalent: true,
                languageChanged: false,
                viewsAdded: [],
                viewsChanged: [],
                viewsKept: ['new_apps'],
                viewsRemoved: [],
                listsAdded: [],
                listsChanged: [],
                listsKept: [],
                listsRemoved: [],
                keysRemoved: [],
                attachmentsRemoved: []
            });
        });
    });

    describe('createDesignDeployDb', () => {
        it('reads and writes the design id it is given', async () => {
            const { createDesignDeployDb } = await import(couchHref);
            const calls = [];
            const live = reviewLive();
            const db = createDesignDeployDb({
                url: 'http://review.example:5984/',
                name: 'apps dev',
                user: 'review-user',
                pass: 'review-secret',
                fetchImpl: async (url, options = {}) => {
                    calls.push([String(url), options]);
                    if (String(url).includes('/_session')) {
                        return sessionResponse();
                    }
                    if ((options.method || 'GET') === 'PUT') {
                        return {
                            ok: true,
                            status: 201,
                            json: async () => ({ ok: true, id: '_design/hf-app-review', rev: '5-new' })
                        };
                    }
                    return { ok: true, status: 200, json: async () => live };
                }
            });

            const doc = await db.getDesignDoc('_design/hf-app-review');
            expect(doc._id).to.equal('_design/hf-app-review');
            const payload = reviewRepo();
            payload._rev = '4-live';
            const saved = await db.putDesignDoc(payload);
            expect(saved).to.deep.equal({ ok: true, id: '_design/hf-app-review', rev: '5-new' });

            const designCalls = calls.filter((call) => !call[0].includes('/_session'));
            expect(designCalls).to.have.length(2);
            const getUrl = new URL(designCalls[0][0]);
            expect(getUrl.pathname).to.equal('/apps%20dev/_design/hf-app-review');
            expect(decodeURIComponent(getUrl.pathname)).to.equal('/apps dev/_design/hf-app-review');
            expect(getUrl.searchParams.get('attachments')).to.equal('true');
            expect(designCalls[0][1].method || 'GET').to.equal('GET');
            expect(getUrl.pathname).to.not.include('_design/basic');

            const putUrl = new URL(designCalls[1][0]);
            expect(designCalls[1][1].method).to.equal('PUT');
            expect(putUrl.pathname).to.equal('/apps%20dev/_design/hf-app-review');
            expect(putUrl.search).to.equal('');
            expect(JSON.parse(designCalls[1][1].body)).to.deep.equal(payload);
            expect(headerValue(designCalls[1][1].headers, 'Cookie')).to.equal('AuthSession=abc123');
            expect(String(designCalls[1][0])).to.not.include('review-secret');
        });
    });

    describe('runDesignDeploy', () => {
        it('keeps a bare command on the logistics database when review env vars are set', async () => {
            const { runDesignDeploy, DEPLOY_SCRIPT_NAME } = await loadDeploy();
            expect(DEPLOY_SCRIPT_NAME).to.equal('deploy-design-basic');
            const created = [];
            const db = recordingDb(null);
            const result = await runDesignDeploy([], {
                env: reviewEnv(),
                log: () => {},
                now: () => FIXED_DATE,
                buildDesignDoc: () => basicDoc(),
                createDb(target) {
                    created.push(target);
                    return db;
                }
            });
            expect(created).to.have.length(1);
            expect(created[0]).to.include({
                envName: 'dev',
                host: 'logistics.example:5984',
                database: 'logistics-dev',
                url: 'http://logistics.example:5984',
                user: 'logistics-user',
                pass: 'logistics-secret'
            });
            expect(created[0].database).to.not.equal('apps-dev');
            expect(created[0].database).to.not.equal('legacy-apps');
            expect(db.events).to.deep.equal([['get', '_design/basic']]);
            expect(result).to.include({
                design: '_design/basic',
                database: 'logistics-dev',
                env: 'dev',
                dryRun: true
            });
        });

        it('treats explicit --design basic like the logistics basic deploy', async () => {
            const { runDesignDeploy } = await loadDeploy();
            let seen;
            const created = [];
            const result = await runDesignDeploy(['--design', 'basic', '--env', 'prd'], {
                env: reviewEnv(),
                log: () => {},
                buildDesignDoc: (dir) => {
                    seen = dir;
                    return basicDoc();
                },
                createDb(target) {
                    created.push(target);
                    return recordingDb(null);
                }
            });
            expect(path.resolve(seen)).to.equal(path.resolve(repoRoot, 'couchdb', 'design', 'basic'));
            expect(created[0]).to.include({
                envName: 'prd',
                database: 'logistics-prd',
                url: 'http://logistics.example:5984',
                user: 'logistics-user',
                pass: 'logistics-secret'
            });
            expect(created[0].database).to.not.equal('apps-prd');
            expect(result).to.include({
                design: '_design/basic',
                database: 'logistics-prd',
                env: 'prd',
                dryRun: true
            });
            expect(result.design).to.not.equal('_design/hf-app-review');
        });

        it('targets only the review database and review credentials for hf-app-review', async () => {
            const { runDesignDeploy } = await loadDeploy();
            const seen = [];
            for (const [envName, database] of [['dev', 'apps-dev'], ['prd', 'apps-prd']]) {
                const db = recordingDb(reviewLive());
                const result = await runDesignDeploy(
                    ['--design', 'hf-app-review', '--env', envName],
                    {
                        env: reviewEnv({
                            DEV_REVIEW_DB_NAME: ' apps-dev ',
                            PRD_REVIEW_DB_NAME: ' apps-prd '
                        }),
                        log: () => {},
                        buildDesignDoc: () => reviewRepo(),
                        createDb(target) {
                            seen.push(target);
                            return db;
                        }
                    }
                );
                expect(result.database, envName).to.equal(database);
                expect(result.design, envName).to.equal('_design/hf-app-review');
                expect(db.events[0], envName).to.deep.equal(['get', '_design/hf-app-review']);
                expect(db.puts, envName).to.deep.equal([]);
            }
            expect(seen.map((target) => target.database)).to.deep.equal(['apps-dev', 'apps-prd']);
            expect(seen[0]).to.include({
                envName: 'dev',
                host: 'review.example:5984',
                database: 'apps-dev',
                url: 'http://review.example:5984',
                user: 'review-user',
                pass: 'review-secret'
            });
            expect(seen[1]).to.include({
                envName: 'prd',
                host: 'review.example:5984',
                database: 'apps-prd',
                user: 'review-user',
                pass: 'review-secret'
            });
            expect(seen[0].url).to.not.equal('http://logistics.example:5984');
            expect(seen[0].database).to.not.equal('legacy-apps');
            expect(seen[0].database).to.not.equal('logistics-dev');

            const fallback = [];
            await runDesignDeploy(['--design=hf-app-review', '--env', 'dev'], {
                env: reviewEnv({
                    REVIEW_DB_URL: undefined,
                    REVIEW_DB_USER: '',
                    REVIEW_DB_PASS: undefined
                }),
                log: () => {},
                buildDesignDoc: () => reviewRepo(),
                createDb(target) {
                    fallback.push(target);
                    return recordingDb(null);
                }
            });
            expect(fallback[0]).to.include({
                database: 'apps-dev',
                url: 'http://logistics.example:5984',
                host: 'logistics.example:5984',
                user: 'logistics-user',
                pass: 'logistics-secret'
            });

            const mixed = [];
            await runDesignDeploy(['--design', 'hf-app-review', '--env', 'prd'], {
                env: reviewEnv({
                    REVIEW_DB_USER: undefined,
                    REVIEW_DB_PASS: 'review-only-secret'
                }),
                log: () => {},
                buildDesignDoc: () => reviewRepo(),
                createDb(target) {
                    mixed.push(target);
                    return recordingDb(null);
                }
            });
            expect(mixed[0]).to.include({
                database: 'apps-prd',
                url: 'http://review.example:5984',
                user: 'logistics-user',
                pass: 'review-only-secret'
            });
            expect(mixed[0].pass).to.not.equal('logistics-secret');
        });

        it('refuses a missing, blank, identical, or incomplete review target before any work', async () => {
            const { runDesignDeploy } = await loadDeploy();
            const cases = [
                {
                    argv: ['--design', 'hf-app-review', '--env', 'dev'],
                    env: reviewEnv({ DEV_REVIEW_DB_NAME: undefined }),
                    message: DEV_REQUIRED
                },
                {
                    argv: ['--apply', '--design', 'hf-app-review', '--env', 'prd'],
                    env: reviewEnv({ PRD_REVIEW_DB_NAME: '   ' }),
                    message: PRD_REQUIRED
                },
                {
                    argv: ['--design', 'hf-app-review', '--env', 'dev'],
                    env: reviewEnv({
                        DEV_REVIEW_DB_NAME: 'apps-prd',
                        PRD_REVIEW_DB_NAME: ' apps-prd '
                    }),
                    message: NAMES_DIFFER
                },
                {
                    argv: ['--design', 'hf-app-review', '--env', 'dev'],
                    env: reviewEnv({ REVIEW_DB_URL: 'not a url' }),
                    message: CONFIG_INCOMPLETE
                },
                {
                    argv: ['--design', 'hf-app-review', '--env', 'prd'],
                    env: reviewEnv({
                        REVIEW_DB_USER: undefined,
                        DB_USER: undefined
                    }),
                    message: CONFIG_INCOMPLETE
                }
            ];
            for (const item of cases) {
                let built = false;
                let prompted = false;
                let called = false;
                const error = await expectCode(runDesignDeploy(item.argv, {
                    env: item.env,
                    log: () => {},
                    buildDesignDoc: () => {
                        built = true;
                        return reviewRepo();
                    },
                    prompt: async () => {
                        prompted = true;
                        return 'apps-prd';
                    },
                    db: {
                        async getDesignDoc() {
                            called = true;
                            return null;
                        },
                        async putDesignDoc() {
                            called = true;
                            return { ok: true, id: '_design/hf-app-review', rev: '1-a' };
                        }
                    },
                    createDb() {
                        called = true;
                        return recordingDb(null);
                    }
                }), 'CONFIG');
                expect(built, item.message).to.equal(false);
                expect(prompted, item.message).to.equal(false);
                expect(called, item.message).to.equal(false);
                expect(error.message, item.message).to.equal(item.message);
                expect(error.message).to.not.include('legacy-apps');
                expect(error.message).to.not.include('logistics-secret');
                expect(error.message).to.not.include('review-secret');
            }
        });

        it('prints the review design and review database in the dry-run header', async () => {
            const { runDesignDeploy } = await loadDeploy();
            const cases = [
                {
                    argv: ['--design', 'hf-app-review'],
                    database: 'apps-dev',
                    envName: 'dev',
                    defaulted: true
                },
                {
                    argv: ['--design', 'hf-app-review', '--env', 'dev'],
                    database: 'apps-dev',
                    envName: 'dev',
                    defaulted: false
                },
                {
                    argv: ['--design=hf-app-review', '--env', 'prd'],
                    database: 'apps-prd',
                    envName: 'prd',
                    defaulted: false
                }
            ];
            for (const spec of cases) {
                const logs = [];
                const db = recordingDb(reviewLive());
                let prompted = false;
                await runDesignDeploy(spec.argv, {
                    env: reviewEnv(),
                    log: (line) => logs.push(String(line)),
                    buildDesignDoc: () => reviewRepo(),
                    prompt: async () => {
                        prompted = true;
                        return spec.database;
                    },
                    db
                });
                expect(prompted, spec.argv.join(' ')).to.equal(false);
                expect(db.puts, spec.argv.join(' ')).to.deep.equal([]);
                expect(db.events[0][1], spec.argv.join(' ')).to.equal('_design/hf-app-review');
                const text = logs.join('\n');
                expect(text, spec.argv.join(' ')).to.match(/^\s*DRY RUN\b/);
                expect(text).to.not.include('\r');
                expect(text).to.not.include('review-secret');
                const targetAt = text.indexOf('Target host=');
                expect(targetAt).to.be.greaterThan(0);
                const header = text.slice(0, targetAt);
                expect(header).to.include('DRY RUN');
                expect(header).to.include('nothing will be written');
                expect(header).to.include('_design/hf-app-review');
                expect(header).to.include(spec.database);
                expect(header).to.include(spec.envName);
                expect(header).to.not.include('_design/basic');
                expect(header).to.not.include('logistics-dev');
                expect(header).to.not.include('logistics-prd');
                expect(header).to.not.include('legacy-apps');
                if (spec.database === 'apps-prd') {
                    expect(header).to.not.include('apps-dev');
                } else {
                    expect(header).to.not.include('apps-prd');
                }
                if (spec.defaulted) {
                    expect(header).to.include('defaulted to dev');
                } else {
                    expect(header).to.not.include('defaulted to dev');
                }
                expect(text).to.include(
                    `Target host=review.example:5984 database=${spec.database} env=${spec.envName}`
                );
                const contentLines = text.split('\n').filter((line) => line.trim() !== '');
                const hint = contentLines[contentLines.length - 1];
                expect(hint).to.match(/re-?run/i);
                expect(hint).to.include(`--apply --env ${spec.envName}`);
            }
        });

        it('uses the same production confirmation prompt for the review database', async () => {
            const { runDesignDeploy } = await loadDeploy();
            const { PRD_CONFIRM_PROMPT } = await import(runnerHref);
            const wrong = recordingDb(reviewLive());
            const wrongError = await expectCode(runDesignDeploy(
                ['--apply', '--design', 'hf-app-review', '--env', 'prd'],
                {
                    env: reviewEnv(),
                    log: () => {},
                    buildDesignDoc: () => reviewRepo(),
                    prompt: async (question) => {
                        expect(question).to.equal(PRD_CONFIRM_PROMPT);
                        expect(question).to.equal('Type the database name to confirm apply to production: ');
                        expect(question).to.not.include('apps-prd');
                        expect(question).to.not.include('review-secret');
                        return 'logistics-prd';
                    },
                    db: wrong
                }
            ), 'CONFIRMATION_REQUIRED');
            expect(wrongError.message).to.equal('Confirmation did not match the database name.');
            expect(wrong.events).to.deep.equal([]);
            expect(wrong.puts).to.deep.equal([]);

            const db = recordingDb(reviewLive());
            const questions = [];
            const result = await runDesignDeploy(
                ['--design=hf-app-review', '--apply', '--env', 'prd'],
                {
                    env: reviewEnv(),
                    log: () => {},
                    buildDesignDoc: () => reviewRepo(),
                    prompt: async (question) => {
                        questions.push(question);
                        return 'apps-prd\r\n';
                    },
                    writeBackup: async () => 'backup.json',
                    db
                }
            );
            expect(questions).to.deep.equal([PRD_CONFIRM_PROMPT]);
            expect(db.events.map((event) => event[0])).to.deep.equal(['get', 'put']);
            expect(db.events[0][1]).to.equal('_design/hf-app-review');
            expect(result.changed).to.equal(1);
            expect(result.database).to.equal('apps-prd');
            expect(result.design).to.equal('_design/hf-app-review');
            expect(result.dryRun).to.equal(false);

            let prompted = false;
            const devDb = recordingDb(reviewLive());
            const dev = await runDesignDeploy(
                ['--apply', '--env', 'dev', '--design', 'hf-app-review'],
                {
                    env: reviewEnv(),
                    log: () => {},
                    buildDesignDoc: () => reviewRepo(),
                    prompt: async () => {
                        prompted = true;
                        return 'apps-dev';
                    },
                    writeBackup: async () => 'backup.json',
                    db: devDb
                }
            );
            expect(prompted).to.equal(false);
            expect(dev.changed).to.equal(1);
            expect(dev.database).to.equal('apps-dev');
        });

        it('lists status_counts, admin_conflicts, validate_doc_update, evently, _attachments, and vendor on a dry run', async () => {
            const { runDesignDeploy, formatDesignDeployReport } = await loadDeploy();
            const logs = [];
            const db = recordingDb(reviewLive());
            const result = await runDesignDeploy(['--design', 'hf-app-review'], {
                env: reviewEnv(),
                log: (line) => logs.push(String(line)),
                buildDesignDoc: () => reviewRepo(),
                writeBackup: async () => {
                    throw new Error('dry run must not back up');
                },
                db
            });
            expect(db.puts).to.deep.equal([]);
            expect(result.dryRun).to.equal(true);
            expect(result.design).to.equal('_design/hf-app-review');
            expect(result.database).to.equal('apps-dev');
            expect(result.viewsRemoved).to.deep.equal(['admin_conflicts', 'status_counts']);
            expect(result.keysRemoved).to.include.members([
                '_attachments',
                'evently',
                'validate_doc_update',
                'vendor'
            ]);
            expect(result.attachmentsRemoved).to.include.members([
                'index.html',
                'vendor/couchapp/jquery.js'
            ]);
            expect(result.changed).to.equal(0);
            expect(result.backupPath).to.equal(null);
            const text = logs.join('\n');
            expect(text).to.include(formatDesignDeployReport(result));
            for (const name of [
                'status_counts',
                'admin_conflicts',
                'validate_doc_update',
                'evently',
                '_attachments',
                'vendor'
            ]) {
                expect(text, name).to.include(name);
            }
            const contentLines = text.split('\n').filter((line) => line.trim() !== '');
            const summary = contentLines[contentLines.length - 2];
            expect(summary).to.match(/views\D+0\D+1\D+2/i);
            expect(summary).to.match(/lists\D+0\D+0\D+0/i);
            expect(summary).to.match(/top-level keys\D+5/i);
            expect(summary).to.match(/attachments\D+2/i);
        });

        it('backs up the full live review doc and replaces it without the couchapp keys', async () => {
            const { runDesignDeploy } = await loadDeploy();
            const live = reviewLive();
            const repo = reviewRepo();
            const winRoot = 'C:\\Users\\steve\\Repos\\sshf-api';
            const order = [];
            let written;
            const db = recordingDb(live);
            const originalPut = db.putDesignDoc.bind(db);
            db.putDesignDoc = async (doc) => {
                order.push('put');
                return originalPut(doc);
            };
            const result = await runDesignDeploy(
                ['--apply', '--env', 'dev', '--design', 'hf-app-review'],
                {
                    env: reviewEnv(),
                    log: () => {},
                    now: () => FIXED_DATE,
                    rootDir: winRoot,
                    pathImpl: path.win32,
                    buildDesignDoc: () => repo,
                    db,
                    fs: {
                        mkdir: async () => {},
                        writeFile: async (file, data) => {
                            order.push('backup');
                            written = [file, data];
                        }
                    }
                }
            );
            expect(order).to.deep.equal(['backup', 'put']);
            expect(path.win32.basename(written[0])).to.equal(REVIEW_BACKUP);
            expect(written[0]).to.equal(path.win32.join(winRoot, 'maintenance-backups', REVIEW_BACKUP));
            expect(written[1]).to.not.include('\r');
            expect(written[1]).to.not.include('review-secret');
            const payload = JSON.parse(written[1]);
            expect(payload).to.deep.include({
                script: 'deploy-design-hf-app-review',
                createdAt: '2026-11-14T18:22:00.123Z',
                env: 'dev',
                host: 'review.example:5984',
                database: 'apps-dev'
            });
            expect(payload.documents).to.deep.equal([live]);
            expect(payload.documents[0].views.status_counts.reduce).to.equal('_count');
            expect(payload.documents[0].views.admin_conflicts.map).to.include('_conflicts');
            expect(payload.documents[0].validate_doc_update).to.include('forbidden');
            expect(payload.documents[0].evently).to.deep.equal(live.evently);
            expect(payload.documents[0].vendor).to.deep.equal(live.vendor);
            expect(payload.documents[0]._attachments['index.html'].data).to.equal('PGh0bWw+');
            expect(payload.script).to.not.equal('deploy-design-basic');

            expect(db.puts).to.have.length(1);
            const put = db.puts[0];
            expect(Object.keys(put).sort()).to.deep.equal(['_id', '_rev', 'language', 'views']);
            expect(put).to.deep.equal({
                _id: '_design/hf-app-review',
                _rev: '4-live',
                language: 'javascript',
                views: repo.views
            });
            expect(put).to.not.have.property('lists');
            expect(put.views).to.not.have.property('status_counts');
            expect(put.views).to.not.have.property('admin_conflicts');
            expect(put).to.not.have.property('validate_doc_update');
            expect(put).to.not.have.property('evently');
            expect(put).to.not.have.property('_attachments');
            expect(put).to.not.have.property('vendor');
            expect(put).to.not.have.property('shows');
            expect(live.evently).to.deep.equal({ profile: { html: '<p>review</p>' } });
            expect(live._attachments['vendor/couchapp/jquery.js'].data).to.equal('anF1ZXJ5');
            expect(result.changed).to.equal(1);
            expect(result.backupPath).to.equal(written[0]);
            expect(result.design).to.equal('_design/hf-app-review');
        });

        it('reads couchdb/design/hf-app-review and builds a folder that has no lists', async () => {
            const { runDesignDeploy } = await loadDeploy();
            let seen;
            await runDesignDeploy(['--design', 'hf-app-review', '--env', 'dev'], {
                env: reviewEnv(),
                log: () => {},
                buildDesignDoc: (dir) => {
                    seen = dir;
                    return reviewRepo();
                },
                db: recordingDb(null)
            });
            expect(path.resolve(seen)).to.equal(
                path.resolve(repoRoot, 'couchdb', 'design', 'hf-app-review')
            );

            const sourceDir = '/home/steve/Repos/sshf-api/couchdb/design/hf-app-review';
            const sourceFs = memoryFs(sourceDir, path.posix, {
                'views/new_apps/map.js': MAP_CRLF
            });
            const db = recordingDb(null);
            const created = await runDesignDeploy(['--apply', '--design', 'hf-app-review', '--env', 'dev'], {
                env: reviewEnv(),
                log: () => {},
                sourceDir,
                sourceFs,
                pathImpl: path.posix,
                db
            });
            expect(db.events).to.deep.equal([
                ['get', '_design/hf-app-review'],
                ['put', '_design/hf-app-review']
            ]);
            expect(db.puts[0]).to.deep.equal({
                _id: '_design/hf-app-review',
                language: 'javascript',
                views: { new_apps: { map: couchappText(MAP_NEW) } }
            });
            expect(db.puts[0]).to.not.have.property('lists');
            expect(db.puts[0]).to.not.have.property('_rev');
            expect(created.backupPath).to.equal(null);
            expect(created.changed).to.equal(1);
            expect(created.viewsAdded).to.deep.equal(['new_apps']);
        });

        it('does not write when the views-only repo doc already matches the live doc', async () => {
            const { runDesignDeploy } = await loadDeploy();
            const sourceDir = '/home/steve/Repos/sshf-api/couchdb/design/hf-app-review';
            const sourceFs = memoryFs(sourceDir, path.posix, {
                'views/new_apps/map.js': MAP_CRLF
            });
            const live = {
                _id: '_design/hf-app-review',
                _rev: '3-same',
                language: 'javascript',
                views: { new_apps: { map: couchappText(MAP_NEW) } }
            };
            const db = recordingDb(live);
            let backedUp = false;
            const result = await runDesignDeploy(
                ['--apply', '--env', 'dev', '--design', 'hf-app-review'],
                {
                    env: reviewEnv(),
                    log: () => {},
                    sourceDir,
                    sourceFs,
                    pathImpl: path.posix,
                    writeBackup: async () => {
                        backedUp = true;
                        return 'backup.json';
                    },
                    db
                }
            );
            expect(db.events).to.deep.equal([['get', '_design/hf-app-review']]);
            expect(db.puts).to.deep.equal([]);
            expect(backedUp).to.equal(false);
            expect(result.equivalent).to.equal(true);
            expect(result.changed).to.equal(0);
            expect(result.backupPath).to.equal(null);
            expect(result.viewsKept).to.deep.equal(['new_apps']);
            expect(result.listsKept).to.deep.equal([]);
            expect(result.keysRemoved).to.deep.equal([]);
        });

        it('reports a 409 for _design/hf-app-review after the backup', async () => {
            const { runDesignDeploy, formatDesignDeployReport } = await loadDeploy();
            const logs = [];
            const db = recordingDb(reviewLive(), () => ({
                ok: false,
                id: '_design/hf-app-review',
                error: 'conflict',
                status: 409,
                reason: 'secret-conflict-reason'
            }));
            let backedUp = false;
            const result = await runDesignDeploy(
                ['--apply', '--env', 'dev', '--design', 'hf-app-review'],
                {
                    env: reviewEnv(),
                    log: (line) => logs.push(String(line)),
                    buildDesignDoc: () => reviewRepo(),
                    writeBackup: async () => {
                        backedUp = true;
                        return 'backup.json';
                    },
                    db
                }
            );
            expect(backedUp).to.equal(true);
            expect(db.events).to.deep.equal([
                ['get', '_design/hf-app-review'],
                ['put', '_design/hf-app-review']
            ]);
            expect(result.changed).to.equal(0);
            expect(result.conflicts).to.equal(1);
            expect(result.conflictIds).to.deep.equal(['_design/hf-app-review']);
            expect(logs.at(-1)).to.equal(formatDesignDeployReport(result));
            expect(logs.join('\n')).to.not.include('secret-conflict-reason');
        });
    });

    describe('docs', () => {
        it('documents --design hf-app-review and the review database names', () => {
            const readme = readFileSync(join(repoRoot, 'scripts', 'design', 'README.md'), 'utf8');
            expect(readme).to.match(/--design/);
            expect(readme).to.match(/hf-app-review/);
            expect(readme).to.match(/couchdb\/design\/hf-app-review/);
            expect(readme).to.match(/DEV_REVIEW_DB_NAME/);
            expect(readme).to.match(/PRD_REVIEW_DB_NAME/);
            expect(readme).to.match(/no fallback to REVIEW_DB_NAME|never reads REVIEW_DB_NAME|does not (?:read|use|fall back to) REVIEW_DB_NAME/i);
            expect(readme).to.match(/REVIEW_DB_URL[^.\n]{0,160}DB_URL/);
            expect(readme).to.match(/REVIEW_DB_USER[^.\n]{0,160}DB_USER/);
            expect(readme).to.match(/REVIEW_DB_PASS[^.\n]{0,160}DB_PASS/);
            expect(readme).to.match(/new_apps/);

            const rootReadme = readFileSync(join(repoRoot, 'README.md'), 'utf8');
            expect(rootReadme).to.match(/--design/);
            expect(rootReadme).to.match(/couchdb\/design\/hf-app-review/);
            expect(rootReadme).to.match(/DEV_REVIEW_DB_NAME/);
            expect(rootReadme).to.match(/PRD_REVIEW_DB_NAME/);

            const example = readFileSync(join(repoRoot, 'env.example'), 'utf8');
            expect(example).to.match(/deploy-design/);
            const devAt = example.search(/DEV_REVIEW_DB_NAME/);
            const prdAt = example.search(/PRD_REVIEW_DB_NAME/);
            expect(devAt, 'DEV_REVIEW_DB_NAME').to.be.at.least(0);
            expect(prdAt, 'PRD_REVIEW_DB_NAME').to.be.at.least(0);
            const start = Math.max(0, Math.min(devAt, prdAt) - 200);
            const window = example.slice(start, Math.max(devAt, prdAt) + 200);
            expect(window).to.match(/differ/i);
            expect(example).to.match(/no fallback to REVIEW_DB_NAME|does not (?:read|use|fall back to) REVIEW_DB_NAME/i);
        });
    });
});
