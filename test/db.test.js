import { expect } from 'chai';
import sinon from 'sinon';
import { dbFetch, dbSession, DatabaseSessionError, clearSessionCache } from '../utils/db.js';

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

