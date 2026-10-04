import { expect } from 'chai';
import sinon from 'sinon';
import { saveBulkDocs, BULK_BATCH_SIZE } from '../utils/bulk_docs.js';

function jsonResult(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => body
    };
}

function docs(count, offset = 0) {
    return Array.from({ length: count }, (_, index) => ({
        _id: `doc-${offset + index}`,
        _rev: '1-a',
        type: 'Veteran'
    }));
}

describe('saveBulkDocs', () => {
    let req;
    const originalEnv = {};

    beforeEach(() => {
        originalEnv.DB_URL = process.env.DB_URL;
        originalEnv.DB_NAME = process.env.DB_NAME;
        process.env.DB_URL = 'http://couch.test';
        process.env.DB_NAME = 'sshf';
        req = { dbCookie: 'AuthSession=test-cookie' };
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

    function bulkCalls() {
        return global.fetch.getCalls().filter((call) => String(call.args[0]).includes('/_bulk_docs'));
    }

    it('sends 250 documents in batches of 100, 100, and 50 through dbFetch', async () => {
        expect(BULK_BATCH_SIZE).to.equal(100);
        const batchSizes = [];
        global.fetch.callsFake(async (url, options) => {
            expect(url).to.equal('http://couch.test/sshf/_bulk_docs');
            expect(options.method).to.equal('POST');
            expect(options.headers['Content-Type']).to.equal('application/json');
            expect(options.headers.Accept).to.equal('application/json');
            const body = JSON.parse(options.body);
            expect(body).to.not.have.property('all_or_nothing');
            expect(Object.keys(body)).to.deep.equal(['docs']);
            batchSizes.push(body.docs.length);
            return jsonResult(body.docs.map((doc) => ({ id: doc._id, ok: true, rev: '2-b' })), 201);
        });

        const result = await saveBulkDocs(req, docs(250));

        expect(batchSizes).to.deep.equal([100, 100, 50]);
        expect(result.saved).to.have.length(250);
        expect(result.failed).to.deep.equal([]);
        expect(result.skipped).to.deep.equal([]);
        expect(result.saved[0]).to.deep.equal({ id: 'doc-0', rev: '2-b' });
        expect(result.saved[249].id).to.equal('doc-249');
    });

    it('returns an empty result for no documents without calling fetch', async () => {
        const result = await saveBulkDocs(req, []);
        expect(result).to.deep.equal({ saved: [], failed: [], skipped: [] });
        expect(global.fetch.called).to.equal(false);
    });

    it('maps forbidden, unauthorized, and other per-document errors to 403, 401, and 500', async () => {
        global.fetch.resolves(jsonResult([
            { id: 'doc-0', error: 'forbidden', reason: 'secret-forbidden' },
            { id: 'doc-1', error: 'unauthorized', reason: 'secret-unauthorized' },
            { id: 'doc-2', error: 'os_process_error', reason: 'secret-other' }
        ], 201));

        const result = await saveBulkDocs(req, docs(3));

        expect(result.saved).to.deep.equal([]);
        expect(result.failed.map((item) => item.status)).to.deep.equal([403, 401, 500]);
        expect(result.failed[0].error).to.equal('Document update rejected.');
        expect(result.failed[1].error).to.equal('Document update unauthorized.');
        expect(result.failed[2].error).to.equal('Document update failed.');
        for (const item of result.failed) {
            expect(item.error).to.not.include('secret');
        }
        expect(bulkCalls()).to.have.length(1);
    });

    it('re-reads a conflict and saves it once', async () => {
        const fresh = { _id: 'doc-0', _rev: '2-fresh', qualify: true };
        let bulkCount = 0;
        global.fetch.callsFake(async (url, options) => {
            const href = String(url);
            if (href.includes('/_bulk_docs')) {
                bulkCount += 1;
                const body = JSON.parse(options.body);
                if (bulkCount === 1) {
                    return jsonResult([{ id: 'doc-0', error: 'conflict', reason: 'secret-conflict' }], 201);
                }
                expect(body.docs[0]._rev).to.equal('2-fresh');
                expect(body.docs[0].savedOnRetry).to.equal(true);
                return jsonResult([{ id: 'doc-0', ok: true, rev: '3-saved' }], 201);
            }
            expect(href).to.equal('http://couch.test/sshf/_all_docs?include_docs=true');
            expect(options.method).to.equal('POST');
            expect(options.headers['Content-Type']).to.equal('application/json');
            expect(JSON.parse(options.body)).to.deep.equal({ keys: ['doc-0'] });
            return jsonResult({ rows: [{ id: 'doc-0', doc: fresh }] });
        });

        const result = await saveBulkDocs(req, docs(1), {
            prepareRetry(freshDoc) {
                expect(freshDoc._rev).to.equal('2-fresh');
                return { action: 'save', doc: { ...freshDoc, savedOnRetry: true } };
            }
        });

        expect(bulkCount).to.equal(2);
        expect(result.failed).to.deep.equal([]);
        expect(result.skipped).to.deep.equal([]);
        expect(result.saved).to.deep.equal([{ id: 'doc-0', rev: '3-saved' }]);
    });

    it('skips a re-read document that no longer qualifies', async () => {
        global.fetch.callsFake(async (url) => {
            const href = String(url);
            if (href.includes('/_bulk_docs')) {
                return jsonResult([{ id: 'doc-0', error: 'conflict', reason: 'secret-conflict' }], 201);
            }
            return jsonResult({ rows: [{ id: 'doc-0', doc: { _id: 'doc-0', _rev: '2-fresh' } }] });
        });

        const result = await saveBulkDocs(req, docs(1), {
            prepareRetry() {
                return { action: 'skip' };
            }
        });

        expect(bulkCalls()).to.have.length(1);
        expect(result.saved).to.deep.equal([]);
        expect(result.failed).to.deep.equal([]);
        expect(result.skipped).to.deep.equal([{ id: 'doc-0' }]);
    });

    it('counts a re-read that the caller accepts as already saved', async () => {
        global.fetch.callsFake(async (url) => {
            if (String(url).includes('/_bulk_docs')) {
                return jsonResult([{ id: 'doc-0', error: 'conflict' }], 201);
            }
            return jsonResult({ rows: [{ id: 'doc-0', doc: { _id: 'doc-0', _rev: '4-done' } }] });
        });

        const result = await saveBulkDocs(req, docs(1), {
            prepareRetry() {
                return { action: 'ok' };
            }
        });

        expect(bulkCalls()).to.have.length(1);
        expect(result.saved).to.deep.equal([{ id: 'doc-0', rev: '4-done' }]);
        expect(result.failed).to.deep.equal([]);
    });

    it('fails a second conflict with 409 and does not retry again', async () => {
        let bulkCount = 0;
        global.fetch.callsFake(async (url) => {
            if (String(url).includes('/_bulk_docs')) {
                bulkCount += 1;
                return jsonResult([{ id: 'doc-0', error: 'conflict', reason: 'secret-conflict' }], 201);
            }
            return jsonResult({ rows: [{ id: 'doc-0', doc: { _id: 'doc-0', _rev: '2-fresh' } }] });
        });

        const result = await saveBulkDocs(req, docs(1), {
            prepareRetry(freshDoc) {
                return { action: 'save', doc: freshDoc };
            }
        });

        expect(bulkCount).to.equal(2);
        expect(result.saved).to.deep.equal([]);
        expect(result.skipped).to.deep.equal([]);
        expect(result.failed).to.deep.equal([{
            id: 'doc-0',
            status: 409,
            error: 'Document update conflict.'
        }]);
        expect(result.failed[0].error).to.not.include('secret');
    });

    it('fails a conflict whose re-read document is missing', async () => {
        global.fetch.callsFake(async (url) => {
            if (String(url).includes('/_bulk_docs')) {
                return jsonResult([{ id: 'doc-0', error: 'conflict' }], 201);
            }
            return jsonResult({ rows: [{ key: 'doc-0', error: 'not_found' }] });
        });

        const result = await saveBulkDocs(req, docs(1), {
            prepareRetry() {
                throw new Error('prepareRetry should not run');
            }
        });

        expect(result.failed).to.deep.equal([{
            id: 'doc-0',
            status: 404,
            error: 'Document not found.'
        }]);
    });

    it('fails a caller-supplied retry decision and an unrecognized decision', async () => {
        global.fetch.callsFake(async (url) => {
            if (String(url).includes('/_bulk_docs')) {
                return jsonResult([
                    { id: 'doc-0', error: 'conflict' },
                    { id: 'doc-1', error: 'conflict' }
                ], 201);
            }
            return jsonResult({
                rows: [
                    { id: 'doc-0', doc: { _id: 'doc-0', _rev: '2-a' } },
                    { id: 'doc-1', doc: { _id: 'doc-1', _rev: '2-b' } }
                ]
            });
        });

        const result = await saveBulkDocs(req, docs(2), {
            prepareRetry(freshDoc) {
                if (freshDoc._id === 'doc-0') {
                    return { action: 'fail', status: 400, error: 'Document is not a flight record' };
                }
                return { action: 'wat' };
            }
        });

        expect(result.failed).to.deep.equal([
            { id: 'doc-0', status: 400, error: 'Document is not a flight record' },
            { id: 'doc-1', status: 500, error: 'Document update failed.' }
        ]);
    });

    it('fails every document in a non-2xx batch and still runs the next batch', async () => {
        let bulkCount = 0;
        global.fetch.callsFake(async (url, options) => {
            bulkCount += 1;
            const body = JSON.parse(options.body);
            if (bulkCount === 1) {
                expect(body.docs).to.have.length(100);
                return {
                    ok: false,
                    status: 500,
                    json: async () => ({ error: 'internal_server_error', reason: 'secret-batch' })
                };
            }
            expect(body.docs).to.have.length(50);
            expect(body.docs[0]._id).to.equal('doc-100');
            return jsonResult(body.docs.map((doc) => ({ id: doc._id, ok: true, rev: '2-b' })), 201);
        });

        const result = await saveBulkDocs(req, docs(150));

        expect(bulkCount).to.equal(2);
        expect(result.saved).to.have.length(50);
        expect(result.failed).to.have.length(100);
        expect(result.failed[0]).to.deep.equal({
            id: 'doc-0',
            status: 500,
            error: 'Bulk save failed.'
        });
        expect(result.failed[99].id).to.equal('doc-99');
        expect(JSON.stringify(result.failed)).to.not.include('secret-batch');
    });

    it('fails a batch when the bulk response is not a result array or cannot be parsed', async () => {
        let bulkCount = 0;
        global.fetch.callsFake(async () => {
            bulkCount += 1;
            if (bulkCount === 1) {
                return jsonResult({ error: 'bad' }, 201);
            }
            return {
                ok: true,
                status: 201,
                json: async () => {
                    throw new Error('bad json');
                }
            };
        });

        const first = await saveBulkDocs(req, docs(1));
        const second = await saveBulkDocs(req, docs(1, 10));

        expect(first.failed).to.deep.equal([{
            id: 'doc-0',
            status: 500,
            error: 'Document update failed.'
        }]);
        expect(second.failed[0].id).to.equal('doc-10');
        expect(second.failed[0].status).to.equal(500);
    });

    it('uses a stable message when a failed batch body cannot be parsed', async () => {
        global.fetch.resolves({
            ok: false,
            status: 502,
            json: async () => {
                throw new Error('bad json');
            }
        });

        const result = await saveBulkDocs(req, docs(1));
        expect(result.failed).to.deep.equal([{
            id: 'doc-0',
            status: 502,
            error: 'Bulk save failed.'
        }]);
    });

    it('fails conflicted documents when the re-read itself fails', async () => {
        global.fetch.callsFake(async (url) => {
            if (String(url).includes('/_bulk_docs')) {
                return jsonResult([{ id: 'doc-0', error: 'conflict' }], 201);
            }
            return {
                ok: false,
                status: 500,
                json: async () => ({ reason: 'secret-reread' })
            };
        });

        const result = await saveBulkDocs(req, docs(1), {
            prepareRetry() {
                return { action: 'save', doc: { _id: 'doc-0' } };
            }
        });

        expect(result.failed).to.deep.equal([{
            id: 'doc-0',
            status: 500,
            error: 'Failed to re-read conflicted documents'
        }]);
        expect(result.failed[0].error).to.not.include('secret');
    });

    it('fails remaining documents with 503 and stops when the database is lost after a save was attempted', async () => {
        const bulkBodies = [];
        global.fetch.callsFake(async (url, options) => {
            if (String(url).includes('/_bulk_docs')) {
                bulkBodies.push(JSON.parse(options.body));
            }
            throw new Error('ECONNREFUSED');
        });

        const result = await saveBulkDocs(req, docs(250));

        expect(result.saved).to.deep.equal([]);
        expect(result.failed).to.have.length(250);
        expect(result.failed.every((item) => item.status === 503)).to.equal(true);
        expect(result.failed[0].error).to.equal('Database session error');
        expect(bulkBodies.length).to.be.at.least(1);
        expect(bulkBodies.every((body) => body.docs.length === 100 && body.docs[0]._id === 'doc-0')).to.equal(true);
    });

    it('keeps earlier successes and fails the rest with 503 when a later batch loses the database', async () => {
        let bulkCount = 0;
        global.fetch.callsFake(async (url, options) => {
            if (!String(url).includes('/_bulk_docs')) {
                throw new Error('ECONNREFUSED');
            }
            bulkCount += 1;
            const body = JSON.parse(options.body);
            if (bulkCount === 1) {
                return jsonResult(body.docs.map((doc) => ({ id: doc._id, ok: true, rev: '2-b' })), 201);
            }
            throw new Error('ECONNREFUSED');
        });

        const result = await saveBulkDocs(req, docs(150));

        expect(result.saved).to.have.length(100);
        expect(result.failed).to.have.length(50);
        expect(result.failed.every((item) => item.status === 503 && item.error === 'Database session error')).to.equal(true);
        expect(result.failed[0].id).to.equal('doc-100');
    });

    it('fails the conflict and later batches with 503 when the re-read loses the database', async () => {
        let bulkCount = 0;
        global.fetch.callsFake(async (url, options) => {
            const href = String(url);
            if (href.includes('/_bulk_docs')) {
                bulkCount += 1;
                const body = JSON.parse(options.body);
                if (body.docs[0]._id === 'doc-0') {
                    return jsonResult(body.docs.map((doc) => ({ id: doc._id, error: 'conflict' })), 201);
                }
                throw new Error('later batch should not run');
            }
            throw new Error('ECONNREFUSED');
        });

        const result = await saveBulkDocs(req, docs(101), {
            prepareRetry(freshDoc) {
                return { action: 'save', doc: freshDoc };
            }
        });

        expect(bulkCount).to.equal(1);
        expect(result.saved).to.deep.equal([]);
        expect(result.failed).to.have.length(101);
        expect(result.failed.every((item) => item.status === 503)).to.equal(true);
    });

    it('uses a stable message when the conflict re-read body cannot be parsed', async () => {
        global.fetch.callsFake(async (url) => {
            if (String(url).includes('/_bulk_docs')) {
                return jsonResult([{ id: 'doc-0', error: 'conflict' }], 201);
            }
            return {
                ok: false,
                status: 500,
                json: async () => {
                    throw new Error('bad json');
                }
            };
        });

        const result = await saveBulkDocs(req, docs(1), {
            prepareRetry(freshDoc) {
                return { action: 'save', doc: freshDoc };
            }
        });

        expect(result.failed).to.deep.equal([{
            id: 'doc-0',
            status: 500,
            error: 'Failed to re-read conflicted documents'
        }]);
    });

    it('fails the retry batch when that save is rejected or its body cannot be parsed', async () => {
        async function retryResponse(second) {
            let bulkCount = 0;
            global.fetch = sinon.stub().callsFake(async (url) => {
                if (String(url).includes('/_bulk_docs')) {
                    bulkCount += 1;
                    if (bulkCount === 1) {
                        return jsonResult([{ id: 'doc-0', error: 'conflict' }], 201);
                    }
                    return second;
                }
                return jsonResult({ rows: [{ id: 'doc-0', doc: { _id: 'doc-0', _rev: '2-fresh' } }] });
            });
            return saveBulkDocs(req, docs(1), {
                prepareRetry(freshDoc) {
                    return { action: 'save', doc: freshDoc };
                }
            });
        }

        const rejected = await retryResponse({
            ok: false,
            status: 503,
            json: async () => ({ reason: 'secret-retry' })
        });
        expect(rejected.failed).to.deep.equal([{
            id: 'doc-0',
            status: 503,
            error: 'Bulk save failed.'
        }]);
        expect(rejected.failed[0].error).to.not.include('secret');

        const unparsed = await retryResponse({
            ok: true,
            status: 201,
            json: async () => {
                throw new Error('bad json');
            }
        });
        expect(unparsed.failed).to.deep.equal([{
            id: 'doc-0',
            status: 500,
            error: 'Document update failed.'
        }]);
    });

    it('rethrows an error that is not a database session failure', async () => {
        const circular = { _id: 'doc-0' };
        circular.self = circular;
        try {
            await saveBulkDocs(req, [circular]);
            expect.fail('expected stringify to throw');
        } catch (error) {
            expect(error).to.be.instanceOf(TypeError);
        }

        global.fetch.callsFake(async (url) => {
            if (String(url).includes('/_bulk_docs')) {
                return jsonResult([{ id: 'doc-0', error: 'conflict' }], 201);
            }
            return jsonResult({ rows: [{ id: 'doc-0', doc: { _id: 'doc-0', _rev: '2-fresh' } }] });
        });
        const retryCircular = { _id: 'doc-0', _rev: '2-fresh' };
        retryCircular.self = retryCircular;
        try {
            await saveBulkDocs(req, docs(1), {
                prepareRetry() {
                    return { action: 'save', doc: retryCircular };
                }
            });
            expect.fail('expected retry stringify to throw');
        } catch (error) {
            expect(error).to.be.instanceOf(TypeError);
        }
    });

    it('fails the retry documents and later batches with 503 when the retry save loses the database', async () => {
        let bulkCount = 0;
        global.fetch.callsFake(async (url, options) => {
            if (!String(url).includes('/_bulk_docs')) {
                if (String(url).includes('_all_docs')) {
                    return jsonResult({
                        rows: [{ id: 'doc-0', doc: { _id: 'doc-0', _rev: '2-fresh' } }]
                    });
                }
                throw new Error('ECONNREFUSED');
            }
            bulkCount += 1;
            const body = JSON.parse(options.body);
            if (bulkCount === 1) {
                expect(body.docs).to.have.length(100);
                return jsonResult([{ id: 'doc-0', error: 'conflict' }, ...body.docs.slice(1).map((doc) => ({
                    id: doc._id,
                    ok: true,
                    rev: '2-b'
                }))], 201);
            }
            throw new Error('ECONNREFUSED');
        });

        const people = docs(101);
        const result = await saveBulkDocs(req, people, {
            prepareRetry(freshDoc) {
                return { action: 'save', doc: freshDoc };
            }
        });

        expect(result.saved).to.have.length(99);
        expect(result.failed.map((item) => item.id)).to.include('doc-0');
        expect(result.failed.map((item) => item.id)).to.include('doc-100');
        expect(result.failed.every((item) => item.status === 503)).to.equal(true);
    });
});
