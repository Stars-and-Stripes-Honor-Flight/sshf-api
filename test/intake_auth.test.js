import { expect } from 'chai';
import sinon from 'sinon';
import {
    createIntakeAuthenticator,
    getIntakeAllowedServiceAccounts,
    getIntakeAudience
} from '../utils/intake_auth.js';

describe('Intake authentication', () => {
    let req, res, next, verifyIdToken;

    beforeEach(() => {
        req = {
            headers: {
                authorization: 'Bearer tok123'
            }
        };
        res = {
            status: sinon.stub().returnsThis(),
            json: sinon.spy()
        };
        next = sinon.spy();
        verifyIdToken = sinon.stub();
    });

    afterEach(() => {
        sinon.restore();
    });

    describe('getIntakeAllowedServiceAccounts', () => {
        it('should return an empty array when unset', () => {
            expect(getIntakeAllowedServiceAccounts({})).to.deep.equal([]);
        });

        it('should parse, trim, lowercase, and drop empty entries', () => {
            const env = {
                REVIEW_INTAKE_SERVICE_ACCOUNTS: ' A@x.iam.gserviceaccount.com , b@y.com ,'
            };

            expect(getIntakeAllowedServiceAccounts(env)).to.deep.equal([
                'a@x.iam.gserviceaccount.com',
                'b@y.com'
            ]);
        });
    });

    describe('getIntakeAudience', () => {
        it('should prefer REVIEW_INTAKE_AUDIENCE over API_URL', () => {
            const env = {
                REVIEW_INTAKE_AUDIENCE: 'https://review.example.com',
                API_URL: 'https://api.example.com'
            };

            expect(getIntakeAudience(env)).to.equal('https://review.example.com');
        });

        it('should fall back to API_URL when REVIEW_INTAKE_AUDIENCE is unset', () => {
            const env = {
                API_URL: 'https://api.example.com'
            };

            expect(getIntakeAudience(env)).to.equal('https://api.example.com');
        });

        it('should return an empty string when neither value is set', () => {
            expect(getIntakeAudience({})).to.equal('');
        });
    });

    describe('createIntakeAuthenticator middleware', () => {
        function createMiddleware(env) {
            return createIntakeAuthenticator({ verifyIdToken, env });
        }

        it('should return 401 when Authorization header is missing', async () => {
            delete req.headers.authorization;
            const middleware = createMiddleware({
                REVIEW_INTAKE_SERVICE_ACCOUNTS: 'allowed@x.com',
                REVIEW_INTAKE_AUDIENCE: 'https://api.example.com'
            });

            await middleware(req, res, next);

            expect(res.status.calledOnceWith(401)).to.be.true;
            expect(res.json.calledOnceWith({ message: 'Unauthorized: No Bearer token provided' })).to.be.true;
            expect(next.called).to.be.false;
            expect(verifyIdToken.called).to.be.false;
        });

        it('should return 401 when Authorization header is not Bearer', async () => {
            req.headers.authorization = 'Basic abc';
            const middleware = createMiddleware({
                REVIEW_INTAKE_SERVICE_ACCOUNTS: 'allowed@x.com',
                REVIEW_INTAKE_AUDIENCE: 'https://api.example.com'
            });

            await middleware(req, res, next);

            expect(res.status.calledOnceWith(401)).to.be.true;
            expect(res.json.calledOnceWith({ message: 'Unauthorized: No Bearer token provided' })).to.be.true;
            expect(next.called).to.be.false;
            expect(verifyIdToken.called).to.be.false;
        });

        it('should return 401 when the allow-list is empty', async () => {
            const middleware = createMiddleware({
                REVIEW_INTAKE_AUDIENCE: 'https://api.example.com'
            });

            await middleware(req, res, next);

            expect(res.status.calledOnceWith(401)).to.be.true;
            expect(res.json.calledOnceWith({ message: 'Unauthorized: Intake authentication is not configured' })).to.be.true;
            expect(next.called).to.be.false;
            expect(verifyIdToken.called).to.be.false;
        });

        it('should return 401 when the audience is empty', async () => {
            const middleware = createMiddleware({
                REVIEW_INTAKE_SERVICE_ACCOUNTS: 'allowed@x.com'
            });

            await middleware(req, res, next);

            expect(res.status.calledOnceWith(401)).to.be.true;
            expect(res.json.calledOnceWith({ message: 'Unauthorized: Intake authentication is not configured' })).to.be.true;
            expect(next.called).to.be.false;
            expect(verifyIdToken.called).to.be.false;
        });

        it('should return 401 when verifyIdToken rejects with an invalid token', async () => {
            verifyIdToken.rejects(new Error('Invalid token signature'));
            const middleware = createMiddleware({
                REVIEW_INTAKE_SERVICE_ACCOUNTS: 'allowed@x.com',
                REVIEW_INTAKE_AUDIENCE: 'https://api.example.com'
            });

            await middleware(req, res, next);

            expect(res.status.calledOnceWith(401)).to.be.true;
            expect(res.json.calledOnceWith({ message: 'Unauthorized: Invalid token' })).to.be.true;
            expect(next.called).to.be.false;
        });

        it('should return 503 when verifyIdToken rejects with a network error code', async () => {
            const error = new Error('Lookup failed');
            error.code = 'ENOTFOUND';
            verifyIdToken.rejects(error);
            const middleware = createMiddleware({
                REVIEW_INTAKE_SERVICE_ACCOUNTS: 'allowed@x.com',
                REVIEW_INTAKE_AUDIENCE: 'https://api.example.com'
            });

            await middleware(req, res, next);

            expect(res.status.calledOnceWith(503)).to.be.true;
            expect(res.json.calledOnceWith({ message: 'Authentication service unavailable' })).to.be.true;
            expect(next.called).to.be.false;
        });

        it('should return 503 when verifyIdToken rejects with a 5xx status', async () => {
            const error = new Error('Upstream failure');
            error.status = 502;
            verifyIdToken.rejects(error);
            const middleware = createMiddleware({
                REVIEW_INTAKE_SERVICE_ACCOUNTS: 'allowed@x.com',
                REVIEW_INTAKE_AUDIENCE: 'https://api.example.com'
            });

            await middleware(req, res, next);

            expect(res.status.calledOnceWith(503)).to.be.true;
            expect(res.json.calledOnceWith({ message: 'Authentication service unavailable' })).to.be.true;
            expect(next.called).to.be.false;
        });

        it('should return 403 when payload email is not in the allow-list', async () => {
            verifyIdToken.resolves({
                email: 'other@x.com',
                email_verified: true,
                sub: 'sub123'
            });
            const middleware = createMiddleware({
                REVIEW_INTAKE_SERVICE_ACCOUNTS: 'allowed@x.com',
                REVIEW_INTAKE_AUDIENCE: 'https://api.example.com'
            });

            await middleware(req, res, next);

            expect(res.status.calledOnceWith(403)).to.be.true;
            expect(res.json.calledOnceWith({ message: 'Forbidden: Account not permitted' })).to.be.true;
            expect(next.called).to.be.false;
        });

        it('should return 403 when payload email is allowed but not verified', async () => {
            verifyIdToken.resolves({
                email: 'allowed@x.com',
                email_verified: false,
                sub: 'sub123'
            });
            const middleware = createMiddleware({
                REVIEW_INTAKE_SERVICE_ACCOUNTS: 'allowed@x.com',
                REVIEW_INTAKE_AUDIENCE: 'https://api.example.com'
            });

            await middleware(req, res, next);

            expect(res.status.calledOnceWith(403)).to.be.true;
            expect(res.json.calledOnceWith({ message: 'Forbidden: Account not permitted' })).to.be.true;
            expect(next.called).to.be.false;
        });

        it('should return 403 when payload is missing email', async () => {
            verifyIdToken.resolves({
                email_verified: true,
                sub: 'sub123'
            });
            const middleware = createMiddleware({
                REVIEW_INTAKE_SERVICE_ACCOUNTS: 'allowed@x.com',
                REVIEW_INTAKE_AUDIENCE: 'https://api.example.com'
            });

            await middleware(req, res, next);

            expect(res.status.calledOnceWith(403)).to.be.true;
            expect(res.json.calledOnceWith({ message: 'Forbidden: Account not permitted' })).to.be.true;
            expect(next.called).to.be.false;
        });

        it('should call next and set req.intake on success', async () => {
            verifyIdToken.resolves({
                email: 'ALLOWED@x.com',
                email_verified: true,
                sub: 'sub123'
            });
            const middleware = createMiddleware({
                REVIEW_INTAKE_SERVICE_ACCOUNTS: 'allowed@x.com',
                REVIEW_INTAKE_AUDIENCE: 'https://api.example.com'
            });

            await middleware(req, res, next);

            expect(next.calledOnce).to.be.true;
            expect(req.intake).to.deep.equal({
                email: 'ALLOWED@x.com',
                subject: 'sub123'
            });
            expect(verifyIdToken.calledOnceWith('tok123', 'https://api.example.com')).to.be.true;
            expect(res.status.called).to.be.false;
            expect(res.json.called).to.be.false;
        });

        it('should treat email_verified string "true" as verified', async () => {
            verifyIdToken.resolves({
                email: 'allowed@x.com',
                email_verified: 'true',
                sub: 'sub123'
            });
            const middleware = createMiddleware({
                REVIEW_INTAKE_SERVICE_ACCOUNTS: 'allowed@x.com',
                REVIEW_INTAKE_AUDIENCE: 'https://api.example.com'
            });

            await middleware(req, res, next);

            expect(next.calledOnce).to.be.true;
            expect(req.intake).to.deep.equal({
                email: 'allowed@x.com',
                subject: 'sub123'
            });
            expect(verifyIdToken.calledOnceWith('tok123', 'https://api.example.com')).to.be.true;
        });
    });
});
