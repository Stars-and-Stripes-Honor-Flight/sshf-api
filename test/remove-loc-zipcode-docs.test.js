/**
 * Behavioral contract for scripts/maintenance/2026-11-14-remove-loc-zipcode-docs.mjs.
 *
 * Exports used by these tests:
 *   SCRIPT_NAME, name, LOC_START_KEY, LOC_END_KEY,
 *   ALL_DOCS_PAGE_SIZE, SAMPLE_SIZE,
 *   looksLikeZipCodeDoc, buildDeletion, plan
 *   default export { name, plan }
 *
 * plan({ allDocs, pageSize, sampleSize }) reads _all_docs and returns
 * { matched, writes, originals, skipped, flagged, sample }.
 * It does not write. The runner backs up originals and posts writes.
 */
import { expect } from 'chai';
import { join } from 'node:path';

const locHref = '../scripts/maintenance/2026-11-14-remove-loc-zipcode-docs.mjs';
const runnerHref = '../scripts/maintenance/runner.mjs';
const SCRIPT_NAME = '2026-11-14-remove-loc-zipcode-docs';
const FIXED_DATE = new Date('2026-11-14T18:22:00.123Z');

const targetEnv = {
    DB_URL: 'http://127.0.0.1:5984',
    DB_NAME: 'hf-default',
    DEV_DB_NAME: 'hf-dev',
    PRD_DB_NAME: 'hf',
    DB_USER: 'maint-user',
    DB_PASS: 'maint-secret'
};

function locationDoc(id, extra = {}, rev = '1-a') {
    return doc(id, { type: 'Location', ...extra }, rev);
}

function doc(id, extra = {}, rev = '1-a') {
    return { _id: id, _rev: rev, ...extra };
}

function row(document, id = document && document._id) {
    return {
        id,
        key: id,
        value: document && document._rev ? { rev: document._rev } : { deleted: true },
        doc: document
    };
}

function pagingAllDocs(pages) {
    const calls = [];
    return {
        calls,
        async allDocs(query) {
            calls.push(query);
            if (calls.length > pages.length + 1) {
                throw new Error('allDocs pagination did not stop');
            }
            return { rows: pages[calls.length - 1] || [] };
        }
    };
}

describe('remove loc- zip code docs', () => {
    it('exports the script name, key range, and batch sizes', async () => {
        const mod = await import(locHref);
        expect(mod.SCRIPT_NAME).to.equal(SCRIPT_NAME);
        expect(mod.name).to.equal(SCRIPT_NAME);
        expect(mod.LOC_START_KEY).to.equal('loc-');
        expect(mod.LOC_END_KEY).to.equal('loc-\ufff0');
        expect(mod.LOC_END_KEY).to.not.include('\\u');
        expect(mod.ALL_DOCS_PAGE_SIZE).to.equal(100);
        expect(mod.SAMPLE_SIZE).to.equal(5);
        expect(mod.default.name).to.equal(SCRIPT_NAME);
        expect(mod.default.plan).to.equal(mod.plan);
    });

    it('treats loc- plus five digits and type Location as a zip code document', async () => {
        const { looksLikeZipCodeDoc } = await import(locHref);
        const zipCases = [
            locationDoc('loc-54981', {
                city: 'Waupaca',
                zip: '54981',
                long: '-089.046680',
                county: 'Waupaca',
                state: 'WI',
                lat: '+44.429163'
            }),
            locationDoc('loc-02101', { zip: '02101' }),
            locationDoc('loc-00000'),
            { _id: 'loc-10001', _rev: '1-a', type: 'Location' }
        ];
        for (const zip of zipCases) {
            expect(looksLikeZipCodeDoc(zip), zip._id).to.equal(true);
        }

        const rejected = [
            doc('loc-10001', { city: 'New York', state: 'NY' }),
            doc('loc-10001', { type: 'ZipCode' }),
            doc('loc-10001', { type: '' }),
            doc('loc-10001', { type: null }),
            doc('loc-10001', { type: 'Volounteer' }),
            doc('loc-abc'),
            doc('loc-1234'),
            doc('loc-123456'),
            doc('loc-10001-1234'),
            doc('LOC-10001'),
            doc('location-1'),
            doc('loc-'),
            null,
            undefined
        ];
        for (const candidate of rejected) {
            expect(looksLikeZipCodeDoc(candidate), candidate && candidate._id).to.equal(false);
        }
    });

    it('builds a deletion of only _id, _rev, and _deleted', async () => {
        const { buildDeletion } = await import(locHref);
        const source = doc('loc-10001', { city: 'New York', type: 'ZipCode' }, '3-z');
        expect(buildDeletion(source)).to.deep.equal({
            _id: 'loc-10001',
            _rev: '3-z',
            _deleted: true
        });
        expect(Object.keys(buildDeletion(source))).to.deep.equal(['_id', '_rev', '_deleted']);
        expect(source).to.deep.equal(doc('loc-10001', { city: 'New York', type: 'ZipCode' }, '3-z'));
    });

    it('requests the loc- _all_docs range and ignores every other id', async () => {
        const { plan, LOC_START_KEY, LOC_END_KEY } = await import(locHref);
        const zip = locationDoc('loc-10001', { city: 'New York' });
        const pages = [[
            row(doc('veteran-1', { type: 'Veteran' })),
            row(doc('LOC-10001')),
            row(doc('location-9')),
            row(doc('loc')),
            row(zip)
        ]];
        const db = pagingAllDocs(pages);
        const result = await plan({ allDocs: db.allDocs });

        expect(db.calls).to.have.length(1);
        expect(db.calls[0]).to.include({
            startkey: LOC_START_KEY,
            endkey: LOC_END_KEY,
            include_docs: true,
            limit: 100
        });
        expect(db.calls[0].startkey).to.equal('loc-');
        expect(db.calls[0].endkey).to.equal('loc-\ufff0');
        expect(db.calls[0].skip || 0).to.equal(0);
        expect(result.matched).to.equal(1);
        expect(result.writes).to.deep.equal([{
            _id: 'loc-10001',
            _rev: '1-a',
            _deleted: true
        }]);
        expect(result.originals).to.deep.equal([zip]);
        expect(result.skipped).to.deep.equal([]);
        expect(result.flagged).to.deep.equal([]);
    });

    it('pages _all_docs with limit and skip until a short page', async () => {
        const { plan } = await import(locHref);
        const ids = ['loc-10001', 'loc-10002', 'loc-10003', 'loc-10004', 'loc-10005'];
        const docs = ids.map((id) => locationDoc(id, { city: id }));
        const db = pagingAllDocs([
            [row(docs[0]), row(docs[1])],
            [row(docs[2]), row(docs[3])],
            [row(docs[4])]
        ]);
        const result = await plan({ allDocs: db.allDocs, pageSize: 2 });

        expect(db.calls.map((query) => ({
            startkey: query.startkey,
            endkey: query.endkey,
            include_docs: query.include_docs,
            limit: query.limit,
            skip: query.skip || 0
        }))).to.deep.equal([
            { startkey: 'loc-', endkey: 'loc-\ufff0', include_docs: true, limit: 2, skip: 0 },
            { startkey: 'loc-10002', endkey: 'loc-\ufff0', include_docs: true, limit: 2, skip: 1 },
            { startkey: 'loc-10004', endkey: 'loc-\ufff0', include_docs: true, limit: 2, skip: 1 }
        ]);
        expect(result.matched).to.equal(5);
        expect(result.writes.map((item) => item._id)).to.deep.equal(ids);
    });

    it('requests another page when a page is exactly full, then stops', async () => {
        const { plan } = await import(locHref);
        const docs = ['loc-10001', 'loc-10002', 'loc-10003', 'loc-10004'].map((id) => locationDoc(id));
        const db = pagingAllDocs([
            [row(docs[0]), row(docs[1])],
            [row(docs[2]), row(docs[3])]
        ]);
        const result = await plan({ allDocs: db.allDocs, pageSize: 2 });
        expect(db.calls).to.have.length(3);
        expect(db.calls[2]).to.include({
            startkey: 'loc-10004',
            endkey: 'loc-\ufff0',
            limit: 2,
            skip: 1
        });
        expect(result.writes).to.have.length(4);
        expect(result.writes.map((item) => item._id)).to.deep.equal(docs.map((item) => item._id));
    });

    it('flags unexpected ids and non-Location loc- docs, and does not delete them', async () => {
        const { plan } = await import(locHref);
        const keepCity = locationDoc('loc-10001', { city: 'New York', state: 'NY', zip: '10001' });
        const leadingZero = locationDoc('loc-02101', { state: 'MA' });
        const typed = doc('loc-10002', { type: 'ZipCode', city: 'New York' });
        const volunteerShaped = doc('loc-10003', { type: 'Volounteer' });
        const emptyType = doc('loc-10004', { type: '' });
        const nullType = doc('loc-10005', { type: null });
        const missingType = doc('loc-10006', { city: 'Chicago' });
        const badId = doc('loc-abc', { city: 'X' });
        const shortId = doc('loc-1234');
        const longId = doc('loc-123456');
        const zipPlus4 = doc('loc-10001-1234');
        const barePrefix = doc('loc-');
        const both = doc('loc-nope', { type: 'Veteran' });
        const db = pagingAllDocs([[
            row(keepCity),
            row(leadingZero),
            row(typed),
            row(volunteerShaped),
            row(emptyType),
            row(nullType),
            row(missingType),
            row(badId),
            row(shortId),
            row(longId),
            row(zipPlus4),
            row(barePrefix),
            row(both),
            row(doc('veteran-9', { type: 'Veteran' }))
        ]]);

        const result = await plan({ allDocs: db.allDocs, pageSize: 50 });
        expect(result.writes).to.deep.equal([
            { _id: 'loc-10001', _rev: '1-a', _deleted: true },
            { _id: 'loc-02101', _rev: '1-a', _deleted: true }
        ]);
        expect(result.originals).to.deep.equal([keepCity, leadingZero]);
        expect(result.flagged).to.deep.equal([
            { id: 'loc-10002', reason: 'not-location' },
            { id: 'loc-10003', reason: 'not-location' },
            { id: 'loc-10004', reason: 'not-location' },
            { id: 'loc-10005', reason: 'not-location' },
            { id: 'loc-10006', reason: 'not-location' },
            { id: 'loc-abc', reason: 'unexpected-id' },
            { id: 'loc-1234', reason: 'unexpected-id' },
            { id: 'loc-123456', reason: 'unexpected-id' },
            { id: 'loc-10001-1234', reason: 'unexpected-id' },
            { id: 'loc-', reason: 'unexpected-id' },
            { id: 'loc-nope', reason: 'unexpected-id' }
        ]);
        expect(result.skipped).to.deep.equal(result.flagged);
        expect(result.matched).to.equal(result.writes.length + result.skipped.length);
        expect(result.writes.map((item) => item._id)).to.not.include('veteran-9');
        expect(result.flagged.map((item) => item.id)).to.not.include('veteran-9');
    });

    it('skips a loc- row with no _rev or no document body and does not flag it as a zip mismatch', async () => {
        const { plan } = await import(locHref);
        const missingRev = { _id: 'loc-10001', city: 'New York' };
        const db = pagingAllDocs([[
            row(missingRev),
            { id: 'loc-10002', key: 'loc-10002', value: { deleted: true }, doc: null }
        ]]);
        const result = await plan({ allDocs: db.allDocs, pageSize: 10 });
        expect(result.writes).to.deep.equal([]);
        expect(result.originals).to.deep.equal([]);
        expect(result.flagged).to.deep.equal([]);
        expect(result.skipped).to.deep.equal([
            { id: 'loc-10001', reason: 'missing-rev' },
            { id: 'loc-10002', reason: 'missing-doc' }
        ]);
        expect(result.matched).to.equal(2);
    });

    it('keeps deletion payloads free of source fields and leaves the source document unchanged', async () => {
        const { plan } = await import(locHref);
        const source = locationDoc('loc-10001', { city: 'New York', note: 'keep me' }, '4-rev');
        const db = pagingAllDocs([[row(source)]]);
        const result = await plan({ allDocs: db.allDocs, pageSize: 10 });
        expect(result.writes).to.deep.equal([{
            _id: 'loc-10001',
            _rev: '4-rev',
            _deleted: true
        }]);
        expect(result.writes[0]).to.not.equal(source);
        expect(result.originals[0]).to.deep.equal(source);
        expect(source).to.deep.equal(locationDoc('loc-10001', { city: 'New York', note: 'keep me' }, '4-rev'));
        expect(source).to.not.have.property('_deleted');
    });

    it('returns a before-and-after sample capped at SAMPLE_SIZE', async () => {
        const { plan, SAMPLE_SIZE } = await import(locHref);
        const docs = Array.from({ length: 7 }, (_, index) => locationDoc(
            `loc-${String(10001 + index)}`,
            { city: `City ${index}` }
        ));
        const db = pagingAllDocs([docs.map((item) => row(item))]);
        const result = await plan({ allDocs: db.allDocs, pageSize: 20 });
        expect(SAMPLE_SIZE).to.equal(5);
        expect(result.sample).to.have.length(5);
        expect(result.sample.map((item) => item.id)).to.deep.equal(docs.slice(0, 5).map((item) => item._id));
        expect(result.sample[0]).to.deep.equal({
            id: 'loc-10001',
            before: docs[0],
            after: { _id: 'loc-10001', _rev: '1-a', _deleted: true },
            flagged: false
        });
        expect(result.matched).to.equal(7);
        expect(result.writes).to.have.length(7);
    });

    it('includes flagged rows in the sample with no deletion payload', async () => {
        const { plan } = await import(locHref);
        const zip = locationDoc('loc-10001', { city: 'New York' });
        const flagged = doc('loc-abc', { type: 'Other' });
        const db = pagingAllDocs([[row(zip), row(flagged)]]);
        const result = await plan({ allDocs: db.allDocs, pageSize: 10, sampleSize: 2 });
        expect(result.sample).to.deep.equal([
            {
                id: 'loc-10001',
                before: zip,
                after: { _id: 'loc-10001', _rev: '1-a', _deleted: true },
                flagged: false
            },
            {
                id: 'loc-abc',
                before: flagged,
                after: null,
                flagged: true
            }
        ]);
    });

    it('does not write while planning, including when bulkDocs is provided', async () => {
        const { plan } = await import(locHref);
        let writes = 0;
        const db = pagingAllDocs([[row(locationDoc('loc-10001'))]]);
        await plan({
            allDocs: db.allDocs,
            bulkDocs: async () => {
                writes += 1;
                return [];
            },
            pageSize: 10
        });
        expect(writes).to.equal(0);
        expect(db.calls).to.have.length(1);
    });

    describe('runner wiring', () => {
        it('dry-runs the loc script through the runner without a backup or delete', async () => {
            const loc = await import(locHref);
            const { runMaintenance } = await import(runnerHref);
            const queries = [];
            const events = [];
            const zip = locationDoc('loc-10001', { city: 'New York' });
            const flagged = doc('loc-10002', { type: 'ZipCode', city: 'Nope' });
            const result = await runMaintenance([SCRIPT_NAME, '--env', 'dev'], {
                env: targetEnv,
                log: () => {},
                loadScript: async () => loc,
                fs: {
                    mkdir: async () => {
                        events.push('mkdir');
                    },
                    writeFile: async () => {
                        events.push('writeFile');
                    }
                },
                db: {
                    allDocs: async (query) => {
                        queries.push(query);
                        events.push('read');
                        return { rows: [row(zip), row(flagged)] };
                    },
                    bulkDocs: async () => {
                        events.push('bulk');
                        return [];
                    }
                }
            });

            expect(queries[0]).to.include({
                startkey: 'loc-',
                endkey: 'loc-\ufff0',
                include_docs: true,
                limit: 100
            });
            expect(events).to.deep.equal(['read']);
            expect(result.dryRun).to.equal(true);
            expect(result.matched).to.equal(2);
            expect(result.changed).to.equal(0);
            expect(result.skipped).to.equal(1);
            expect(result.flagged).to.equal(1);
            expect(result.flaggedIds).to.deep.equal(['loc-10002']);
            expect(result.conflicts).to.equal(0);
            expect(result.backupPath).to.equal(null);
            expect(result.sample.map((item) => item.id)).to.deep.equal(['loc-10001', 'loc-10002']);
        });

        it('backs up full loc documents and then posts deletion batches', async () => {
            const loc = await import(locHref);
            const { runMaintenance } = await import(runnerHref);
            const events = [];
            let written;
            const zip = locationDoc('loc-02101', { city: 'Boston', state: 'MA' }, '7-live');
            const flagged = doc('loc-99999', { type: 'Veteran' });
            const result = await runMaintenance([SCRIPT_NAME, '--apply', '--env', 'dev'], {
                env: targetEnv,
                log: () => {},
                now: () => FIXED_DATE,
                rootDir: join('tmp', 'maint'),
                loadScript: async () => loc,
                fs: {
                    mkdir: async (dir) => {
                        events.push(['mkdir', dir]);
                    },
                    writeFile: async (file, data) => {
                        written = { file, data };
                        events.push(['writeFile', file]);
                    }
                },
                db: {
                    allDocs: async () => {
                        events.push(['read']);
                        return { rows: [row(zip), row(flagged)] };
                    },
                    bulkDocs: async (docs) => {
                        events.push(['bulk', docs]);
                        return docs.map((item) => ({ id: item._id, ok: true, rev: '8-deleted' }));
                    }
                }
            });

            const backupName = `${SCRIPT_NAME}-2026-11-14T182200.123Z.json`;
            const backupPath = join('tmp', 'maint', 'maintenance-backups', backupName);
            expect(events.map((event) => event[0])).to.deep.equal(['read', 'mkdir', 'writeFile', 'bulk']);
            expect(events[1][1]).to.equal(join('tmp', 'maint', 'maintenance-backups'));
            expect(written.file).to.equal(backupPath);
            expect(written.file).to.not.include(':');
            const payload = JSON.parse(written.data);
            expect(payload.documents).to.deep.equal([zip]);
            expect(payload.documents[0]).to.not.have.property('_deleted');
            expect(payload).to.include({
                script: SCRIPT_NAME,
                createdAt: FIXED_DATE.toISOString(),
                env: 'dev',
                host: '127.0.0.1:5984',
                database: 'hf-dev'
            });
            expect(JSON.stringify(payload)).to.not.include('maint-secret');
            expect(events[3][1]).to.deep.equal([{
                _id: 'loc-02101',
                _rev: '7-live',
                _deleted: true
            }]);
            expect(result.changed).to.equal(1);
            expect(result.skipped).to.equal(1);
            expect(result.flaggedIds).to.deep.equal(['loc-99999']);
            expect(result.conflicts).to.equal(0);
            expect(result.backupPath).to.equal(backupPath);
        });
    });
});
