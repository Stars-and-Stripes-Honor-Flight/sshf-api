import { expect } from 'chai';
import sinon from 'sinon';
import { retrieveDocument } from '../routes/docs.js';
import { retrieveVeteran } from '../routes/veterans.js';
import { retrieveGuardian } from '../routes/guardians.js';
import { retrieveFlight } from '../routes/flights.js';
import { getFlightDetail } from '../routes/flight-detail.js';
import { getFlightAssignments } from '../routes/flight-assignments.js';
import { retrieveReviewApplication } from '../routes/review-applications.js';
import { INVALID_DOCUMENT_ID_ERROR } from '../utils/document_id.js';

describe('document id security in route handlers', () => {
    let req;
    let res;

    beforeEach(() => {
        req = {
            params: { id: 'valid-id' },
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

    const rejectedCases = [
        { label: 'path traversal', id: '..' },
        { label: 'slash in id', id: 'foo/bar' },
        { label: 'design document id', id: '_design/hf-app-review' }
    ];

    const handlers = [
        { name: 'retrieveDocument', run: () => retrieveDocument(req, res) },
        { name: 'retrieveVeteran', run: () => retrieveVeteran(req, res) },
        { name: 'retrieveGuardian', run: () => retrieveGuardian(req, res) },
        { name: 'retrieveFlight', run: () => retrieveFlight(req, res) },
        { name: 'getFlightDetail', run: () => getFlightDetail(req, res) },
        { name: 'getFlightAssignments', run: () => getFlightAssignments(req, res) },
        { name: 'retrieveReviewApplication', run: () => retrieveReviewApplication(req, res) }
    ];

    for (const handler of handlers) {
        for (const rejected of rejectedCases) {
            it(`${handler.name} rejects ${rejected.label} with 400 before dbFetch`, async () => {
                req.params.id = rejected.id;

                await handler.run();

                expect(res.status.calledWith(400)).to.be.true;
                expect(res.json.firstCall.args[0].error).to.equal(INVALID_DOCUMENT_ID_ERROR);
                expect(global.fetch.called).to.be.false;
            });
        }
    }

    it('retrieveDocument encodes ids that need encoding in the CouchDB URL', async () => {
        const id = 'vet:123@test';
        req.params.id = id;
        global.fetch.resolves({
            ok: true,
            json: async () => ({ _id: id, _rev: '1-abc' })
        });

        await retrieveDocument(req, res);

        expect(global.fetch.calledOnce).to.be.true;
        const calledUrl = global.fetch.firstCall.args[0];
        const encodedId = encodeURIComponent(id);
        // Route modules capture DB_URL/DB_NAME at import. The full suite loads
        // .env later (parity scripts), so only the document segment is stable.
        expect(calledUrl.slice(calledUrl.lastIndexOf('/') + 1)).to.equal(encodedId);
        expect(calledUrl).to.not.include(id);
    });
});
