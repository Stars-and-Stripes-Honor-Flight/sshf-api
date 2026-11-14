/**
 * Behavioral contract for diffing a repo _design/basic document against the
 * live document (issue #165). No production differ exists yet.
 *
 * Implemented later, imported here:
 *   scripts/design/diff.mjs
 *     diffDesignDocs(repoDoc, liveDoc) => {
 *       equivalent: boolean,
 *       languageChanged: boolean,
 *       viewsAdded: string[],
 *       viewsChanged: string[],
 *       viewsKept: string[],
 *       viewsRemoved: string[],
 *       listsAdded: string[],
 *       listsChanged: string[],
 *       listsKept: string[],
 *       listsRemoved: string[],
 *       keysRemoved: string[],
 *       attachmentsRemoved: string[]
 *     }
 *
 * Name arrays are sorted lexicographically. Comparison normalizes CR LF and
 * lone CR to LF inside map, reduce, and list sources and then compares the
 * text exactly. _id and _rev are ignored. Every other live top-level key that
 * the repo document does not have is keysRemoved, including _attachments.
 * Every _attachments name is attachmentsRemoved. equivalent is true only when
 * a live doc exists, language is exactly "javascript", and every added,
 * changed, and removed bucket is empty.
 */
import { expect } from 'chai';

const diffHref = '../scripts/design/diff.mjs';

const MAP_LF = 'function(doc) {\n  emit(doc._id, null);\n}\n';
const MAP_CRLF = 'function(doc) {\r\n  emit(doc._id, null);\r\n}\r\n';
const MAP_CHANGED = 'function(doc) {\n  emit(doc._id, 1);\n}\n';
const LIST_LF = 'function(head, req) {\n  send("ok\\n");\n}\n';
const LIST_CRLF = 'function(head, req) {\r\n  send("ok\\n");\r\n}\r\n';
const LIST_CHANGED = 'function(head, req) {\n  send("new\\n");\n}\n';

function repoDoc(overrides = {}) {
    return {
        _id: '_design/basic',
        language: 'javascript',
        views: {
            active_by_flight: { map: MAP_LF },
            all_by_name: { map: MAP_CHANGED },
            flights: { map: MAP_LF }
        },
        lists: {
            'callcenterfollowup-csv': LIST_LF,
            'flight-csv': LIST_CHANGED,
            'tourlead-csv': LIST_LF
        },
        ...overrides
    };
}

function liveDoc() {
    return {
        _id: '_design/basic',
        _rev: '8-live',
        language: 'javascript',
        couchapp: { name: 'basic' },
        evently: { profile: {} },
        shows: { welcome: 'function() { return "hi"; }' },
        rewrites: [{ from: '/', to: 'index.html' }],
        vendor: { couchapp: {} },
        lib: { util: 'exports.ok = true;' },
        updates: { touch: 'function() {}' },
        filters: { recent: 'function() { return true; }' },
        validate_doc_update: 'function() {}',
        indexes: { old: {} },
        signatures: { signed: true },
        views: {
            admin_duplicates: { map: MAP_LF, reduce: '_count\r\n' },
            all_by_city: { map: 'function(doc) {\r\n  emit(doc.city);\r\n}\r\n' },
            all_by_name: { map: MAP_LF },
            flights: { map: MAP_CRLF }
        },
        lists: {
            'accommodations-csv': LIST_LF,
            'flight-csv': LIST_LF,
            'tourlead-csv': LIST_CRLF,
            'volunteer-full-csv': LIST_CHANGED
        },
        _attachments: {
            'vendor/couchapp/jquery.js': {
                content_type: 'application/javascript',
                stub: true,
                length: 12,
                digest: 'md5-jquery'
            },
            'index.html': {
                content_type: 'text/html',
                data: 'PGh0bWw+'
            },
            'style/app.css': {
                content_type: 'text/css',
                data: 'Ym9keXt9'
            },
            'images/logo.png': {
                content_type: 'image/png',
                stub: true,
                length: 4
            }
        }
    };
}

async function loadDiff() {
    try {
        return await import(diffHref);
    } catch (error) {
        if (error?.code === 'ERR_MODULE_NOT_FOUND') {
            expect.fail('Missing scripts/design/diff.mjs. Export diffDesignDocs(repoDoc, liveDoc).');
        }
        throw error;
    }
}

describe('diffDesignDocs', () => {
    it('classifies added, changed, kept, and removed views and lists', async () => {
        const { diffDesignDocs } = await loadDiff();
        const diff = diffDesignDocs(repoDoc(), liveDoc());
        expect(diff.viewsAdded).to.deep.equal(['active_by_flight']);
        expect(diff.viewsChanged).to.deep.equal(['all_by_name']);
        expect(diff.viewsKept).to.deep.equal(['flights']);
        expect(diff.viewsRemoved).to.deep.equal(['admin_duplicates', 'all_by_city']);
        expect(diff.listsAdded).to.deep.equal(['callcenterfollowup-csv']);
        expect(diff.listsChanged).to.deep.equal(['flight-csv']);
        expect(diff.listsKept).to.deep.equal(['tourlead-csv']);
        expect(diff.listsRemoved).to.deep.equal(['accommodations-csv', 'volunteer-full-csv']);
        expect(diff.languageChanged).to.equal(false);
        expect(diff.equivalent).to.equal(false);
    });

    it('lists every removed top-level key and every attachment name', async () => {
        const { diffDesignDocs } = await loadDiff();
        const diff = diffDesignDocs(repoDoc(), liveDoc());
        expect(diff.keysRemoved).to.deep.equal([
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
        expect(diff.attachmentsRemoved).to.deep.equal([
            'images/logo.png',
            'index.html',
            'style/app.css',
            'vendor/couchapp/jquery.js'
        ]);
        expect(diff.keysRemoved).to.not.include('_id');
        expect(diff.keysRemoved).to.not.include('_rev');
        expect(diff.keysRemoved).to.not.include('language');
        expect(diff.keysRemoved).to.not.include('views');
        expect(diff.keysRemoved).to.not.include('lists');
    });

    it('treats CR LF and a matching reduce as unchanged, and a reduce or extra view field as changed', async () => {
        const { diffDesignDocs } = await loadDiff();
        const repo = {
            _id: '_design/basic',
            language: 'javascript',
            views: {
                flights: { map: MAP_LF },
                with_reduce: { map: MAP_LF, reduce: '_count\n' },
                drop_reduce: { map: MAP_LF },
                gain_reduce: { map: MAP_LF, reduce: '_sum\n' },
                with_options: { map: MAP_LF }
            },
            lists: { 'flight-csv': LIST_LF }
        };
        const live = {
            _id: '_design/basic',
            _rev: '1-a',
            language: 'javascript',
            views: {
                flights: { map: MAP_CRLF },
                with_reduce: { map: MAP_CRLF, reduce: '_count\r\n' },
                drop_reduce: { map: MAP_LF, reduce: '_count' },
                gain_reduce: { map: MAP_LF },
                with_options: { map: MAP_LF, options: { include_design: true } }
            },
            lists: { 'flight-csv': LIST_CRLF }
        };
        const diff = diffDesignDocs(repo, live);
        expect(diff.viewsKept).to.deep.equal(['flights', 'with_reduce']);
        expect(diff.viewsChanged).to.deep.equal(['drop_reduce', 'gain_reduce', 'with_options']);
        expect(diff.viewsAdded).to.deep.equal([]);
        expect(diff.viewsRemoved).to.deep.equal([]);
        expect(diff.listsKept).to.deep.equal(['flight-csv']);
        expect(diff.listsChanged).to.deep.equal([]);
        expect(diff.equivalent).to.equal(false);
    });

    it('is equivalent when the live doc matches the repo doc aside from _id and _rev', async () => {
        const { diffDesignDocs } = await loadDiff();
        const repo = repoDoc({
            views: {
                flights: { map: MAP_LF },
                with_reduce: { map: MAP_CHANGED, reduce: '_stats\n' }
            },
            lists: { 'flight-csv': LIST_LF }
        });
        const live = {
            _id: '_design/basic',
            _rev: '9-same',
            language: 'javascript',
            views: {
                with_reduce: { reduce: '_stats\r\n', map: MAP_CHANGED.replace(/\n/g, '\r\n') },
                flights: { map: MAP_CRLF }
            },
            lists: { 'flight-csv': LIST_CRLF }
        };
        const diff = diffDesignDocs(repo, live);
        expect(diff).to.deep.equal({
            equivalent: true,
            languageChanged: false,
            viewsAdded: [],
            viewsChanged: [],
            viewsKept: ['flights', 'with_reduce'],
            viewsRemoved: [],
            listsAdded: [],
            listsChanged: [],
            listsKept: ['flight-csv'],
            listsRemoved: [],
            keysRemoved: [],
            attachmentsRemoved: []
        });
    });

    it('treats a null live doc as a create and a language mismatch as not equivalent', async () => {
        const { diffDesignDocs } = await loadDiff();
        const repo = repoDoc();
        const created = diffDesignDocs(repo, null);
        expect(created.equivalent).to.equal(false);
        expect(created.languageChanged).to.equal(false);
        expect(created.viewsAdded).to.deep.equal(['active_by_flight', 'all_by_name', 'flights']);
        expect(created.viewsChanged).to.deep.equal([]);
        expect(created.viewsKept).to.deep.equal([]);
        expect(created.viewsRemoved).to.deep.equal([]);
        expect(created.listsAdded).to.deep.equal([
            'callcenterfollowup-csv',
            'flight-csv',
            'tourlead-csv'
        ]);
        expect(created.listsRemoved).to.deep.equal([]);
        expect(created.keysRemoved).to.deep.equal([]);
        expect(created.attachmentsRemoved).to.deep.equal([]);

        const renamed = diffDesignDocs(repo, {
            _id: '_design/basic',
            _rev: '1-a',
            language: 'JavaScript',
            views: repo.views,
            lists: repo.lists
        });
        expect(renamed.languageChanged).to.equal(true);
        expect(renamed.equivalent).to.equal(false);
        expect(renamed.viewsChanged).to.deep.equal([]);
        expect(renamed.keysRemoved).to.deep.equal([]);

        const emptyAttachments = diffDesignDocs(repo, {
            _id: '_design/basic',
            _rev: '1-a',
            language: 'javascript',
            views: repo.views,
            lists: repo.lists,
            _attachments: {}
        });
        expect(emptyAttachments.keysRemoved).to.deep.equal(['_attachments']);
        expect(emptyAttachments.attachmentsRemoved).to.deep.equal([]);
        expect(emptyAttachments.equivalent).to.equal(false);
    });
});
