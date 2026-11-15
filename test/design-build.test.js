/**
 * Behavioral contract for building the _design/basic document from a folder
 * (issue #165). No production builder exists yet.
 *
 * Implemented later, imported here:
 *   scripts/design/build.mjs
 *     DESIGN_DOC_ID  === '_design/basic'
 *     buildDesignDoc(sourceDir, { fs, pathImpl } = {})
 *       synchronous
 *       fs.readdirSync(dir) => string[] of base names
 *       fs.statSync(path) => { isDirectory(), isFile() }
 *       fs.readFileSync(path, 'utf8') => string
 *       pathImpl is node:path, path.win32, or path.posix
 *       throws MaintenanceError { code: 'INVALID_SOURCE' }
 *
 * Folder layout (only these entries; anything else is INVALID_SOURCE):
 *   <sourceDir>/views/<viewName>/map.js          required, non-empty
 *   <sourceDir>/views/<viewName>/reduce.js       optional, non-empty when present
 *   <sourceDir>/lists/<listName>.js              required, at least one, non-empty
 *
 * The returned document is exactly:
 *   { _id: '_design/basic', language: 'javascript', views, lists }
 * View and list sources are normalized (CR LF and lone CR to LF), then trimmed
 * the way couchapp 0.7.5 push does (str.strip). Interior whitespace is kept.
 * A map-only view has no reduce property.
 */
import { expect } from 'chai';
import path from 'node:path';

const buildHref = '../scripts/design/build.mjs';

const MAP_LF = 'function(doc) {\n  if (doc.type === "Flight") emit(doc._id, null);\n}\n';
const MAP_CRLF = 'function(doc) {\r\n  if (doc.type === "Flight") emit(doc._id, null);\r\n}\r\n';
const MAP_CR = 'function(doc) {\r  emit(doc._id, 1);\r}\r';
const MAP_NORMALIZED_CR = 'function(doc) {\n  emit(doc._id, 1);\n}\n';
const REDUCE_CRLF = '_count\r\n';
const REDUCE_LF = '_count\n';
const LIST_LF = 'function(head, req) {\n  send("a,b\\n");\n}\n';
const LIST_CRLF = 'function(head, req) {\r\n  send("a,b\\n");\r\n}\r\n';
const QUOTED_MAP = 'function(doc) {\n  emit(doc.name.last.replace(/[\'\\. ]/g, ""), null);\n}\n';

function couchappSource(text) {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

function memoryFs(root, pathImpl, files) {
    const full = new Map();
    const dirs = new Set([pathImpl.normalize(root)]);
    const encodings = [];

    for (const [rel, content] of Object.entries(files)) {
        const parts = rel.split('/');
        let current = root;
        for (let index = 0; index < parts.length - 1; index += 1) {
            current = pathImpl.join(current, parts[index]);
            dirs.add(pathImpl.normalize(current));
        }
        const filePath = pathImpl.normalize(pathImpl.join(current, parts[parts.length - 1]));
        full.set(filePath, content);
    }

    function missing(target) {
        const error = new Error(`ENOENT: ${target}`);
        error.code = 'ENOENT';
        return error;
    }

    return {
        encodings,
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
            encodings.push(encoding);
            const normalized = pathImpl.normalize(target);
            if (!full.has(normalized)) {
                throw missing(target);
            }
            return full.get(normalized);
        }
    };
}

async function loadBuild() {
    try {
        return await import(buildHref);
    } catch (error) {
        if (error?.code === 'ERR_MODULE_NOT_FOUND') {
            expect.fail(
                'Missing scripts/design/build.mjs. Export DESIGN_DOC_ID and '
                + 'synchronous buildDesignDoc(sourceDir, { fs, pathImpl }).'
            );
        }
        throw error;
    }
}

function expectInvalid(buildDesignDoc, sourceDir, fs, pathImpl, needle) {
    try {
        buildDesignDoc(sourceDir, { fs, pathImpl });
    } catch (error) {
        expect(error.name).to.equal('MaintenanceError');
        expect(error.code).to.equal('INVALID_SOURCE');
        expect(error.message).to.be.a('string').and.not.empty;
        if (needle) {
            expect(error.message).to.include(needle);
        }
        return;
    }
    expect.fail('expected MaintenanceError INVALID_SOURCE');
}

describe('buildDesignDoc', () => {
    const winRoot = 'C:\\Users\\steve\\Repos\\sshf-api\\couchdb\\design\\basic';
    const posixRoot = '/home/steve/Repos/sshf-api/couchdb/design/basic';

    const tree = {
        'views/flights/map.js': MAP_CRLF,
        'views/active_by_flight/map.js': QUOTED_MAP,
        'views/admin_duplicates/map.js': MAP_CR,
        'views/admin_duplicates/reduce.js': REDUCE_CRLF,
        'lists/flight-csv.js': LIST_CRLF,
        'lists/callcenterfollowup-csv.js': LIST_LF
    };

    async function buildFrom(root, pathImpl, files = tree) {
        const { buildDesignDoc, DESIGN_DOC_ID } = await loadBuild();
        const fs = memoryFs(root, pathImpl, files);
        const doc = buildDesignDoc(root, { fs, pathImpl });
        return { doc, fs, DESIGN_DOC_ID };
    }

    it('builds _design/basic from view map.js, optional reduce.js, and list files', async () => {
        const { doc, DESIGN_DOC_ID } = await buildFrom(posixRoot, path.posix);
        expect(DESIGN_DOC_ID).to.equal('_design/basic');
        expect(doc).to.deep.equal({
            _id: '_design/basic',
            language: 'javascript',
            views: {
                active_by_flight: { map: couchappSource(QUOTED_MAP) },
                admin_duplicates: {
                    map: couchappSource(MAP_NORMALIZED_CR),
                    reduce: couchappSource(REDUCE_LF)
                },
                flights: { map: couchappSource(MAP_LF) }
            },
            lists: {
                'callcenterfollowup-csv': couchappSource(LIST_LF),
                'flight-csv': couchappSource(LIST_CRLF)
            }
        });
        expect(Object.keys(doc.views.flights)).to.deep.equal(['map']);
        expect(Object.keys(doc.views.admin_duplicates).sort()).to.deep.equal(['map', 'reduce']);
        expect(doc.views.active_by_flight.map).to.include('replace');
        expect(doc).to.not.have.property('_rev');
        expect(doc).to.not.have.property('_attachments');
        expect(doc).to.not.have.property('evently');
        expect(doc).to.not.have.property('shows');
        expect(doc).to.not.have.property('rewrites');
        expect(doc).to.not.have.property('vendor');
        expect(JSON.stringify(doc)).to.not.include('\r');
    });

    it('trims leading and trailing whitespace like couchapp push after normalizing line endings', async () => {
        const paddedMap = 'function(doc) {\r\n  emit(doc._id, null);  \r\n}\r\n';
        const { doc } = await buildFrom(posixRoot, path.posix, {
            'views/flights/map.js': paddedMap,
            'lists/flight-csv.js': 'function(head, req) {\r\n  \r\n}\r\n'
        });
        expect(doc.views.flights.map).to.equal('function(doc) {\n  emit(doc._id, null);  \n}');
        expect(doc.lists['flight-csv']).to.equal('function(head, req) {\n  \n}');
        expect(doc.views.flights).to.not.have.property('reduce');
    });

    it('walks the folder with Windows and POSIX path joins', async () => {
        const windows = await buildFrom(winRoot, path.win32);
        const linux = await buildFrom(posixRoot, path.posix);
        expect(windows.doc).to.deep.equal(linux.doc);
        expect(windows.fs.encodings.length).to.be.greaterThan(0);
        expect(windows.fs.encodings.every((encoding) => encoding === 'utf8')).to.equal(true);
        expect(linux.fs.encodings.every((encoding) => encoding === 'utf8')).to.equal(true);
    });

    it('rejects a source tree that is missing, empty, or carrying couchapp leftovers', async () => {
        const { buildDesignDoc } = await loadBuild();
        const root = posixRoot;
        const cases = [
            [{}, 'views'],
            [{
                'lists/flight-csv.js': LIST_LF
            }, 'views'],
            [{
                'views/flights/map.js': MAP_LF
            }, 'lists'],
            [{
                'views/flights/reduce.js': REDUCE_LF,
                'lists/flight-csv.js': LIST_LF
            }, 'flights'],
            [{
                'views/flights/map.js': ' \r\n\t',
                'lists/flight-csv.js': LIST_LF
            }, 'flights'],
            [{
                'views/flights/map.js': MAP_LF,
                'lists/flight-csv.js': '\n'
            }, 'flight-csv'],
            [{
                'views/flights/map.js': MAP_LF,
                'views/flights/reduce.js': ' \r\n',
                'lists/flight-csv.js': LIST_LF
            }, 'reduce.js'],
            [{
                'views/flights/map.js': MAP_LF,
                'views/flights/map.js.bak': MAP_LF,
                'lists/flight-csv.js': LIST_LF
            }, 'map.js.bak'],
            [{
                'views/flights/map.js': MAP_LF,
                'lists/flight-csv.js': LIST_LF,
                'shows/index.js': 'function() {}\n'
            }, 'shows'],
            [{
                'views/flights/map.js': MAP_LF,
                'lists/flight-csv.js': LIST_LF,
                'evently/profile/mustache': 'x'
            }, 'evently'],
            [{
                'views/flights/map.js': MAP_LF,
                'lists/flight-csv.js': LIST_LF,
                'validate_doc_update.js': 'function() {}\n'
            }, 'validate_doc_update.js'],
            [{
                'views/flights/map.js': MAP_LF,
                'lists/flight-csv.js': LIST_LF,
                '_attachments/index.html': '<html></html>\n'
            }, '_attachments']
        ];

        for (const [files, needle] of cases) {
            const fs = memoryFs(root, path.posix, files);
            expectInvalid(buildDesignDoc, root, fs, path.posix, needle);
        }

        const absent = memoryFs(root, path.posix, {
            'views/flights/map.js': MAP_LF,
            'lists/flight-csv.js': LIST_LF
        });
        expectInvalid(buildDesignDoc, path.posix.join(root, 'missing'), absent, path.posix);
    });

    it('reports kept when live matches couchapp-pushed text and the file only adds a trailing newline', async () => {
        const { diffDesignDocs } = await import('../scripts/design/diff.mjs');
        const liveMap = 'function(doc) {\n  if (doc.type === "Flight") emit(doc._id, null);\n}';
        const { doc } = await buildFrom(posixRoot, path.posix, {
            'views/flights/map.js': `${MAP_LF}\n`,
            'lists/flight-csv.js': LIST_LF
        });
        expect(doc.views.flights.map).to.equal(liveMap);
        const live = {
            _id: '_design/basic',
            _rev: '1',
            language: 'javascript',
            views: { flights: { map: liveMap } },
            lists: { 'flight-csv': couchappSource(LIST_LF) }
        };
        const diff = diffDesignDocs(doc, live);
        expect(diff.viewsKept).to.deep.equal(['flights']);
        expect(diff.viewsChanged).to.deep.equal([]);
        expect(diff.listsKept).to.deep.equal(['flight-csv']);
    });
});
