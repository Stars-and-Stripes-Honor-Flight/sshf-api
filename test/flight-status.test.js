import { expect } from 'chai';
import sinon from 'sinon';
import { completeFlight, activateFutureStatus } from '../routes/flight-status.js';
import { updateVeteran } from '../routes/veterans.js';
import { updateGuardian } from '../routes/guardians.js';

const DB = 'http://couch.test/sshf';
const FIXED_NOW = '2026-10-03T15:04:05Z';
const USER = { firstName: 'Ada', lastName: 'Lovelace' };
const FLIGHT_NAME = 'SSHF-Nov2024';

function jsonResult(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body
    };
}

function okBulk(body) {
    return jsonResult(body.docs.map((doc) => ({ id: doc._id, ok: true, rev: '2-ok' })), 201);
}

function person({
    id,
    type = 'Veteran',
    status = 'Active',
    flightId = FLIGHT_NAME,
    nofly = false,
    omitFlightId = false
}) {
    const flight = {
        status,
        history: [{ id: '2020-01-01T00:00:00Z', change: 'existing flight change' }],
        nofly
    };
    if (!omitFlightId) {
        flight.id = flightId;
    }
    const doc = {
        _id: id,
        _rev: '1-abc',
        type,
        name: { first: '  John  ', last: 'Smith' },
        address: {
            street: '123 Main St',
            city: 'Springfield',
            state: 'IL',
            zip: '62701',
            county: 'Sangamon',
            phone_day: '217-555-1234'
        },
        flight,
        call: { history: [{ id: '2020-01-01T00:00:00Z', change: 'existing call change' }] },
        metadata: {
            created_at: '2020-01-01T00:00:00Z',
            created_by: 'Importer',
            updated_at: '2020-06-01T00:00:00Z',
            updated_by: 'Importer'
        },
        legacyNote: '  keep  '
    };
    if (type === 'Veteran') {
        doc.guardian = { history: [{ id: '2020-01-01T00:00:00Z', change: 'paired to: Jane by: Importer' }] };
    } else if (type === 'Guardian') {
        doc.veteran = {
            history: [{ id: '2020-01-01T00:00:00Z', change: 'paired to: John by: Importer' }],
            pairings: []
        };
    }
    return doc;
}

function flightDocument(overrides = {}) {
    return {
        _id: 'flight-123',
        _rev: '3-fff',
        type: 'Flight',
        name: FLIGHT_NAME,
        flight_date: '2024-11-05',
        capacity: '448',
        completed: false,
        metadata: {
            created_at: '2024-01-01T00:00:00Z',
            created_by: 'Importer',
            updated_at: '2024-02-01T00:00:00Z',
            updated_by: 'Importer'
        },
        legacyNote: '  keep  ',
        ...overrides
    };
}

function viewRow(doc, key) {
    return {
        id: doc._id,
        key: key || [doc.flight?.id, 'Smith'],
        doc
    };
}

function useFixedClock() {
    return sinon.useFakeTimers({
        now: new Date(FIXED_NOW),
        toFake: ['Date']
    });
}

function urlsBeforeBulk() {
    const urls = [];
    for (const call of global.fetch.getCalls()) {
        const url = String(call.args[0]);
        if (url.includes('_bulk_docs')) {
            break;
        }
        urls.push(url);
    }
    return urls;
}

function assertViewRead(viewName, startkey, endkey, { pages = 1, allowFlightGet = false } = {}) {
    const urls = urlsBeforeBulk();
    const viewUrls = urls.filter((url) => url.includes('/_view/'));
    expect(viewUrls, urls.join('\n')).to.have.length(pages);
    const otherReads = urls.filter((url) => (
        url.includes('active_by_flight') || url.includes('_find') || url.includes('_all_docs') ||
        (url.includes('/_view/') && !url.includes(`/_design/basic/_view/${viewName}`))
    ));
    expect(otherReads, otherReads.join('\n')).to.deep.equal([]);
    for (const url of urls) {
        expect(url).to.not.include('active_by_flight');
        expect(url).to.not.include('_find');
        expect(url).to.not.include('_all_docs');
        expect(url).to.not.include('ufff0');
        if (!url.includes('/_view/')) {
            expect(allowFlightGet, url).to.equal(true);
        }
    }
    const params = new URL(viewUrls[0]).searchParams;
    expect(viewUrls[0]).to.include(`/_design/basic/_view/${viewName}`);
    expect(JSON.parse(params.get('startkey'))).to.deep.equal(startkey);
    expect(JSON.parse(params.get('endkey'))).to.deep.equal(endkey);
    expect(params.get('include_docs')).to.equal('true');
    expect(params.get('limit')).to.equal('500');
    expect(params.has('skip')).to.equal(false);
}

describe('Flight status routes', () => {
    let req;
    let res;
    const originalEnv = {};

    beforeEach(() => {
        originalEnv.DB_URL = process.env.DB_URL;
        originalEnv.DB_NAME = process.env.DB_NAME;
        process.env.DB_URL = 'http://couch.test';
        process.env.DB_NAME = 'sshf';
        req = {
            params: { id: 'flight-123' },
            body: {},
            user: USER,
            dbCookie: 'AuthSession=test-cookie'
        };
        res = {
            status: sinon.stub().returnsThis(),
            json: sinon.spy()
        };
        global.fetch = sinon.stub();
    });

    afterEach(() => {
        sinon.restore();
        for (const [key, value] of Object.entries(originalEnv)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    });

    function body() {
        return res.json.firstCall.args[0];
    }

    function bulkBodies() {
        return global.fetch.getCalls()
            .filter((call) => String(call.args[0]).includes('_bulk_docs'))
            .map((call) => JSON.parse(call.args[1].body));
    }

    describe('POST /flights/:id/complete', () => {
        it('rejects an invalid id, a missing flight, a non-flight, and an unusable name', async () => {
            req.params.id = 'bad/id';
            await completeFlight(req, res);
            expect(res.status.calledWith(400)).to.equal(true);
            expect(body().error).to.equal('Invalid document id');
            expect(global.fetch.called).to.equal(false);

            res = { status: sinon.stub().returnsThis(), json: sinon.spy() };
            req.params.id = 'flight-123';
            global.fetch.resolves({ ok: false, status: 404, json: async () => ({ error: 'not_found' }) });
            await completeFlight(req, res);
            expect(res.status.calledWith(404)).to.equal(true);
            expect(body().error).to.equal('Flight not found');

            res = { status: sinon.stub().returnsThis(), json: sinon.spy() };
            global.fetch.reset();
            global.fetch.resolves(jsonResult({ _id: 'flight-123', type: 'Veteran' }));
            await completeFlight(req, res);
            expect(res.status.calledWith(400)).to.equal(true);
            expect(body().error).to.equal('Document is not a flight record');

            for (const name of ['', 'None', 12]) {
                res = { status: sinon.stub().returnsThis(), json: sinon.spy() };
                global.fetch.resetHistory();
                global.fetch.resolves(jsonResult(flightDocument({ name })));
                await completeFlight(req, res);
                expect(res.status.calledWith(400), String(name)).to.equal(true);
                expect(body().error).to.equal('Flight name cannot be used to match people');
                expect(global.fetch.callCount).to.equal(1);
            }
        });

        it('returns 409 for a completed flight and does not read or write anyone', async () => {
            for (const completed of [true, 'true']) {
                res = { status: sinon.stub().returnsThis(), json: sinon.spy() };
                global.fetch.resetHistory();
                global.fetch.resolves(jsonResult(flightDocument({ completed })));
                await completeFlight(req, res);
                expect(res.status.calledWith(409), String(completed)).to.equal(true);
                expect(body().error).to.equal('Flight is already completed');
                expect(global.fetch.callCount).to.equal(1);
                expect(String(global.fetch.firstCall.args[0])).to.equal(`${DB}/flight-123`);
            }
        });

        it('returns 500 when the flight or the view cannot be read, and writes nothing', async () => {
            global.fetch.resolves({
                ok: false,
                status: 500,
                json: async () => ({ reason: 'secret-flight', error: 'internal_server_error' })
            });
            await completeFlight(req, res);
            expect(res.status.calledWith(500)).to.equal(true);
            expect(body().error).to.equal('Failed to get flight');
            expect(body().error).to.not.include('secret-flight');

            res = { status: sinon.stub().returnsThis(), json: sinon.spy() };
            global.fetch.reset();
            global.fetch.resolves({
                ok: false,
                status: 500,
                json: async () => {
                    throw new Error('bad json');
                }
            });
            await completeFlight(req, res);
            expect(res.status.calledWith(500)).to.equal(true);
            expect(body().error).to.equal('Failed to get flight');

            res = { status: sinon.stub().returnsThis(), json: sinon.spy() };
            global.fetch.reset();
            global.fetch.onFirstCall().resolves(jsonResult(flightDocument()));
            global.fetch.onSecondCall().resolves({
                ok: false,
                status: 500,
                json: async () => ({ reason: 'secret-view' })
            });
            await completeFlight(req, res);
            expect(res.status.calledWith(500)).to.equal(true);
            expect(body().error).to.equal('Failed to read matching people');
            expect(body().error).to.not.include('secret-view');
            expect(bulkBodies()).to.have.length(0);

            res = { status: sinon.stub().returnsThis(), json: sinon.spy() };
            global.fetch.reset();
            global.fetch.onFirstCall().resolves(jsonResult(flightDocument()));
            global.fetch.onSecondCall().resolves({
                ok: false,
                status: 500,
                json: async () => {
                    throw new Error('bad json');
                }
            });
            await completeFlight(req, res);
            expect(res.status.calledWith(500)).to.equal(true);
            expect(body().error).to.equal('Failed to read matching people');
        });

        it('returns 503 when the database is unreachable before any save', async () => {
            global.fetch.callsFake(async (url) => {
                if (String(url).endsWith('/flight-123')) {
                    return jsonResult(flightDocument());
                }
                throw new Error('ECONNREFUSED');
            });
            await completeFlight(req, res);
            expect(res.status.calledWith(503)).to.equal(true);
            expect(body().error).to.match(/Database session/);
            expect(bulkBodies()).to.have.length(0);
        });

        it('changes only Active people, including no-fly, then completes the flight', async () => {
            const clock = useFixedClock();
            try {
                const active = person({ id: 'vet-active' });
                const removed = person({ id: 'vet-removed', status: 'Removed' });
                const nofly = person({ id: 'guard-nofly', type: 'Guardian', nofly: true });
                const deceased = person({ id: 'vet-deceased', status: 'Deceased' });
                const flown = person({ id: 'vet-flown', status: 'Flown' });
                const otherFlight = person({ id: 'vet-other', flightId: 'SSHF-Nov2024-B' });
                const volunteer = { _id: 'vol-1', type: 'Volunteer', flight: { id: FLIGHT_NAME, status: 'Active' } };
                const duplicate = structuredClone(active);
                const rows = [active, removed, nofly, deceased, flown, otherFlight, volunteer, duplicate].map((doc) => viewRow(doc));

                global.fetch.callsFake(async (url, options) => {
                    const href = String(url);
                    if (href.includes('_bulk_docs')) {
                        return okBulk(JSON.parse(options.body));
                    }
                    if (href.includes('/_view/')) {
                        return jsonResult({ rows });
                    }
                    return jsonResult(flightDocument());
                });

                await completeFlight(req, res);

                assertViewRead('all_by_flight_and_name', [FLIGHT_NAME], [FLIGHT_NAME, {}], { allowFlightGet: true });
                expect(String(global.fetch.firstCall.args[0])).to.equal(`${DB}/flight-123`);

                const bulks = bulkBodies();
                expect(bulks).to.have.length(2);
                expect(bulks[0].docs.map((doc) => doc._id)).to.deep.equal(['vet-active', 'guard-nofly']);
                for (const saved of bulks[0].docs) {
                    expect(saved.flight.status).to.equal('Flown');
                    expect(saved.flight.history).to.have.length(2);
                    expect(saved.flight.history[1]).to.deep.equal({
                        id: FIXED_NOW,
                        change: 'changed status from: Active to: Flown by: Ada Lovelace'
                    });
                    expect(saved.metadata.updated_at).to.equal(FIXED_NOW);
                    expect(saved.metadata.updated_by).to.equal('Ada Lovelace');
                    expect(saved.metadata.created_at).to.equal('2020-01-01T00:00:00Z');
                    expect(saved.metadata.created_by).to.equal('Importer');
                    expect(saved.legacyNote).to.equal('  keep  ');
                    expect(saved.name.first).to.equal('  John  ');
                    expect(saved.call.history).to.deep.equal(active.call.history);
                }
                expect(bulks[0].docs[1].flight.nofly).to.equal(true);
                expect(bulks[0].docs[1].veteran.history).to.deep.equal(nofly.veteran.history);

                const savedFlight = bulks[1].docs[0];
                expect(savedFlight._id).to.equal('flight-123');
                expect(savedFlight.completed).to.equal(true);
                expect(savedFlight.capacity).to.equal('448');
                expect(savedFlight.legacyNote).to.equal('  keep  ');
                expect(savedFlight.metadata.updated_at).to.equal(FIXED_NOW);
                expect(savedFlight.metadata.updated_by).to.equal('Ada Lovelace');
                expect(savedFlight.metadata.created_at).to.equal('2024-01-01T00:00:00Z');
                expect(savedFlight.metadata.created_by).to.equal('Importer');

                expect(res.status.calledWith(200)).to.equal(true);
                expect(body()).to.deep.equal({
                    fromStatus: 'Active',
                    toStatus: 'Flown',
                    flight: { id: 'flight-123', name: FLIGHT_NAME, completed: true },
                    counts: { matched: 5, changed: 2, skipped: 3, failed: 0 },
                    failed: []
                });
                expect(body().counts.matched).to.equal(
                    body().counts.changed + body().counts.skipped + body().counts.failed
                );
            } finally {
                clock.restore();
            }
        });

        it('matches a single-person veteran and guardian status edit', async () => {
            const clock = useFixedClock();
            try {
                const veteran = person({ id: 'vet-1' });
                const guardian = person({ id: 'guard-1', type: 'Guardian' });
                const savedByEndpoint = {};

                async function runComplete(doc) {
                    global.fetch = sinon.stub().callsFake(async (url, options) => {
                        const href = String(url);
                        if (href.includes('_bulk_docs')) {
                            const parsed = JSON.parse(options.body);
                            if (parsed.docs[0].type !== 'Flight') {
                                savedByEndpoint[doc.type] = parsed.docs[0];
                            }
                            return okBulk(parsed);
                        }
                        if (href.includes('/_view/')) {
                            return jsonResult({ rows: [viewRow(structuredClone(doc))] });
                        }
                        return jsonResult(flightDocument());
                    });
                    res = { status: sinon.stub().returnsThis(), json: sinon.spy() };
                    await completeFlight(req, res);
                    expect(res.status.calledWith(200), doc.type).to.equal(true);
                }

                async function runPut(handler, doc, toStatus) {
                    const putBodies = [];
                    global.fetch = sinon.stub().callsFake(async (url, options) => {
                        if (options?.method === 'PUT') {
                            putBodies.push(JSON.parse(options.body));
                            return jsonResult({ ok: true, rev: '2-put' });
                        }
                        return jsonResult(structuredClone(doc));
                    });
                    const putReq = {
                        params: { id: doc._id },
                        body: { ...structuredClone(doc), flight: { ...doc.flight, status: toStatus } },
                        user: USER,
                        dbCookie: req.dbCookie
                    };
                    const putRes = { status: sinon.stub().returnsThis(), json: sinon.spy() };
                    await handler(putReq, putRes);
                    expect(putBodies, doc.type).to.have.length(1);
                    return putBodies[0];
                }

                await runComplete(veteran);
                const veteranPut = await runPut(updateVeteran, veteran, 'Flown');
                expect(savedByEndpoint.Veteran.flight.history).to.deep.equal(veteranPut.flight.history);
                expect(savedByEndpoint.Veteran.metadata).to.deep.equal(veteranPut.metadata);

                await runComplete(guardian);
                const guardianPut = await runPut(updateGuardian, guardian, 'Flown');
                expect(savedByEndpoint.Guardian.flight.history).to.deep.equal(guardianPut.flight.history);
                expect(savedByEndpoint.Guardian.metadata).to.deep.equal(guardianPut.metadata);
            } finally {
                clock.restore();
            }
        });

        it('re-reads a conflicted person and saves one new history line', async () => {
            const clock = useFixedClock();
            try {
                const active = person({ id: 'vet-1' });
                const fresh = structuredClone(active);
                fresh._rev = '2-fresh';
                let personBulks = 0;
                global.fetch.callsFake(async (url, options) => {
                    const href = String(url);
                    if (href.includes('_bulk_docs')) {
                        const parsed = JSON.parse(options.body);
                        if (parsed.docs[0].type === 'Flight') {
                            return okBulk(parsed);
                        }
                        personBulks += 1;
                        if (personBulks === 1) {
                            expect(parsed.docs[0].flight.history).to.have.length(2);
                            return jsonResult([{ id: 'vet-1', error: 'conflict', reason: 'secret-conflict' }], 201);
                        }
                        expect(parsed.docs[0]._rev).to.equal('2-fresh');
                        expect(parsed.docs[0].flight.history).to.have.length(2);
                        expect(parsed.docs[0].flight.history[1].change).to.equal(
                            'changed status from: Active to: Flown by: Ada Lovelace'
                        );
                        return okBulk(parsed);
                    }
                    if (href.includes('_all_docs')) {
                        return jsonResult({ rows: [{ id: 'vet-1', doc: fresh }] });
                    }
                    if (href.includes('/_view/')) {
                        return jsonResult({ rows: [viewRow(active)] });
                    }
                    return jsonResult(flightDocument());
                });

                await completeFlight(req, res);

                expect(res.status.calledWith(200)).to.equal(true);
                expect(body().counts).to.deep.equal({ matched: 1, changed: 1, skipped: 0, failed: 0 });
                expect(personBulks).to.equal(2);
            } finally {
                clock.restore();
            }
        });

        it('skips a conflicted person who no longer qualifies and still completes the flight', async () => {
            const active = person({ id: 'vet-1' });
            const fresh = structuredClone(active);
            fresh._rev = '2-fresh';
            fresh.flight.status = 'Flown';
            global.fetch.callsFake(async (url, options) => {
                const href = String(url);
                if (href.includes('_bulk_docs')) {
                    const parsed = JSON.parse(options.body);
                    if (parsed.docs[0]._id === 'vet-1' && parsed.docs[0].flight.status === 'Flown' && parsed.docs[0]._rev === '1-abc') {
                        return jsonResult([{ id: 'vet-1', error: 'conflict' }], 201);
                    }
                    expect(parsed.docs[0].type).to.equal('Flight');
                    return okBulk(parsed);
                }
                if (href.includes('_all_docs')) {
                    return jsonResult({ rows: [{ id: 'vet-1', doc: fresh }] });
                }
                if (href.includes('/_view/')) {
                    return jsonResult({ rows: [viewRow(active)] });
                }
                return jsonResult(flightDocument());
            });

            await completeFlight(req, res);

            expect(res.status.calledWith(200)).to.equal(true);
            expect(body().counts).to.deep.equal({ matched: 1, changed: 0, skipped: 1, failed: 0 });
            expect(body().flight.completed).to.equal(true);
        });

        it('completes a flight with nobody to change', async () => {
            global.fetch.callsFake(async (url, options) => {
                const href = String(url);
                if (href.includes('_bulk_docs')) {
                    return okBulk(JSON.parse(options.body));
                }
                if (href.includes('/_view/')) {
                    return jsonResult({ rows: [] });
                }
                return jsonResult(flightDocument({ completed: 'false' }));
            });

            await completeFlight(req, res);

            const bulks = bulkBodies();
            expect(bulks).to.have.length(1);
            expect(bulks[0].docs[0].completed).to.equal(true);
            expect(res.status.calledWith(200)).to.equal(true);
            expect(body().counts).to.deep.equal({ matched: 0, changed: 0, skipped: 0, failed: 0 });
            expect(body().flight.completed).to.equal(true);
        });

        it('completes a flight whose people are already Flown', async () => {
            const flown = [person({ id: 'vet-1', status: 'Flown' }), person({ id: 'guard-1', type: 'Guardian', status: 'Flown' })];
            global.fetch.callsFake(async (url, options) => {
                const href = String(url);
                if (href.includes('_bulk_docs')) {
                    const parsed = JSON.parse(options.body);
                    expect(parsed.docs.every((doc) => doc.type === 'Flight')).to.equal(true);
                    return okBulk(parsed);
                }
                if (href.includes('/_view/')) {
                    return jsonResult({ rows: flown.map((doc) => viewRow(doc)) });
                }
                return jsonResult(flightDocument());
            });

            await completeFlight(req, res);

            expect(res.status.calledWith(200)).to.equal(true);
            expect(body().counts).to.deep.equal({ matched: 2, changed: 0, skipped: 2, failed: 0 });
            expect(body().flight.completed).to.equal(true);
        });

        it('returns 207 and does not save the flight when a person conflicts twice', async () => {
            const veteran = person({ id: 'vet-1' });
            const guardian = person({ id: 'guard-1', type: 'Guardian' });
            const pristine = new Map([veteran, guardian].map((doc) => [doc._id, structuredClone(doc)]));
            global.fetch.callsFake(async (url, options) => {
                const href = String(url);
                if (href.includes('_bulk_docs')) {
                    const parsed = JSON.parse(options.body);
                    expect(parsed.docs.some((doc) => doc.type === 'Flight')).to.equal(false);
                    return jsonResult(parsed.docs.map((doc) => ({
                        id: doc._id,
                        error: 'conflict',
                        reason: 'secret-conflict'
                    })), 201);
                }
                if (href.includes('_all_docs')) {
                    return jsonResult({
                        rows: [...pristine.values()].map((doc) => ({
                            id: doc._id,
                            doc: { ...structuredClone(doc), _rev: '2-fresh' }
                        }))
                    });
                }
                if (href.includes('/_view/')) {
                    return jsonResult({ rows: [veteran, guardian].map((doc) => viewRow(doc)) });
                }
                return jsonResult(flightDocument());
            });

            await completeFlight(req, res);

            expect(res.status.calledWith(207)).to.equal(true);
            expect(body().failed).to.deep.equal([
                { id: 'vet-1', type: 'veteran', status: 409, error: 'Document update conflict.' },
                { id: 'guard-1', type: 'guardian', status: 409, error: 'Document update conflict.' }
            ]);
            expect(body().failed[0].error).to.not.include('secret');
            expect(body().flight.completed).to.equal(false);
            expect(body().counts).to.deep.equal({ matched: 2, changed: 0, skipped: 0, failed: 2 });
            expect(bulkBodies().some((parsed) => parsed.docs.some((doc) => doc.type === 'Flight'))).to.equal(false);
        });

        it('returns 207 when the flight save fails after the people succeed', async () => {
            const active = person({ id: 'vet-1' });
            global.fetch.callsFake(async (url, options) => {
                const href = String(url);
                if (href.includes('_bulk_docs')) {
                    const parsed = JSON.parse(options.body);
                    if (parsed.docs[0].type === 'Flight') {
                        return jsonResult([{
                            id: 'flight-123',
                            error: 'forbidden',
                            reason: 'secret-reason'
                        }], 201);
                    }
                    return okBulk(parsed);
                }
                if (href.includes('/_view/')) {
                    return jsonResult({ rows: [viewRow(active)] });
                }
                return jsonResult(flightDocument());
            });

            await completeFlight(req, res);

            expect(res.status.calledWith(207)).to.equal(true);
            expect(body().failed).to.deep.equal([{
                id: 'flight-123',
                type: 'flight',
                status: 403,
                error: 'Document update rejected.'
            }]);
            expect(body().failed[0].error).to.not.include('secret-reason');
            expect(body().flight.completed).to.equal(false);
            expect(body().counts).to.deep.equal({ matched: 1, changed: 1, skipped: 0, failed: 0 });
        });

        it('treats a flight conflict whose re-read is already completed as success', async () => {
            const active = person({ id: 'vet-1' });
            let flightBulks = 0;
            global.fetch.callsFake(async (url, options) => {
                const href = String(url);
                if (href.includes('_bulk_docs')) {
                    const parsed = JSON.parse(options.body);
                    if (parsed.docs[0].type !== 'Flight') {
                        return okBulk(parsed);
                    }
                    flightBulks += 1;
                    return jsonResult([{ id: 'flight-123', error: 'conflict' }], 201);
                }
                if (href.includes('_all_docs')) {
                    return jsonResult({
                        rows: [{
                            id: 'flight-123',
                            doc: { ...flightDocument(), _rev: '9-done', completed: true }
                        }]
                    });
                }
                if (href.includes('/_view/')) {
                    return jsonResult({ rows: [viewRow(active)] });
                }
                return jsonResult(flightDocument());
            });

            await completeFlight(req, res);

            expect(flightBulks).to.equal(1);
            expect(res.status.calledWith(200)).to.equal(true);
            expect(body().flight.completed).to.equal(true);
            expect(body().failed).to.deep.equal([]);
        });

        it('saves the flight again when a conflict re-read is not completed', async () => {
            const active = person({ id: 'vet-1' });
            const fresh = flightDocument({ completed: 'false' });
            fresh._rev = '4-new';
            let flightBulks = 0;
            global.fetch.callsFake(async (url, options) => {
                const href = String(url);
                if (href.includes('_bulk_docs')) {
                    const parsed = JSON.parse(options.body);
                    if (parsed.docs[0].type !== 'Flight') {
                        return okBulk(parsed);
                    }
                    flightBulks += 1;
                    if (flightBulks === 1) {
                        return jsonResult([{ id: 'flight-123', error: 'conflict' }], 201);
                    }
                    expect(parsed.docs[0]._rev).to.equal('4-new');
                    expect(parsed.docs[0].completed).to.equal(true);
                    expect(parsed.docs[0].metadata.updated_by).to.equal('Ada Lovelace');
                    return okBulk(parsed);
                }
                if (href.includes('_all_docs')) {
                    return jsonResult({ rows: [{ id: 'flight-123', doc: fresh }] });
                }
                if (href.includes('/_view/')) {
                    return jsonResult({ rows: [viewRow(active)] });
                }
                return jsonResult(flightDocument());
            });

            await completeFlight(req, res);
            expect(flightBulks).to.equal(2);
            expect(res.status.calledWith(200)).to.equal(true);
            expect(body().flight.completed).to.equal(true);
        });

        it('returns 207 when the flight conflict remains or the re-read is not a flight', async () => {
            const active = person({ id: 'vet-1' });

            global.fetch.callsFake(async (url, options) => {
                const href = String(url);
                if (href.includes('_bulk_docs')) {
                    const parsed = JSON.parse(options.body);
                    if (parsed.docs[0].type !== 'Flight') {
                        return okBulk(parsed);
                    }
                    return jsonResult([{ id: 'flight-123', error: 'conflict', reason: 'secret-conflict' }], 201);
                }
                if (href.includes('_all_docs')) {
                    return jsonResult({
                        rows: [{ id: 'flight-123', doc: { ...flightDocument(), _rev: '4-new', completed: false } }]
                    });
                }
                if (href.includes('/_view/')) {
                    return jsonResult({ rows: [viewRow(active)] });
                }
                return jsonResult(flightDocument());
            });
            await completeFlight(req, res);
            expect(res.status.calledWith(207)).to.equal(true);
            expect(body().failed[0]).to.deep.equal({
                id: 'flight-123',
                type: 'flight',
                status: 409,
                error: 'Document update conflict.'
            });
            expect(body().flight.completed).to.equal(false);

            res = { status: sinon.stub().returnsThis(), json: sinon.spy() };
            global.fetch = sinon.stub().callsFake(async (url, options) => {
                const href = String(url);
                if (href.includes('_bulk_docs')) {
                    const parsed = JSON.parse(options.body);
                    if (parsed.docs[0].type !== 'Flight') {
                        return okBulk(parsed);
                    }
                    return jsonResult([{ id: 'flight-123', error: 'conflict' }], 201);
                }
                if (href.includes('_all_docs')) {
                    return jsonResult({
                        rows: [{ id: 'flight-123', doc: { _id: 'flight-123', _rev: '4-new', type: 'Veteran', completed: false } }]
                    });
                }
                if (href.includes('/_view/')) {
                    return jsonResult({ rows: [viewRow(structuredClone(active))] });
                }
                return jsonResult(flightDocument());
            });
            await completeFlight(req, res);
            expect(res.status.calledWith(207)).to.equal(true);
            expect(body().failed[0]).to.include({
                id: 'flight-123',
                type: 'flight',
                status: 400,
                error: 'Document is not a flight record'
            });
        });

        it('returns 207 and leaves the flight incomplete when the database is lost after saves begin', async () => {
            const people = Array.from({ length: 101 }, (_, index) => person({ id: `vet-${index}` }));
            let bulkCount = 0;
            global.fetch.callsFake(async (url, options) => {
                const href = String(url);
                if (href.includes('_bulk_docs')) {
                    bulkCount += 1;
                    const parsed = JSON.parse(options.body);
                    expect(parsed.docs.some((doc) => doc.type === 'Flight')).to.equal(false);
                    if (bulkCount === 1) {
                        return okBulk(parsed);
                    }
                    throw new Error('ECONNREFUSED');
                }
                if (href.includes('/_view/')) {
                    return jsonResult({ rows: people.map((doc) => viewRow(doc)) });
                }
                if (href.endsWith('/flight-123')) {
                    return jsonResult(flightDocument());
                }
                throw new Error('ECONNREFUSED');
            });

            await completeFlight(req, res);

            expect(res.status.calledWith(207)).to.equal(true);
            expect(body().counts).to.deep.equal({ matched: 101, changed: 100, skipped: 0, failed: 1 });
            expect(body().failed).to.deep.equal([{
                id: 'vet-100',
                type: 'veteran',
                status: 503,
                error: 'Database session error'
            }]);
            expect(body().flight.completed).to.equal(false);
            expect(bulkBodies().some((parsed) => parsed.docs.some((doc) => doc.type === 'Flight'))).to.equal(false);
        });
    });

    describe('POST /flights/future-status/activate', () => {
        const rejected = [
            undefined,
            {},
            { status: '' },
            { status: 'Future-' },
            { status: 'future-spring' },
            { status: 'Active' },
            { status: 'Flown' },
            { status: 1 }
        ];

        it('rejects a bad status before any database call', async () => {
            for (const payload of rejected) {
                res = { status: sinon.stub().returnsThis(), json: sinon.spy() };
                global.fetch.resetHistory();
                req.body = payload;
                await activateFutureStatus(req, res);
                expect(res.status.calledWith(400), JSON.stringify(payload)).to.equal(true);
                expect(body().error).to.equal('status must begin with "Future-"');
                expect(global.fetch.called).to.equal(false);
            }
        });

        it('reads only all_by_status_and_name and changes that exact status', async () => {
            const clock = useFixedClock();
            try {
                req.body = { status: ' Future-Spring ' };
                const match = person({ id: 'vet-1', status: 'Future-Spring', flightId: 'None' });
                const wrongStatus = person({ id: 'vet-2', status: 'Future-Fall', flightId: 'None' });
                const volunteer = { _id: 'vol-1', type: 'Volunteer', flight: { status: 'Future-Spring', id: 'None' } };
                global.fetch.callsFake(async (url, options) => {
                    const href = String(url);
                    if (href.includes('_bulk_docs')) {
                        return okBulk(JSON.parse(options.body));
                    }
                    if (href.includes('/_view/')) {
                        return jsonResult({ rows: [viewRow(match), viewRow(wrongStatus), viewRow(volunteer)] });
                    }
                    throw new Error(`unexpected ${href}`);
                });

                await activateFutureStatus(req, res);

                assertViewRead('all_by_status_and_name', ['Future-Spring'], ['Future-Spring', {}]);
                const bulks = bulkBodies();
                expect(bulks).to.have.length(1);
                expect(bulks[0].docs).to.have.length(1);
                const saved = bulks[0].docs[0];
                expect(saved._id).to.equal('vet-1');
                expect(saved.flight.status).to.equal('Active');
                expect(saved.flight.id).to.equal('None');
                expect(saved.flight.history).to.have.length(2);
                expect(saved.flight.history[1]).to.deep.equal({
                    id: FIXED_NOW,
                    change: 'changed status from: Future-Spring to: Active by: Ada Lovelace'
                });
                expect(saved.metadata.updated_at).to.equal(FIXED_NOW);
                expect(saved.metadata.updated_by).to.equal('Ada Lovelace');
                expect(saved.legacyNote).to.equal('  keep  ');
                expect(saved.name.first).to.equal('  John  ');
                expect(saved.call.history).to.deep.equal(match.call.history);
                expect(res.status.calledWith(200)).to.equal(true);
                expect(body()).to.deep.equal({
                    fromStatus: 'Future-Spring',
                    toStatus: 'Active',
                    counts: { matched: 1, changed: 1, skipped: 0, failed: 0 },
                    failed: [],
                    assignedToFlight: []
                });
                expect(body()).to.not.have.property('flight');
            } finally {
                clock.restore();
            }
        });

        it('reads every page of a large result before the first save', async () => {
            req.body = { status: 'Future-Spring' };
            const people = Array.from({ length: 501 }, (_, index) => (
                person({ id: `vet-${String(index).padStart(4, '0')}`, status: 'Future-Spring', flightId: 'None' })
            ));
            const bulksSeenBeforeSecondPage = [];
            let viewCalls = 0;
            global.fetch.callsFake(async (url, options) => {
                const href = String(url);
                if (href.includes('/_view/')) {
                    viewCalls += 1;
                    const params = new URL(href).searchParams;
                    expect(params.get('limit')).to.equal('500');
                    expect(JSON.parse(params.get('endkey'))).to.deep.equal(['Future-Spring', {}]);
                    expect(params.get('include_docs')).to.equal('true');
                    expect(href).to.include('/_design/basic/_view/all_by_status_and_name');
                    if (viewCalls === 1) {
                        expect(params.has('skip')).to.equal(false);
                        return jsonResult({
                            rows: people.slice(0, 500).map((doc) => ({
                                id: doc._id,
                                key: ['Future-Spring', 'Smith'],
                                doc
                            }))
                        });
                    }
                    expect(bulksSeenBeforeSecondPage).to.deep.equal([]);
                    expect(params.get('skip')).to.equal('1');
                    expect(params.get('startkey_docid')).to.equal(people[499]._id);
                    expect(JSON.parse(params.get('startkey'))).to.deep.equal(['Future-Spring', 'Smith']);
                    return jsonResult({
                        rows: [{
                            id: people[500]._id,
                            key: ['Future-Spring', 'Smith'],
                            doc: people[500]
                        }]
                    });
                }
                if (href.includes('_bulk_docs')) {
                    const parsed = JSON.parse(options.body);
                    if (viewCalls < 2) {
                        bulksSeenBeforeSecondPage.push(parsed);
                    }
                    return okBulk(parsed);
                }
                throw new Error(`unexpected ${href}`);
            });

            await activateFutureStatus(req, res);

            expect(viewCalls).to.equal(2);
            expect(urlsBeforeBulk().every((url) => url.includes('/_design/basic/_view/all_by_status_and_name'))).to.equal(true);
            const savedIds = bulkBodies().flatMap((parsed) => parsed.docs.map((doc) => doc._id));
            expect(savedIds).to.have.length(501);
            expect(savedIds[0]).to.equal('vet-0000');
            expect(savedIds[500]).to.equal('vet-0500');
            expect(res.status.calledWith(200)).to.equal(true);
            expect(body().counts).to.deep.equal({ matched: 501, changed: 501, skipped: 0, failed: 0 });
        });

        it('returns 200 with zeros when nobody has the status, including an unknown Future- value', async () => {
            for (const status of ['Future-Spring', 'Future-Winter']) {
                res = { status: sinon.stub().returnsThis(), json: sinon.spy() };
                global.fetch = sinon.stub().callsFake(async (url) => {
                    const href = String(url);
                    expect(href).to.include('/_design/basic/_view/all_by_status_and_name');
                    expect(JSON.parse(new URL(href).searchParams.get('startkey'))).to.deep.equal([status]);
                    return jsonResult({ rows: [] });
                });
                req.body = { status };
                await activateFutureStatus(req, res);
                expect(res.status.calledWith(200), status).to.equal(true);
                expect(body()).to.deep.equal({
                    fromStatus: status,
                    toStatus: 'Active',
                    counts: { matched: 0, changed: 0, skipped: 0, failed: 0 },
                    failed: [],
                    assignedToFlight: []
                });
                expect(bulkBodies()).to.have.length(0);
            }
        });

        it('still changes people already on a flight and lists them without changing the status code', async () => {
            req.body = { status: 'Future-Spring' };
            const onFlight = person({ id: 'vet-assigned', status: 'Future-Spring', flightId: FLIGHT_NAME });
            const onFlightFailed = person({ id: 'guard-assigned', type: 'Guardian', status: 'Future-Spring', flightId: FLIGHT_NAME });
            const none = person({ id: 'vet-none', status: 'Future-Spring', flightId: 'None' });
            const emptyId = person({ id: 'vet-empty', status: 'Future-Spring', flightId: '' });
            const missingId = person({ id: 'vet-missing', status: 'Future-Spring', omitFlightId: true });
            const docs = [onFlight, onFlightFailed, none, emptyId, missingId];
            const pristine = new Map(docs.map((doc) => [doc._id, structuredClone(doc)]));
            global.fetch.callsFake(async (url, options) => {
                const href = String(url);
                if (href.includes('_bulk_docs')) {
                    const parsed = JSON.parse(options.body);
                    return jsonResult(parsed.docs.map((doc) => (
                        doc._id === 'guard-assigned'
                            ? { id: doc._id, error: 'conflict', reason: 'secret-conflict' }
                            : { id: doc._id, ok: true, rev: '2-ok' }
                    )), 201);
                }
                if (href.includes('_all_docs')) {
                    const keys = JSON.parse(options.body).keys;
                    return jsonResult({
                        rows: keys.map((id) => ({
                            id,
                            doc: { ...structuredClone(pristine.get(id)), _rev: '2-fresh' }
                        }))
                    });
                }
                if (href.includes('/_view/')) {
                    return jsonResult({ rows: docs.map((doc) => viewRow(doc, [doc.flight.status, 'Smith'])) });
                }
                throw new Error(`unexpected ${href}`);
            });

            await activateFutureStatus(req, res);

            expect(res.status.calledWith(207)).to.equal(true);
            expect(body().assignedToFlight).to.deep.equal(['vet-assigned', 'guard-assigned']);
            expect(body().failed.map((item) => item.id)).to.deep.equal(['guard-assigned']);
            expect(body().failed[0]).to.include({ type: 'guardian', status: 409, error: 'Document update conflict.' });
            const saved = bulkBodies().flatMap((parsed) => parsed.docs);
            expect(saved.map((doc) => doc._id)).to.include('vet-assigned');
            expect(saved.find((doc) => doc._id === 'vet-assigned').flight.status).to.equal('Active');
            expect(saved.find((doc) => doc._id === 'vet-assigned').flight.id).to.equal(FLIGHT_NAME);
            expect(saved.find((doc) => doc._id === 'vet-missing').flight.id).to.equal(undefined);
            expect(saved.find((doc) => doc._id === 'vet-empty').flight.id).to.equal('');
            expect(body().counts.failed).to.equal(1);
            expect(body().counts.matched).to.equal(
                body().counts.changed + body().counts.skipped + body().counts.failed
            );
        });

        it('returns 207 for a partial person failure', async () => {
            req.body = { status: 'Future-Spring' };
            const match = person({ id: 'vet-1', status: 'Future-Spring', flightId: 'None' });
            global.fetch.callsFake(async (url, options) => {
                const href = String(url);
                if (href.includes('_bulk_docs')) {
                    return jsonResult([{ id: 'vet-1', error: 'forbidden', reason: 'secret-reason' }], 201);
                }
                if (href.includes('/_view/')) {
                    return jsonResult({ rows: [viewRow(match)] });
                }
                throw new Error(`unexpected ${href}`);
            });

            await activateFutureStatus(req, res);
            expect(res.status.calledWith(207)).to.equal(true);
            expect(body().failed).to.deep.equal([{
                id: 'vet-1',
                type: 'veteran',
                status: 403,
                error: 'Document update rejected.'
            }]);
            expect(body().assignedToFlight).to.deep.equal([]);
        });

        it('returns 500 for a failed view read and 503 when the database is unreachable first', async () => {
            req.body = { status: 'Future-Spring' };
            global.fetch.resolves({
                ok: false,
                status: 500,
                json: async () => ({ reason: 'secret-view' })
            });
            await activateFutureStatus(req, res);
            expect(res.status.calledWith(500)).to.equal(true);
            expect(body().error).to.equal('Failed to read matching people');
            expect(body().error).to.not.include('secret-view');
            expect(bulkBodies()).to.have.length(0);

            res = { status: sinon.stub().returnsThis(), json: sinon.spy() };
            global.fetch = sinon.stub().rejects(new Error('ECONNREFUSED'));
            await activateFutureStatus(req, res);
            expect(res.status.calledWith(503)).to.equal(true);
            expect(body().error).to.match(/Database session/);
            expect(bulkBodies()).to.have.length(0);
        });

        it('returns 207 with 503 items when the database is lost after saves begin', async () => {
            req.body = { status: 'Future-Spring' };
            const people = Array.from({ length: 101 }, (_, index) => (
                person({ id: `vet-${index}`, status: 'Future-Spring', flightId: 'None' })
            ));
            let bulkCount = 0;
            global.fetch.callsFake(async (url, options) => {
                const href = String(url);
                if (href.includes('/_view/')) {
                    return jsonResult({ rows: people.map((doc) => viewRow(doc)) });
                }
                if (href.includes('_bulk_docs')) {
                    bulkCount += 1;
                    const parsed = JSON.parse(options.body);
                    if (bulkCount === 1) {
                        return okBulk(parsed);
                    }
                    throw new Error('ECONNREFUSED');
                }
                throw new Error('ECONNREFUSED');
            });

            await activateFutureStatus(req, res);
            expect(res.status.calledWith(207)).to.equal(true);
            expect(body().counts).to.deep.equal({ matched: 101, changed: 100, skipped: 0, failed: 1 });
            expect(body().failed[0]).to.deep.equal({
                id: 'vet-100',
                type: 'veteran',
                status: 503,
                error: 'Database session error'
            });
        });

        it('skips a conflicted person whose status changed and retries one who still qualifies', async () => {
            const clock = useFixedClock();
            try {
                req.body = { status: 'Future-Spring' };
                const still = person({ id: 'vet-still', status: 'Future-Spring', flightId: 'None' });
                const moved = person({ id: 'vet-moved', status: 'Future-Spring', flightId: 'None' });
                const freshMoved = structuredClone(moved);
                freshMoved.flight.status = 'Active';
                freshMoved._rev = '2-moved';
                const freshStill = structuredClone(still);
                freshStill._rev = '2-still';
                global.fetch.callsFake(async (url, options) => {
                    const href = String(url);
                    if (href.includes('_bulk_docs')) {
                        const parsed = JSON.parse(options.body);
                        if (parsed.docs.some((doc) => doc._rev === '1-abc')) {
                            return jsonResult(parsed.docs.map((doc) => ({ id: doc._id, error: 'conflict' })), 201);
                        }
                        expect(parsed.docs.map((doc) => doc._id)).to.deep.equal(['vet-still']);
                        expect(parsed.docs[0].flight.history).to.have.length(2);
                        expect(parsed.docs[0]._rev).to.equal('2-still');
                        return okBulk(parsed);
                    }
                    if (href.includes('_all_docs')) {
                        return jsonResult({
                            rows: [
                                { id: 'vet-still', doc: freshStill },
                                { id: 'vet-moved', doc: freshMoved }
                            ]
                        });
                    }
                    if (href.includes('/_view/')) {
                        return jsonResult({ rows: [still, moved].map((doc) => viewRow(doc)) });
                    }
                    throw new Error(`unexpected ${href}`);
                });

                await activateFutureStatus(req, res);
                expect(res.status.calledWith(200)).to.equal(true);
                expect(body().counts).to.deep.equal({ matched: 2, changed: 1, skipped: 1, failed: 0 });
            } finally {
                clock.restore();
            }
        });
    });
});
