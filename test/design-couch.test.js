/**
 * HTTP contract for the design-doc deploy client (issue #165).
 * No production client exists yet.
 *
 * Implemented later, imported here:
 *   scripts/design/couch.mjs
 *     createDesignDeployDb({ url, name, user, pass, fetchImpl })
 *       getDesignDoc(id) => document | null
 *         GET /{db}/_design/basic?attachments=true
 *         404 => null
 *         other failures => MaintenanceError { code: 'DB' }
 *       putDesignDoc(doc) => { ok, id, rev } | { ok: false, error: 'conflict', status: 409 }
 *         one PUT of the given JSON body
 *         409 is returned, not retried and not followed by another GET
 *         no new_edits, no all_or_nothing
 *       Cookie session, same shape as scripts/maintenance/couch.mjs.
 *       Missing credentials throw MaintenanceError { code: 'CONFIG' } before fetch.
 */
import { expect } from 'chai';

const couchHref = '../scripts/design/couch.mjs';

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
        json: async () => ({ ok: true, userCtx: { name: 'maint-user' } })
    };
}

function header(headers, name) {
    if (!headers) {
        return undefined;
    }
    if (typeof headers.get === 'function') {
        return headers.get(name);
    }
    const match = Object.keys(headers).find((key) => key.toLowerCase() === name.toLowerCase());
    return match ? headers[match] : undefined;
}

function requestUrl(input) {
    return new URL(String(input));
}

async function loadCouch() {
    try {
        return await import(couchHref);
    } catch (error) {
        if (error?.code === 'ERR_MODULE_NOT_FOUND') {
            expect.fail('Missing scripts/design/couch.mjs. Export createDesignDeployDb.');
        }
        throw error;
    }
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

describe('createDesignDeployDb', () => {
    it('reads the design doc with attachment bodies on one cookie session', async () => {
        const { createDesignDeployDb } = await loadCouch();
        const calls = [];
        const live = {
            _id: '_design/basic',
            _rev: '4-live',
            language: 'javascript',
            views: { flights: { map: 'function(doc) {\n  emit(doc._id);\n}\n' } },
            _attachments: {
                'index.html': {
                    content_type: 'text/html',
                    data: 'PGh0bWw+'
                },
                'vendor/couchapp/jquery.js': {
                    content_type: 'application/javascript',
                    data: 'anF1ZXJ5'
                }
            }
        };
        const db = createDesignDeployDb({
            url: 'http://127.0.0.1:5984/',
            name: 'db name',
            user: 'maint-user',
            pass: 'maint-secret',
            fetchImpl: async (url, options = {}) => {
                calls.push([String(url), options]);
                if (String(url).includes('/_session')) {
                    return sessionResponse();
                }
                return { ok: true, status: 200, json: async () => live };
            }
        });

        const doc = await db.getDesignDoc('_design/basic');
        expect(doc).to.deep.equal(live);
        expect(doc._attachments['index.html'].data).to.equal('PGh0bWw+');
        expect(doc._attachments['vendor/couchapp/jquery.js'].data).to.equal('anF1ZXJ5');

        expect(calls).to.have.length(2);
        const [loginUrl, loginOptions] = calls[0];
        expect(requestUrl(loginUrl).pathname).to.equal('/_session');
        expect(loginOptions.method).to.equal('POST');
        expect(header(loginOptions.headers, 'Accept')).to.equal('application/json');
        expect(header(loginOptions.headers, 'Content-Type')).to.equal('application/json');
        expect(JSON.parse(loginOptions.body)).to.deep.equal({
            name: 'maint-user',
            password: 'maint-secret'
        });
        expect(String(loginUrl)).to.not.include('maint-secret');

        const [docUrl, docOptions] = calls[1];
        const parsed = requestUrl(docUrl);
        expect(parsed.pathname).to.equal('/db%20name/_design/basic');
        expect(decodeURIComponent(parsed.pathname)).to.equal('/db name/_design/basic');
        expect(parsed.searchParams.get('attachments')).to.equal('true');
        expect(docOptions.method || 'GET').to.equal('GET');
        expect(header(docOptions.headers, 'Accept')).to.equal('application/json');
        expect(header(docOptions.headers, 'Cookie')).to.equal('AuthSession=abc123');
        expect(header(docOptions.headers, 'Authorization') ?? null).to.equal(null);
    });

    it('returns null when the design doc is missing', async () => {
        const { createDesignDeployDb } = await loadCouch();
        const db = createDesignDeployDb({
            url: 'http://127.0.0.1:5984',
            name: 'hf-dev',
            user: 'maint-user',
            pass: 'maint-secret',
            fetchImpl: async (url) => {
                if (String(url).includes('/_session')) {
                    return sessionResponse();
                }
                return {
                    ok: false,
                    status: 404,
                    json: async () => ({ error: 'not_found', reason: 'missing' })
                };
            }
        });
        expect(await db.getDesignDoc('_design/basic')).to.equal(null);
    });

    it('puts the document once and returns a 409 without retrying or fetching a new rev', async () => {
        const { createDesignDeployDb } = await loadCouch();
        const calls = [];
        const payload = {
            _id: '_design/basic',
            _rev: '4-live',
            language: 'javascript',
            views: { flights: { map: 'function(doc) {\n}\n' } },
            lists: { 'flight-csv': 'function() {\n}\n' }
        };
        const db = createDesignDeployDb({
            url: 'http://127.0.0.1:5984',
            name: 'hf',
            user: 'maint-user',
            pass: 'maint-secret',
            fetchImpl: async (url, options = {}) => {
                calls.push([String(url), options.method || 'GET']);
                if (String(url).includes('/_session')) {
                    return sessionResponse();
                }
                return {
                    ok: false,
                    status: 409,
                    json: async () => ({
                        error: 'conflict',
                        reason: 'Document update conflict. secret-conflict-reason'
                    })
                };
            }
        });

        const result = await db.putDesignDoc(payload);
        expect(result).to.deep.equal({
            ok: false,
            id: '_design/basic',
            error: 'conflict',
            status: 409
        });
        expect(JSON.stringify(result)).to.not.include('secret-conflict-reason');
        expect(calls.map((call) => call[1])).to.deep.equal(['POST', 'PUT']);
        expect(calls.filter((call) => call[0].includes('/_design/basic'))).to.have.length(1);

        const put = calls.find((call) => call[1] === 'PUT');
        const parsed = requestUrl(put[0]);
        expect(parsed.pathname).to.equal('/hf/_design/basic');
        expect(parsed.search).to.equal('');
    });

    it('puts the given body without new_edits and reuses the session cookie', async () => {
        const { createDesignDeployDb } = await loadCouch();
        const calls = [];
        let sessions = 0;
        const payload = {
            _id: '_design/basic',
            _rev: '4-live',
            language: 'javascript',
            views: { flights: { map: 'function(doc) {\n}\n' } },
            lists: { 'flight-csv': 'function() {\n}\n' }
        };
        const db = createDesignDeployDb({
            url: 'http://127.0.0.1:5984',
            name: 'hf',
            user: 'maint-user',
            pass: 'maint-secret',
            fetchImpl: async (url, options = {}) => {
                calls.push([String(url), options]);
                if (String(url).includes('/_session')) {
                    sessions += 1;
                    return sessionResponse();
                }
                if ((options.method || 'GET') === 'PUT') {
                    return {
                        ok: true,
                        status: 201,
                        json: async () => ({ ok: true, id: '_design/basic', rev: '5-new' })
                    };
                }
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ _id: '_design/basic', _rev: '4-live' })
                };
            }
        });

        await db.getDesignDoc('_design/basic');
        const saved = await db.putDesignDoc(payload);
        expect(saved).to.deep.equal({ ok: true, id: '_design/basic', rev: '5-new' });
        expect(sessions).to.equal(1);

        const putCall = calls.find((call) => call[1].method === 'PUT');
        expect(putCall, 'PUT').to.not.equal(undefined);
        const [, options] = putCall;
        expect(header(options.headers, 'Content-Type')).to.equal('application/json');
        expect(header(options.headers, 'Accept')).to.equal('application/json');
        expect(header(options.headers, 'Cookie')).to.equal('AuthSession=abc123');
        expect(typeof options.body).to.equal('string');
        expect(JSON.parse(options.body)).to.deep.equal(payload);
        expect(options.body).to.not.include('new_edits');
        expect(options.body).to.not.include('all_or_nothing');
        expect(JSON.parse(options.body)).to.not.have.property('_attachments');
    });

    it('hides login and write failures that include the password', async () => {
        const { createDesignDeployDb } = await loadCouch();
        const loginDb = createDesignDeployDb({
            url: 'http://127.0.0.1:5984',
            name: 'hf',
            user: 'maint-user',
            pass: 'maint-secret',
            fetchImpl: async () => ({
                ok: false,
                status: 401,
                json: async () => ({
                    error: 'unauthorized',
                    reason: 'Name or password is incorrect. maint-secret'
                })
            })
        });
        const loginError = await expectCode(loginDb.getDesignDoc('_design/basic'), 'DB');
        expect(loginError.message).to.not.include('maint-secret');
        expect(loginError.message).to.not.include('unauthorized');

        const putDb = createDesignDeployDb({
            url: 'http://127.0.0.1:5984',
            name: 'hf',
            user: 'maint-user',
            pass: 'maint-secret',
            fetchImpl: async (url) => {
                if (String(url).includes('/_session')) {
                    return sessionResponse();
                }
                return {
                    ok: false,
                    status: 500,
                    json: async () => ({ error: 'internal', reason: 'maint-secret leaked' })
                };
            }
        });
        const putError = await expectCode(putDb.putDesignDoc({
            _id: '_design/basic',
            language: 'javascript',
            views: {},
            lists: {}
        }), 'DB');
        expect(putError.message).to.not.include('maint-secret');
        expect(putError.message).to.not.include('leaked');
    });

    it('rejects a client constructed without credentials before fetch', async () => {
        const { createDesignDeployDb } = await loadCouch();
        let called = false;
        try {
            createDesignDeployDb({
                url: 'http://127.0.0.1:5984',
                name: 'hf',
                user: 'maint-user',
                fetchImpl: async () => {
                    called = true;
                    return sessionResponse();
                }
            });
            expect.fail('expected CONFIG');
        } catch (error) {
            expect(error.name).to.equal('MaintenanceError');
            expect(error.code).to.equal('CONFIG');
        }
        expect(called).to.equal(false);
    });
});
