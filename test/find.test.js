import { expect } from 'chai';
import sinon from 'sinon';
import { postFind } from '../routes/find.js';
import { DatabaseSessionError } from '../utils/db.js';

describe('Find Route', () => {
    let req, res, next;

    beforeEach(() => {
        req = {
            body: {
                selector: { type: 'veteran' },
                limit: 25
            },
            dbCookie: 'auth-cookie'
        };
        res = {
            status: sinon.stub().returnsThis(),
            json: sinon.spy()
        };
        next = sinon.spy();
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('postFind', () => {
        it('should return 200 with docs, bookmark, and warning on success', async () => {
            const mockDbResult = {
                docs: [
                    { _id: '1', type: 'veteran', name: 'John Smith' },
                    { _id: '2', type: 'veteran', name: 'Jane Doe' }
                ],
                bookmark: 'g1AAAAG3eJzLYWBg4M',
                warning: 'no matching index found'
            };

            global.fetch = sinon.stub().resolves({
                ok: true,
                status: 200,
                json: async () => mockDbResult
            });

            await postFind(req, res, next);

            expect(res.json.calledOnce).to.be.true;
            const response = res.json.firstCall.args[0];
            expect(response.docs).to.deep.equal(mockDbResult.docs);
            expect(response.bookmark).to.equal(mockDbResult.bookmark);
            expect(response.warning).to.equal(mockDbResult.warning);

            // Verify the fetch was called with correct URL and method
            const fetchCall = global.fetch.firstCall;
            const url = fetchCall.args[0];
            const options = fetchCall.args[1];
            expect(url).to.include('/_find');
            expect(options.method).to.equal('POST');
        });

        it('should use default limit of 25 when limit is omitted', async () => {
            delete req.body.limit;

            global.fetch = sinon.stub().resolves({
                ok: true,
                status: 200,
                json: async () => ({ docs: [] })
            });

            await postFind(req, res, next);

            const fetchCall = global.fetch.firstCall;
            const options = fetchCall.args[1];
            const sentBody = JSON.parse(options.body);
            expect(sentBody.limit).to.equal(25);
        });

        it('should respect custom limit when it is between 1 and 100', async () => {
            req.body.limit = 50;

            global.fetch = sinon.stub().resolves({
                ok: true,
                status: 200,
                json: async () => ({ docs: [] })
            });

            await postFind(req, res, next);

            const fetchCall = global.fetch.firstCall;
            const options = fetchCall.args[1];
            const sentBody = JSON.parse(options.body);
            expect(sentBody.limit).to.equal(50);
        });

        it('should clamp limit to 100 when it exceeds maximum', async () => {
            req.body.limit = 500;

            global.fetch = sinon.stub().resolves({
                ok: true,
                status: 200,
                json: async () => ({ docs: [] })
            });

            await postFind(req, res, next);

            const fetchCall = global.fetch.firstCall;
            const options = fetchCall.args[1];
            const sentBody = JSON.parse(options.body);
            expect(sentBody.limit).to.equal(100);
        });

        it('should clamp limit to 1 when it is less than minimum', async () => {
            req.body.limit = 0;

            global.fetch = sinon.stub().resolves({
                ok: true,
                status: 200,
                json: async () => ({ docs: [] })
            });

            await postFind(req, res, next);

            const fetchCall = global.fetch.firstCall;
            const options = fetchCall.args[1];
            const sentBody = JSON.parse(options.body);
            expect(sentBody.limit).to.equal(1);
        });

        it('should clamp negative limit to 1', async () => {
            req.body.limit = -10;

            global.fetch = sinon.stub().resolves({
                ok: true,
                status: 200,
                json: async () => ({ docs: [] })
            });

            await postFind(req, res, next);

            const fetchCall = global.fetch.firstCall;
            const options = fetchCall.args[1];
            const sentBody = JSON.parse(options.body);
            expect(sentBody.limit).to.equal(1);
        });

        it('should forward bookmark when provided', async () => {
            req.body.bookmark = 'g1AAAAG3eJzLYWBg4M';

            global.fetch = sinon.stub().resolves({
                ok: true,
                status: 200,
                json: async () => ({ docs: [], bookmark: 'nextBookmark' })
            });

            await postFind(req, res, next);

            const fetchCall = global.fetch.firstCall;
            const options = fetchCall.args[1];
            const sentBody = JSON.parse(options.body);
            expect(sentBody.bookmark).to.equal('g1AAAAG3eJzLYWBg4M');

            const response = res.json.firstCall.args[0];
            expect(response.bookmark).to.equal('nextBookmark');
        });

        it('should forward execution_stats when requested', async () => {
            req.body.execution_stats = true;

            global.fetch = sinon.stub().resolves({
                ok: true,
                status: 200,
                json: async () => ({
                    docs: [],
                    execution_stats: {
                        total_keys_examined: 0,
                        total_docs_examined: 2,
                        total_quorum_docs_examined: 0,
                        results_returned: 2,
                        execution_time_ms: 5.2
                    }
                })
            });

            await postFind(req, res, next);

            const fetchCall = global.fetch.firstCall;
            const options = fetchCall.args[1];
            const sentBody = JSON.parse(options.body);
            expect(sentBody.execution_stats).to.be.true;

            const response = res.json.firstCall.args[0];
            expect(response.execution_stats).to.exist;
            expect(response.execution_stats.execution_time_ms).to.equal(5.2);
        });

        it('should not include execution_stats when omitted', async () => {
            global.fetch = sinon.stub().resolves({
                ok: true,
                status: 200,
                json: async () => ({ docs: [] })
            });

            await postFind(req, res, next);

            const fetchCall = global.fetch.firstCall;
            const options = fetchCall.args[1];
            const sentBody = JSON.parse(options.body);
            expect(sentBody.execution_stats).to.be.undefined;
        });

        it('should return 400 when selector is missing', async () => {
            delete req.body.selector;

            global.fetch = sinon.stub();

            await postFind(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('selector is required');
            expect(global.fetch.called).to.be.false;
        });

        it('should return 400 when selector is not an object', async () => {
            req.body.selector = 'not an object';

            global.fetch = sinon.stub();

            await postFind(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('selector must be an object');
            expect(global.fetch.called).to.be.false;
        });

        it('should return 400 when selector is null', async () => {
            req.body.selector = null;

            global.fetch = sinon.stub();

            await postFind(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('selector must be an object');
            expect(global.fetch.called).to.be.false;
        });

        it('should return 400 when selector is an array', async () => {
            req.body.selector = [];

            global.fetch = sinon.stub();

            await postFind(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('selector must be an object');
            expect(global.fetch.called).to.be.false;
        });

        it('should allow empty selector object', async () => {
            req.body.selector = {};

            global.fetch = sinon.stub().resolves({
                ok: true,
                status: 200,
                json: async () => ({ docs: [] })
            });

            await postFind(req, res, next);

            expect(res.json.calledOnce).to.be.true;
            expect(global.fetch.called).to.be.true;
        });

        it('should return 400 when unknown top-level keys are present', async () => {
            req.body.unknown_key = 'value';

            global.fetch = sinon.stub();

            await postFind(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('unknown_key');
            expect(global.fetch.called).to.be.false;
        });

        it('should return 400 when skip is present', async () => {
            req.body.skip = 10;

            global.fetch = sinon.stub();

            await postFind(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('skip');
            expect(global.fetch.called).to.be.false;
        });

        it('should return 400 when mutation operator $set is present', async () => {
            req.body.selector = {
                type: 'veteran',
                $set: { status: 'Active' }
            };

            global.fetch = sinon.stub();

            await postFind(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('$set');
            expect(global.fetch.called).to.be.false;
        });

        it('should return 400 when mutation operator $update is present', async () => {
            req.body.selector = {
                type: 'veteran',
                $update: { status: 'Active' }
            };

            global.fetch = sinon.stub();

            await postFind(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('$update');
            expect(global.fetch.called).to.be.false;
        });

        it('should return 400 when mutation key remove is present', async () => {
            req.body.remove = true;

            global.fetch = sinon.stub();

            await postFind(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('remove');
            expect(global.fetch.called).to.be.false;
        });

        it('should return 400 when mutation key bulk is present', async () => {
            req.body.bulk = [];

            global.fetch = sinon.stub();

            await postFind(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('bulk');
            expect(global.fetch.called).to.be.false;
        });

        it('should return 400 when mutation key docs is present as bulk payload', async () => {
            req.body.docs = [{ _id: '1', name: 'test' }];

            global.fetch = sinon.stub();

            await postFind(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('docs');
            expect(global.fetch.called).to.be.false;
        });

        it('should return 400 when mutation key new_edits is present', async () => {
            req.body.new_edits = false;

            global.fetch = sinon.stub();

            await postFind(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('new_edits');
            expect(global.fetch.called).to.be.false;
        });

        it('should return 400 when index creation keys are present', async () => {
            req.body.index = { fields: ['type'] };
            req.body.ddoc = 'my-index';

            global.fetch = sinon.stub();

            await postFind(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            const error = res.json.firstCall.args[0].error;
            expect(error).to.include('index');
            expect(global.fetch.called).to.be.false;
        });

        it('should return 400 when map/reduce keys are present', async () => {
            req.body.map = 'function(doc) { emit(doc._id, doc); }';

            global.fetch = sinon.stub();

            await postFind(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('map');
            expect(global.fetch.called).to.be.false;
        });

        it('should return 400 when nested mutation operators are present', async () => {
            req.body.selector = {
                type: 'veteran',
                nested: {
                    $set: { value: 'bad' }
                }
            };

            global.fetch = sinon.stub();

            await postFind(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('$set');
            expect(global.fetch.called).to.be.false;
        });

        it('should handle deeply nested objects without mutation operators', async () => {
            req.body.selector = {
                type: 'veteran',
                nested: {
                    deeply: {
                        nested: {
                            value: 'safe-string',
                            number: 42,
                            bool: true
                        }
                    }
                }
            };

            global.fetch = sinon.stub().resolves({
                ok: true,
                status: 200,
                json: async () => ({ docs: [] })
            });

            await postFind(req, res, next);

            expect(res.json.calledOnce).to.be.true;
            expect(global.fetch.called).to.be.true;
        });

        it('should return 400 when CouchDB returns 400', async () => {
            global.fetch = sinon.stub().resolves({
                ok: false,
                status: 400,
                json: async () => ({
                    error: 'invalid_query',
                    reason: 'Invalid selector syntax'
                })
            });

            await postFind(req, res, next);

            expect(res.status.calledWith(400)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Invalid selector syntax');
        });

        it('should return 503 when DatabaseSessionError occurs', async () => {
            global.fetch = sinon.stub().rejects(new Error('Database error'));

            await postFind(req, res, next);

            expect(res.status.calledWith(503)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.include('Database session could not be established');
        });

        it('should return 500 for non-session, non-validation errors', async () => {
            global.fetch = sinon.stub().resolves({
                ok: true,
                status: 200,
                json: async () => { throw new Error('Invalid JSON response'); }
            });

            await postFind(req, res, next);

            expect(res.status.calledWith(500)).to.be.true;
            expect(res.json.firstCall.args[0].error).to.equal('Invalid JSON response');
        });

        it('should allow valid allowlisted keys', async () => {
            req.body = {
                selector: { type: 'veteran', status: 'Active' },
                fields: ['_id', 'name', 'status'],
                sort: [{ type: 'asc' }],
                limit: 10,
                bookmark: 'abc123',
                use_index: '_design/my-index',
                execution_stats: true
            };

            global.fetch = sinon.stub().resolves({
                ok: true,
                status: 200,
                json: async () => ({ docs: [] })
            });

            await postFind(req, res, next);

            expect(res.json.calledOnce).to.be.true;
            expect(global.fetch.called).to.be.true;

            const fetchCall = global.fetch.firstCall;
            const options = fetchCall.args[1];
            const sentBody = JSON.parse(options.body);
            expect(sentBody.selector).to.deep.equal({ type: 'veteran', status: 'Active' });
            expect(sentBody.fields).to.deep.equal(['_id', 'name', 'status']);
            expect(sentBody.sort).to.deep.equal([{ type: 'asc' }]);
            expect(sentBody.limit).to.equal(10);
            expect(sentBody.bookmark).to.equal('abc123');
            expect(sentBody.use_index).to.equal('_design/my-index');
            expect(sentBody.execution_stats).to.be.true;
        });

        it('should verify URL ends with /_find', async () => {
            global.fetch = sinon.stub().resolves({
                ok: true,
                status: 200,
                json: async () => ({ docs: [] })
            });

            await postFind(req, res, next);

            const fetchCall = global.fetch.firstCall;
            const url = fetchCall.args[0];
            expect(url).to.match(/\/_find$/);
        });

        it('should verify method is POST', async () => {
            global.fetch = sinon.stub().resolves({
                ok: true,
                status: 200,
                json: async () => ({ docs: [] })
            });

            await postFind(req, res, next);

            const fetchCall = global.fetch.firstCall;
            const options = fetchCall.args[1];
            expect(options.method).to.equal('POST');
        });
    });
});
