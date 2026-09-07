import { expect } from 'chai';
import sinon from 'sinon';
import {
    dbFetch,
    dbSession,
    DatabaseSessionError,
    clearSessionCache,
    createDbClient,
    reviewDbSession,
    reviewDbFetch,
    clearReviewSessionCache,
    getReviewDbConfig
} from '../utils/db.js';

describe('Database Utilities', () => {
    let req, res, next;

    beforeEach(() => {
        // Clear the session cache before each test
        clearSessionCache();
        
        req = {
            dbCookie: 'AuthSession=initial-cookie'
        };
        res = {
            status: sinon.stub().returnsThis(),
            json: sinon.spy()
        };
        next = sinon.spy();
        global.fetch = sinon.stub();
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('DatabaseSessionError', () => {
        it('should create error with correct name and message', () => {
            const error = new DatabaseSessionError('Test error message');
            expect(error.name).to.equal('DatabaseSessionError');
            expect(error.message).to.equal('Test error message');
            expect(error instanceof Error).to.be.true;
        });
    });

    describe('dbSession middleware', () => {
        it('should create a new session when cache is empty', async () => {
            const mockCookieHeader = 'AuthSession=new-session-cookie; Path=/';
            global.fetch.resolves({
                ok: true,
                headers: {
                    get: sinon.stub().returns(mockCookieHeader)
                }
            });

            await dbSession(req, res, next);

            expect(next.calledOnce).to.be.true;
            expect(req.dbCookie).to.equal('AuthSession=new-session-cookie');
        });

        it('should handle session creation failure', async () => {
            global.fetch.resolves({
                ok: false
            });

            await dbSession(req, res, next);

            expect(res.status.called).to.be.true;
            expect(res.status.firstCall.args[0]).to.equal(500);
            expect(res.json.called).to.be.true;
            expect(next.called).to.be.false;
        });

        it('should handle fetch errors during session creation', async () => {
            global.fetch.rejects(new Error('Network error'));

            await dbSession(req, res, next);

            expect(res.status.called).to.be.true;
            expect(res.status.firstCall.args[0]).to.equal(500);
            expect(res.json.called).to.be.true;
            expect(next.called).to.be.false;
        });

        it('should use cached session when available and not expired', async () => {
            const mockCookieHeader = 'AuthSession=cached-cookie; Path=/';
            
            // First call creates a session
            global.fetch.resolves({
                ok: true,
                headers: {
                    get: sinon.stub().returns(mockCookieHeader)
                }
            });

            // First request - creates and caches session
            await dbSession(req, res, next);
            expect(next.calledOnce).to.be.true;
            expect(req.dbCookie).to.equal('AuthSession=cached-cookie');
            expect(global.fetch.calledOnce).to.be.true;

            // Reset next spy for second call
            next.resetHistory();

            // Second request - should use cached session without calling fetch
            const req2 = {};
            await dbSession(req2, res, next);
            
            expect(next.calledOnce).to.be.true;
            expect(req2.dbCookie).to.equal('AuthSession=cached-cookie');
            // fetch should not be called again - still only called once from first request
            expect(global.fetch.calledOnce).to.be.true;
        });

        it('should refresh session when cache is expired', async () => {
            const mockCookieHeader1 = 'AuthSession=first-cookie; Path=/';
            const mockCookieHeader2 = 'AuthSession=second-cookie; Path=/';
            
            // Use fake timers to control Date.now()
            const clock = sinon.useFakeTimers();
            
            try {
                // First call creates a session
                global.fetch.onFirstCall().resolves({
                    ok: true,
                    headers: {
                        get: sinon.stub().returns(mockCookieHeader1)
                    }
                });

                // First request - creates and caches session at time 0
                await dbSession(req, res, next);
                expect(req.dbCookie).to.equal('AuthSession=first-cookie');
                expect(global.fetch.calledOnce).to.be.true;

                // Reset next spy for second call
                next.resetHistory();
                
                // Advance time past the 3-minute TTL (3 * 60 * 1000 = 180000ms)
                clock.tick(180001);
                
                // Second call will create a new session because cache is expired
                global.fetch.onSecondCall().resolves({
                    ok: true,
                    headers: {
                        get: sinon.stub().returns(mockCookieHeader2)
                    }
                });

                const req2 = {};
                await dbSession(req2, res, next);
                
                expect(next.calledOnce).to.be.true;
                expect(req2.dbCookie).to.equal('AuthSession=second-cookie');
                // Fetch should be called again because cache was expired
                expect(global.fetch.calledTwice).to.be.true;
            } finally {
                clock.restore();
            }
        });
    });

    describe('dbFetch', () => {
        it('should make successful request with cookie header', async () => {
            const mockResponse = {
                ok: true,
                status: 200,
                json: async () => ({ success: true })
            };
            global.fetch.resolves(mockResponse);

            const response = await dbFetch(req, 'http://localhost:5984/db/doc');

            expect(global.fetch.calledOnce).to.be.true;
            const [url, options] = global.fetch.firstCall.args;
            expect(url).to.equal('http://localhost:5984/db/doc');
            expect(options.headers.Cookie).to.equal('AuthSession=initial-cookie');
            expect(options.headers.Accept).to.equal('application/json');
            expect(response).to.equal(mockResponse);
        });

        it('should merge custom headers with default headers', async () => {
            global.fetch.resolves({
                ok: true,
                status: 200
            });

            await dbFetch(req, 'http://localhost:5984/db/doc', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ data: 'test' })
            });

            const [, options] = global.fetch.firstCall.args;
            expect(options.method).to.equal('POST');
            expect(options.headers['Content-Type']).to.equal('application/json');
            expect(options.headers.Cookie).to.equal('AuthSession=initial-cookie');
            expect(options.body).to.equal(JSON.stringify({ data: 'test' }));
        });

        it('should refresh session and retry on 401 response', async () => {
            const mockCookieHeader = 'AuthSession=refreshed-cookie; Path=/';
            
            // First call returns 401
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 401
            });
            
            // Session refresh call
            global.fetch.onSecondCall().resolves({
                ok: true,
                headers: {
                    get: sinon.stub().returns(mockCookieHeader)
                }
            });
            
            // Retry call succeeds
            global.fetch.onThirdCall().resolves({
                ok: true,
                status: 200,
                json: async () => ({ success: true })
            });

            const response = await dbFetch(req, 'http://localhost:5984/db/doc');

            expect(global.fetch.callCount).to.equal(3);
            expect(response.ok).to.be.true;
            expect(req.dbCookie).to.equal('AuthSession=refreshed-cookie');
        });

        it('should throw DatabaseSessionError after max retry attempts', async () => {
            // All calls return 401
            global.fetch.resolves({
                ok: false,
                status: 401
            });

            try {
                await dbFetch(req, 'http://localhost:5984/db/doc');
                expect.fail('Expected DatabaseSessionError to be thrown');
            } catch (error) {
                expect(error).to.be.instanceof(DatabaseSessionError);
                expect(error.message).to.include('could not be established after 3 attempts');
            }
        });

        it('should throw DatabaseSessionError after network errors exhaust retries', async () => {
            // All calls fail with network error
            global.fetch.rejects(new Error('Network error'));

            try {
                await dbFetch(req, 'http://localhost:5984/db/doc');
                expect.fail('Expected DatabaseSessionError to be thrown');
            } catch (error) {
                expect(error).to.be.instanceof(DatabaseSessionError);
                expect(error.message).to.include('could not be established after 3 attempts');
            }
        });

        it('should return non-401 error responses without retrying', async () => {
            const errorResponse = {
                ok: false,
                status: 404,
                json: async () => ({ error: 'not_found' })
            };
            global.fetch.resolves(errorResponse);

            const response = await dbFetch(req, 'http://localhost:5984/db/doc');

            expect(global.fetch.calledOnce).to.be.true;
            expect(response.status).to.equal(404);
        });

        it('should return 500 error responses without retrying', async () => {
            const errorResponse = {
                ok: false,
                status: 500,
                json: async () => ({ error: 'internal_server_error' })
            };
            global.fetch.resolves(errorResponse);

            const response = await dbFetch(req, 'http://localhost:5984/db/doc');

            expect(global.fetch.calledOnce).to.be.true;
            expect(response.status).to.equal(500);
        });

        it('should handle session refresh failure and continue retrying', async () => {
            const mockCookieHeader = 'AuthSession=final-cookie; Path=/';
            
            // First call returns 401
            global.fetch.onCall(0).resolves({
                ok: false,
                status: 401
            });
            
            // First session refresh fails
            global.fetch.onCall(1).resolves({
                ok: false
            });
            
            // Second attempt also returns 401
            global.fetch.onCall(2).resolves({
                ok: false,
                status: 401
            });
            
            // Second session refresh succeeds
            global.fetch.onCall(3).resolves({
                ok: true,
                headers: {
                    get: sinon.stub().returns(mockCookieHeader)
                }
            });
            
            // Third attempt succeeds
            global.fetch.onCall(4).resolves({
                ok: true,
                status: 200
            });

            const response = await dbFetch(req, 'http://localhost:5984/db/doc');

            expect(response.ok).to.be.true;
        });

        it('should update req.dbCookie on successful session refresh', async () => {
            const mockCookieHeader = 'AuthSession=new-session; Path=/';
            
            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 401
            });
            
            global.fetch.onSecondCall().resolves({
                ok: true,
                headers: {
                    get: sinon.stub().returns(mockCookieHeader)
                }
            });
            
            global.fetch.onThirdCall().resolves({
                ok: true,
                status: 200
            });

            await dbFetch(req, 'http://localhost:5984/db/doc');

            // Verify the request object was updated with new cookie
            expect(req.dbCookie).to.equal('AuthSession=new-session');
            
            // Verify the retry used the new cookie
            const thirdCallOptions = global.fetch.thirdCall.args[1];
            expect(thirdCallOptions.headers.Cookie).to.equal('AuthSession=new-session');
        });

        it('should refresh session and retry after network error', async () => {
            const mockCookieHeader = 'AuthSession=refreshed-after-error; Path=/';
            
            // First call fails with network error
            global.fetch.onFirstCall().rejects(new Error('Network error'));
            
            // Session refresh call succeeds
            global.fetch.onSecondCall().resolves({
                ok: true,
                headers: {
                    get: sinon.stub().returns(mockCookieHeader)
                }
            });
            
            // Retry call succeeds
            global.fetch.onThirdCall().resolves({
                ok: true,
                status: 200,
                json: async () => ({ success: true })
            });

            const response = await dbFetch(req, 'http://localhost:5984/db/doc');

            expect(global.fetch.callCount).to.equal(3);
            expect(response.ok).to.be.true;
            expect(req.dbCookie).to.equal('AuthSession=refreshed-after-error');
        });
    });
});

describe('Database client factory', () => {
    let req, res, next;

    beforeEach(() => {
        clearSessionCache();
        clearReviewSessionCache();

        req = {};
        res = {
            status: sinon.stub().returnsThis(),
            json: sinon.spy()
        };
        next = sinon.spy();
        global.fetch = sinon.stub();
    });

    afterEach(() => {
        sinon.restore();
    });

    it('should return session, fetch, and clearSessionCache functions from createDbClient', () => {
        const client = createDbClient({
            url: 'http://db-a.example.com',
            user: 'db-user',
            pass: 'db-pass',
            cookieProperty: 'otherCookie'
        });

        expect(client.session).to.be.a('function');
        expect(client.fetch).to.be.a('function');
        expect(client.clearSessionCache).to.be.a('function');
    });

    describe('createDbClient session middleware', () => {
        it('should set req.otherCookie from set-cookie, call next, and POST session credentials', async () => {
            const client = createDbClient({
                url: 'http://db-a.example.com',
                user: 'db-user',
                pass: 'db-pass',
                cookieProperty: 'otherCookie'
            });
            const mockCookieHeader = 'AuthSession=custom-session; Path=/';

            global.fetch.resolves({
                ok: true,
                headers: {
                    get: sinon.stub().returns(mockCookieHeader)
                }
            });

            await client.session(req, res, next);

            expect(next.calledOnce).to.be.true;
            expect(req.otherCookie).to.equal('AuthSession=custom-session');
            expect(req.dbCookie).to.be.undefined;

            expect(global.fetch.calledOnce).to.be.true;
            const [url, options] = global.fetch.firstCall.args;
            expect(url).to.equal('http://db-a.example.com/_session');
            expect(options.method).to.equal('POST');
            expect(JSON.parse(options.body)).to.deep.equal({
                name: 'db-user',
                password: 'db-pass'
            });
        });

        it('should respond with 500 and not call next when session POST is not ok', async () => {
            const client = createDbClient({
                url: 'http://db-a.example.com',
                user: 'db-user',
                pass: 'db-pass',
                cookieProperty: 'otherCookie'
            });

            global.fetch.resolves({
                ok: false
            });

            await client.session(req, res, next);

            expect(res.status.calledOnceWith(500)).to.be.true;
            expect(res.json.calledOnceWith({ message: 'Database session error' })).to.be.true;
            expect(next.called).to.be.false;
        });
    });

    describe('createDbClient session cache isolation', () => {
        it('should keep independent caches for clients with different urls', async () => {
            const clientA = createDbClient({
                url: 'http://db-a.example.com',
                user: 'db-user',
                pass: 'db-pass',
                cookieProperty: 'otherCookie'
            });
            const clientB = createDbClient({
                url: 'http://db-b.example.com',
                user: 'db-user',
                pass: 'db-pass',
                cookieProperty: 'otherCookie'
            });

            global.fetch.onFirstCall().resolves({
                ok: true,
                headers: {
                    get: sinon.stub().returns('AuthSession=session-a; Path=/')
                }
            });

            await clientA.session({}, res, next);
            expect(global.fetch.calledOnce).to.be.true;

            next.resetHistory();
            global.fetch.onSecondCall().resolves({
                ok: true,
                headers: {
                    get: sinon.stub().returns('AuthSession=session-b; Path=/')
                }
            });

            await clientB.session({}, res, next);

            expect(next.calledOnce).to.be.true;
            expect(global.fetch.calledTwice).to.be.true;
        });

        it('should clear only the targeted client cache', async () => {
            const clientA = createDbClient({
                url: 'http://db-a.example.com',
                user: 'db-user',
                pass: 'db-pass',
                cookieProperty: 'otherCookie'
            });
            const clientB = createDbClient({
                url: 'http://db-b.example.com',
                user: 'db-user',
                pass: 'db-pass',
                cookieProperty: 'otherCookie'
            });
            const mockResponse = {
                ok: true,
                headers: {
                    get: sinon.stub().returns('AuthSession=cached; Path=/')
                }
            };

            global.fetch.resolves(mockResponse);

            await clientA.session({}, res, next);
            await clientB.session({}, res, next);
            expect(global.fetch.callCount).to.equal(2);

            global.fetch.resetHistory();
            clientA.clearSessionCache();

            await clientB.session({}, res, next);
            expect(global.fetch.called).to.be.false;

            global.fetch.resolves(mockResponse);
            await clientA.session({}, res, next);
            expect(global.fetch.calledOnce).to.be.true;
        });
    });

    describe('createDbClient fetch', () => {
        it('should send cookie and Accept headers, refresh on 401, and retry successfully', async () => {
            const client = createDbClient({
                url: 'http://db-a.example.com',
                user: 'db-user',
                pass: 'db-pass',
                cookieProperty: 'otherCookie'
            });
            req.otherCookie = 'AuthSession=initial-cookie';

            global.fetch.onFirstCall().resolves({
                ok: false,
                status: 401
            });
            global.fetch.onSecondCall().resolves({
                ok: true,
                headers: {
                    get: sinon.stub().returns('AuthSession=refreshed-cookie; Path=/')
                }
            });
            global.fetch.onThirdCall().resolves({
                ok: true,
                status: 200
            });

            const response = await client.fetch(req, 'http://db-a.example.com/doc');

            expect(global.fetch.callCount).to.equal(3);
            expect(response.ok).to.be.true;
            expect(req.otherCookie).to.equal('AuthSession=refreshed-cookie');

            const [, firstFetchOptions] = global.fetch.firstCall.args;
            expect(firstFetchOptions.headers.Cookie).to.equal('AuthSession=initial-cookie');
            expect(firstFetchOptions.headers.Accept).to.equal('application/json');

            const [, retryFetchOptions] = global.fetch.thirdCall.args;
            expect(retryFetchOptions.headers.Cookie).to.equal('AuthSession=refreshed-cookie');
        });

        it('should throw DatabaseSessionError after three consecutive 401 responses', async () => {
            const client = createDbClient({
                url: 'http://db-a.example.com',
                user: 'db-user',
                pass: 'db-pass',
                cookieProperty: 'otherCookie'
            });
            req.otherCookie = 'AuthSession=initial-cookie';

            global.fetch.resolves({
                ok: false,
                status: 401
            });

            try {
                await client.fetch(req, 'http://db-a.example.com/doc');
                expect.fail('Expected DatabaseSessionError to be thrown');
            } catch (error) {
                expect(error).to.be.instanceof(DatabaseSessionError);
                expect(error.message).to.include('could not be established after 3 attempts');
            }
        });
    });

    describe('review database client exports', () => {
        it('should expose review session, fetch, and clearReviewSessionCache helpers', () => {
            expect(reviewDbSession).to.be.a('function');
            expect(reviewDbFetch).to.be.a('function');
            expect(clearReviewSessionCache).to.be.a('function');

            expect(() => clearReviewSessionCache()).to.not.throw();
        });

        it('should set req.reviewDbCookie in reviewDbSession and use it in reviewDbFetch', async () => {
            const mockCookieHeader = 'AuthSession=review-session; Path=/';

            global.fetch.onFirstCall().resolves({
                ok: true,
                headers: {
                    get: sinon.stub().returns(mockCookieHeader)
                }
            });

            await reviewDbSession(req, res, next);

            expect(next.calledOnce).to.be.true;
            expect(req.reviewDbCookie).to.equal('AuthSession=review-session');

            global.fetch.onSecondCall().resolves({
                ok: true,
                status: 200
            });

            await reviewDbFetch(req, 'http://review.example.com/doc');

            const [, fetchOptions] = global.fetch.secondCall.args;
            expect(fetchOptions.headers.Cookie).to.equal('AuthSession=review-session');
            expect(fetchOptions.headers.Accept).to.equal('application/json');
        });
    });

    describe('default database client regression', () => {
        it('should still set req.dbCookie and keep cache independent from the review client', async () => {
            global.fetch.onFirstCall().resolves({
                ok: true,
                headers: {
                    get: sinon.stub().returns('AuthSession=review-session; Path=/')
                }
            });

            await reviewDbSession({}, res, next);
            expect(global.fetch.calledOnce).to.be.true;

            global.fetch.resetHistory();
            global.fetch.onFirstCall().resolves({
                ok: true,
                headers: {
                    get: sinon.stub().returns('AuthSession=main-session; Path=/')
                }
            });

            const mainReq = {};
            await dbSession(mainReq, res, next);

            expect(global.fetch.calledOnce).to.be.true;
            expect(mainReq.dbCookie).to.equal('AuthSession=main-session');
            expect(mainReq.reviewDbCookie).to.be.undefined;
        });
    });

    describe('getReviewDbConfig', () => {
        it('should fall back url, user, and pass to DB_* when REVIEW_DB_* are unset', () => {
            const config = getReviewDbConfig({
                DB_URL: 'http://main.example.com',
                DB_USER: 'main-user',
                DB_PASS: 'main-pass'
            });

            expect(config).to.deep.equal({
                url: 'http://main.example.com',
                name: undefined,
                user: 'main-user',
                pass: 'main-pass'
            });
        });

        it('should use REVIEW_DB_* values and REVIEW_DB_NAME when set', () => {
            const config = getReviewDbConfig({
                DB_URL: 'http://main.example.com',
                DB_USER: 'main-user',
                DB_PASS: 'main-pass',
                REVIEW_DB_URL: 'http://review.example.com',
                REVIEW_DB_USER: 'review-user',
                REVIEW_DB_PASS: 'review-pass',
                REVIEW_DB_NAME: 'review-db'
            });

            expect(config).to.deep.equal({
                url: 'http://review.example.com',
                name: 'review-db',
                user: 'review-user',
                pass: 'review-pass'
            });
        });
    });
});

