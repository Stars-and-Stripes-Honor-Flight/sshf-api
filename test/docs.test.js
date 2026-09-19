import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { expect } from 'chai';
import sinon from 'sinon';
import { listDocumentRevisions, diffDocument } from '../routes/docs.js';
import { COMPACTION_WARNING } from '../models/doc_diff.js';

const indexSource = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'index.js'),
    'utf8'
);

const REV_CURRENT = '5-aaa111aaa111aaa111aaa111aaa111aa';
const REV_PREVIOUS = '4-bbb222bbb222bbb222bbb222bbb222bb';
const REV_MISSING = '3-ccc333ccc333ccc333ccc333ccc333cc';

const revsInfoDoc = {
    _id: 'veteran-123',
    _rev: REV_CURRENT,
    status: 'Inactive',
    _revs_info: [
        { rev: REV_CURRENT, status: 'available' },
        { rev: REV_PREVIOUS, status: 'available' },
        { rev: REV_MISSING, status: 'missing' }
    ]
};

const previousDoc = {
    _id: 'veteran-123',
    _rev: REV_PREVIOUS,
    status: 'Active'
};

const currentDoc = {
    _id: 'veteran-123',
    _rev: REV_CURRENT,
    status: 'Inactive'
};

function mockResponse(payload, { ok = true, status = 200 } = {}) {
    return {
        ok,
        status,
        json: async () => payload
    };
}

describe('Document revision routes', () => {
    let req, res;

    beforeEach(() => {
        req = {
            params: { id: 'veteran-123' },
            query: {},
            dbCookie: 'auth-cookie'
        };
        res = {
            status: sinon.stub().returnsThis(),
            json: sinon.spy()
        };
        global.fetch = sinon.stub();
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('route registration', () => {
        it('registers revision routes before /docs/:id with authenticate, authorize, and dbSession', () => {
            const revisions = indexSource.indexOf(
                'app.get("/docs/:id/revisions", authenticate, authorize, dbSession, listDocumentRevisions)'
            );
            const diff = indexSource.indexOf(
                'app.get("/docs/:id/diff", authenticate, authorize, dbSession, diffDocument)'
            );
            const retrieve = indexSource.indexOf(
                'app.get("/docs/:id", authenticate, authorize, dbSession, retrieveDocument)'
            );

            expect(revisions).to.be.greaterThan(-1);
            expect(diff).to.be.greaterThan(-1);
            expect(retrieve).to.be.greaterThan(-1);
            expect(revisions).to.be.lessThan(retrieve);
            expect(diff).to.be.lessThan(retrieve);
        });
    });

    describe('listDocumentRevisions', () => {
        it('should return revision metadata for an existing document', async () => {
            global.fetch.resolves(mockResponse(revsInfoDoc));

            await listDocumentRevisions(req, res);

            expect(res.json.calledOnce).to.be.true;
            expect(res.json.firstCall.args[0]).to.deep.equal({
                id: 'veteran-123',
                currentRev: REV_CURRENT,
                revisions: revsInfoDoc._revs_info,
                availableCount: 2,
                warning: COMPACTION_WARNING
            });

            const url = global.fetch.firstCall.args[0];
            expect(url).to.include('/veteran-123');
            expect(url).to.include('revs_info=true');
        });

        it('should return 404 when the document does not exist', async () => {
            global.fetch.resolves(mockResponse(
                { error: 'not_found', reason: 'missing' },
                { ok: false, status: 404 }
            ));

            await listDocumentRevisions(req, res);

            expect(res.status.calledWith(404)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Document not found');
        });

        it('should return 503 when a database session cannot be established', async () => {
            global.fetch.rejects(new Error('Database error'));

            await listDocumentRevisions(req, res);

            expect(res.status.calledWith(503)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Database session could not be established');
        });
    });

    describe('diffDocument', () => {
        function stubSuccessfulDiff() {
            global.fetch
                .onCall(0).resolves(mockResponse(revsInfoDoc))
                .onCall(1).resolves(mockResponse(previousDoc))
                .onCall(2).resolves(mockResponse(currentDoc));
        }

        it('should default to current versus the previous available revision', async () => {
            stubSuccessfulDiff();

            await diffDocument(req, res);

            expect(res.json.calledOnce).to.be.true;
            const payload = res.json.firstCall.args[0];
            expect(payload.id).to.equal('veteran-123');
            expect(payload.from).to.deep.equal({ rev: REV_PREVIOUS, status: 'available' });
            expect(payload.to).to.deep.equal({ rev: REV_CURRENT, status: 'available' });
            expect(payload.fromDoc).to.deep.equal(previousDoc);
            expect(payload.toDoc).to.deep.equal(currentDoc);
            expect(payload.changes).to.deep.equal([
                { path: 'status', op: 'replace', from: 'Active', to: 'Inactive' }
            ]);
            expect(payload.warning).to.equal(COMPACTION_WARNING);

            const urls = global.fetch.getCalls().map((call) => call.args[0]);
            expect(urls[0]).to.include('revs_info=true');
            expect(urls.some((url) => url.includes(`rev=${REV_PREVIOUS}`))).to.be.true;
            expect(urls.some((url) => url.includes(`rev=${REV_CURRENT}`))).to.be.true;
        });

        it('should accept explicit revision query parameters', async () => {
            stubSuccessfulDiff();
            req.query = { from: REV_PREVIOUS, to: REV_CURRENT };

            await diffDocument(req, res);

            expect(res.json.calledOnce).to.be.true;
            expect(res.json.firstCall.args[0].from.rev).to.equal(REV_PREVIOUS);
            expect(res.json.firstCall.args[0].to.rev).to.equal(REV_CURRENT);
        });

        it('should accept current and previous aliases', async () => {
            stubSuccessfulDiff();
            req.query = { from: 'previous', to: 'current' };

            await diffDocument(req, res);

            expect(res.json.calledOnce).to.be.true;
            expect(res.json.firstCall.args[0].from.rev).to.equal(REV_PREVIOUS);
            expect(res.json.firstCall.args[0].to.rev).to.equal(REV_CURRENT);
        });

        it('should return 400 for an invalid revision token before calling CouchDB', async () => {
            req.query = { from: 'not-a-rev' };

            await diffDocument(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('from');
            expect(global.fetch.called).to.be.false;
        });

        it('should return 400 when from and to resolve to the same revision', async () => {
            global.fetch.resolves(mockResponse(revsInfoDoc));
            req.query = { from: REV_CURRENT, to: 'current' };

            await diffDocument(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('from and to revisions must be different');
        });

        it('should return 400 when no previous available revision exists', async () => {
            global.fetch.resolves(mockResponse({
                _id: 'veteran-123',
                _rev: REV_CURRENT,
                _revs_info: [
                    { rev: REV_CURRENT, status: 'available' },
                    { rev: REV_MISSING, status: 'missing' }
                ]
            }));

            await diffDocument(req, res);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('No previous available revision');
        });

        it('should return 404 when a requested revision was removed by compaction', async () => {
            global.fetch.resolves(mockResponse(revsInfoDoc));
            req.query = { from: REV_MISSING, to: REV_CURRENT };

            await diffDocument(req, res);

            expect(res.status.calledWith(404)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('compaction');
        });

        it('should return 404 when the document does not exist', async () => {
            global.fetch.resolves(mockResponse(
                { error: 'not_found', reason: 'missing' },
                { ok: false, status: 404 }
            ));

            await diffDocument(req, res);

            expect(res.status.calledWith(404)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Document not found');
        });

        it('should return 503 when a database session cannot be established', async () => {
            global.fetch.rejects(new Error('Database error'));

            await diffDocument(req, res);

            expect(res.status.calledWith(503)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Database session could not be established');
        });
    });
});
