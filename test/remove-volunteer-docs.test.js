/**
 * Behavioral contract for scripts/maintenance/2026-11-14-remove-volunteer-docs.mjs.
 */
import { expect } from 'chai';
import { join } from 'node:path';

const volunteerHref = '../scripts/maintenance/2026-11-14-remove-volunteer-docs.mjs';
const runnerHref = '../scripts/maintenance/runner.mjs';
const SCRIPT_NAME = '2026-11-14-remove-volunteer-docs';
const FIXED_DATE = new Date('2026-11-14T18:22:00.123Z');

const targetEnv = {
    DB_URL: 'http://127.0.0.1:5984',
    DB_NAME: 'hf-default',
    DEV_DB_NAME: 'hf-dev',
    PRD_DB_NAME: 'hf',
    DB_USER: 'maint-user',
    DB_PASS: 'maint-secret'
};

function volunteerDoc(id, extra = {}, rev = '1-a') {
    return doc(id, { type: 'Volunteer', ...extra }, rev);
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

function designRow(designId = '_design/volunteers') {
    return row({
        _id: designId,
        _rev: '1-design',
        type: 'Volunteer'
    }, designId);
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

describe('remove volunteer docs', () => {
    it('exports the script name and batch sizes', async () => {
        const mod = await import(volunteerHref);
        expect(mod.SCRIPT_NAME).to.equal(SCRIPT_NAME);
        expect(mod.name).to.equal(SCRIPT_NAME);
        expect(mod.ALL_DOCS_PAGE_SIZE).to.equal(100);
        expect(mod.SAMPLE_SIZE).to.equal(5);
        expect(mod.default.name).to.equal(SCRIPT_NAME);
        expect(mod.default.plan).to.equal(mod.plan);
    });

    it('selects only type Volunteer and rejects near-miss values', async () => {
        const { isVolunteerDoc } = await import(volunteerHref);
        const selected = [
            volunteerDoc('volunteer-1', { name: 'Pat' }),
            volunteerDoc('volunteer-2', { note: 'legacy' }),
            { _id: 'volunteer-3', _rev: '1-a', type: 'Volunteer' }
        ];
        for (const item of selected) {
            expect(isVolunteerDoc(item), item._id).to.equal(true);
        }

        const rejected = [
            doc('volunteer-lower', { type: 'volunteer' }),
            doc('volunteer-misspell', { type: 'Volounteer' }),
            doc('volunteer-veteran', { type: 'Veteran' }),
            doc('volunteer-empty', { type: '' }),
            doc('volunteer-null', { type: null }),
            doc('volunteer-missing', { city: 'Madison' }),
            designRow(),
            doc('_design/volunteers', { type: 'Volunteer' }),
            null,
            undefined
        ];
        for (const candidate of rejected) {
            expect(isVolunteerDoc(candidate), candidate && candidate._id).to.equal(false);
        }
    });

    it('builds a deletion of only _id, _rev, and _deleted', async () => {
        const { buildDeletion } = await import(volunteerHref);
        const source = volunteerDoc('volunteer-1', { name: 'Pat' }, '3-z');
        expect(buildDeletion(source)).to.deep.equal({
            _id: 'volunteer-1',
            _rev: '3-z',
            _deleted: true
        });
        expect(Object.keys(buildDeletion(source))).to.deep.equal(['_id', '_rev', '_deleted']);
    });

    it('pages _all_docs across the database and deletes only Volunteer documents', async () => {
        const { plan } = await import(volunteerHref);
        const keep = volunteerDoc('volunteer-keep', { name: 'Keep' });
        const veteran = doc('veteran-1', { type: 'Veteran' });
        const misspell = doc('volunteer-old', { type: 'Volounteer' });
        const lowercase = doc('volunteer-low', { type: 'volunteer' });
        const pages = [[
            row(veteran),
            row(keep),
            row(misspell),
            row(lowercase),
            designRow()
        ]];
        const db = pagingAllDocs(pages);
        const result = await plan({ allDocs: db.allDocs });

        expect(db.calls).to.have.length(1);
        expect(db.calls[0]).to.include({
            include_docs: true,
            limit: 100
        });
        expect(db.calls[0].startkey).to.equal(undefined);
        expect(db.calls[0].skip || 0).to.equal(0);
        expect(result.matched).to.equal(1);
        expect(result.writes).to.deep.equal([{
            _id: 'volunteer-keep',
            _rev: '1-a',
            _deleted: true
        }]);
        expect(result.originals).to.deep.equal([keep]);
        expect(result.skipped).to.deep.equal([]);
        expect(result.flagged).to.deep.equal([]);
    });

    it('pages _all_docs with limit and skip until a short page', async () => {
        const { plan } = await import(volunteerHref);
        const docs = ['volunteer-1', 'volunteer-2', 'volunteer-3'].map((id) => volunteerDoc(id));
        const filler = doc('veteran-9', { type: 'Veteran' });
        const db = pagingAllDocs([
            [row(filler), row(docs[0]), row(docs[1])],
            [row(docs[2])]
        ]);
        const result = await plan({ allDocs: db.allDocs, pageSize: 3 });

        expect(db.calls.map((query) => ({
            include_docs: query.include_docs,
            limit: query.limit,
            startkey: query.startkey,
            skip: query.skip || 0
        }))).to.deep.equal([
            { include_docs: true, limit: 3, startkey: undefined, skip: 0 },
            { include_docs: true, limit: 3, startkey: 'volunteer-2', skip: 1 }
        ]);
        expect(result.matched).to.equal(3);
        expect(result.writes.map((item) => item._id)).to.deep.equal([
            'volunteer-1',
            'volunteer-2',
            'volunteer-3'
        ]);
    });

    it('requests another page when a page is exactly full, then stops', async () => {
        const { plan } = await import(volunteerHref);
        const docs = ['volunteer-1', 'volunteer-2', 'volunteer-3', 'volunteer-4'].map((id) => volunteerDoc(id));
        const db = pagingAllDocs([
            [row(docs[0]), row(docs[1])],
            [row(docs[2]), row(docs[3])]
        ]);
        const result = await plan({ allDocs: db.allDocs, pageSize: 2 });
        expect(db.calls).to.have.length(3);
        expect(db.calls[2]).to.include({
            startkey: 'volunteer-4',
            limit: 2,
            skip: 1
        });
        expect(result.writes).to.have.length(4);
        expect(result.writes.map((item) => item._id)).to.deep.equal(docs.map((item) => item._id));
    });

    it('never deletes design docs even when type is Volunteer', async () => {
        const { plan } = await import(volunteerHref);
        const volunteer = volunteerDoc('volunteer-live');
        const db = pagingAllDocs([[
            designRow('_design/volunteers'),
            row(volunteer)
        ]]);
        const result = await plan({ allDocs: db.allDocs, pageSize: 10 });
        expect(result.writes).to.deep.equal([{
            _id: 'volunteer-live',
            _rev: '1-a',
            _deleted: true
        }]);
        expect(result.writes.map((item) => item._id)).to.not.include('_design/volunteers');
        expect(result.matched).to.equal(1);
    });

    it('skips Volunteer rows missing _rev and does not delete them', async () => {
        const { plan } = await import(volunteerHref);
        const missingRev = { _id: 'volunteer-norev', type: 'Volunteer', name: 'Pat' };
        const db = pagingAllDocs([[row(missingRev)]]);
        const result = await plan({ allDocs: db.allDocs, pageSize: 10 });
        expect(result.writes).to.deep.equal([]);
        expect(result.skipped).to.deep.equal([{ id: 'volunteer-norev', reason: 'missing-rev' }]);
        expect(result.matched).to.equal(1);
    });

    it('keeps deletion payloads free of source fields', async () => {
        const { plan } = await import(volunteerHref);
        const source = volunteerDoc('volunteer-1', { name: 'Pat', note: 'keep me' }, '4-rev');
        const db = pagingAllDocs([[row(source)]]);
        const result = await plan({ allDocs: db.allDocs, pageSize: 10 });
        expect(result.writes).to.deep.equal([{
            _id: 'volunteer-1',
            _rev: '4-rev',
            _deleted: true
        }]);
        expect(result.writes[0]).to.not.equal(source);
        expect(source).to.not.have.property('_deleted');
    });

    it('returns a before-and-after sample capped at SAMPLE_SIZE', async () => {
        const { plan, SAMPLE_SIZE } = await import(volunteerHref);
        const docs = Array.from({ length: 7 }, (_, index) => volunteerDoc(
            `volunteer-${index + 1}`,
            { name: `Name ${index}` }
        ));
        const db = pagingAllDocs([docs.map((item) => row(item))]);
        const result = await plan({ allDocs: db.allDocs, pageSize: 20 });
        expect(SAMPLE_SIZE).to.equal(5);
        expect(result.sample).to.have.length(5);
        expect(result.sample[0]).to.deep.equal({
            id: 'volunteer-1',
            before: docs[0],
            after: { _id: 'volunteer-1', _rev: '1-a', _deleted: true },
            flagged: false
        });
        expect(result.matched).to.equal(7);
        expect(result.writes).to.have.length(7);
    });

    it('does not write while planning, including when bulkDocs is provided', async () => {
        const { plan } = await import(volunteerHref);
        let writes = 0;
        const db = pagingAllDocs([[row(volunteerDoc('volunteer-1'))]]);
        await plan({
            allDocs: db.allDocs,
            bulkDocs: async () => {
                writes += 1;
                return [];
            },
            pageSize: 10
        });
        expect(writes).to.equal(0);
    });

    describe('runner wiring', () => {
        it('dry-runs the volunteer script through the runner without a backup or delete', async () => {
            const volunteer = await import(volunteerHref);
            const { runMaintenance } = await import(runnerHref);
            const events = [];
            const keep = volunteerDoc('volunteer-1', { name: 'Pat' });
            const skip = doc('veteran-1', { type: 'Veteran' });
            const result = await runMaintenance([SCRIPT_NAME, '--env', 'dev'], {
                env: targetEnv,
                log: () => {},
                loadScript: async () => volunteer,
                fs: {
                    mkdir: async () => {
                        events.push('mkdir');
                    },
                    writeFile: async () => {
                        events.push('writeFile');
                    }
                },
                db: {
                    allDocs: async () => {
                        events.push('read');
                        return { rows: [row(skip), row(keep)] };
                    },
                    bulkDocs: async () => {
                        events.push('bulk');
                        return [];
                    }
                }
            });

            expect(events).to.deep.equal(['read']);
            expect(result.dryRun).to.equal(true);
            expect(result.matched).to.equal(1);
            expect(result.changed).to.equal(0);
            expect(result.skipped).to.equal(0);
            expect(result.flagged).to.equal(0);
            expect(result.conflicts).to.equal(0);
            expect(result.backupPath).to.equal(null);
            expect(result.sample.map((item) => item.id)).to.deep.equal(['volunteer-1']);
        });

        it('backs up full volunteer documents and then posts deletion batches', async () => {
            const volunteer = await import(volunteerHref);
            const { runMaintenance } = await import(runnerHref);
            const events = [];
            let written;
            const keep = volunteerDoc('volunteer-99', { name: 'Legacy' }, '7-live');
            const result = await runMaintenance([SCRIPT_NAME, '--apply', '--env', 'dev'], {
                env: targetEnv,
                log: () => {},
                now: () => FIXED_DATE,
                rootDir: join('tmp', 'maint'),
                loadScript: async () => volunteer,
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
                        return { rows: [row(keep)] };
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
            expect(written.file).to.equal(backupPath);
            const payload = JSON.parse(written.data);
            expect(payload.documents).to.deep.equal([keep]);
            expect(payload.script).to.equal(SCRIPT_NAME);
            expect(events[3][1]).to.deep.equal([{
                _id: 'volunteer-99',
                _rev: '7-live',
                _deleted: true
            }]);
            expect(result.changed).to.equal(1);
            expect(result.conflicts).to.equal(0);
            expect(result.backupPath).to.equal(backupPath);
        });
    });
});