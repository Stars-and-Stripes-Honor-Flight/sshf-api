import { expect } from 'chai';
import sinon from 'sinon';
import { createAuthenticator } from '../utils/authenticate.js';
import { DirectoryGroupsUnavailableError } from '../utils/groups.js';

describe('Authenticate middleware', () => {
    const OUR_CLIENT_ID = '111111111111-ourapp.apps.googleusercontent.com';
    const userData = {
        sub: 'user-123',
        email: 'user@starsandstripeshonorflight.org',
        given_name: 'Test',
        family_name: 'User',
        picture: 'https://example.com/avatar.jpg'
    };

    let req, res, next, cache, getTokenInfo, getUserInfo, getGroupMemberships;
    const originalClientId = process.env.GOOGLE_CLIENT_ID;
    const originalAllowedClientIds = process.env.ALLOWED_CLIENT_IDS;
    const originalAllowedDomains = process.env.ALLOWED_EMAIL_DOMAINS;

    beforeEach(() => {
        process.env.GOOGLE_CLIENT_ID = OUR_CLIENT_ID;
        delete process.env.ALLOWED_CLIENT_IDS;
        delete process.env.ALLOWED_EMAIL_DOMAINS;

        req = { headers: {} };
        res = {
            status: sinon.stub().returnsThis(),
            json: sinon.spy()
        };
        next = sinon.spy();
        cache = {
            get: sinon.stub().returns(undefined),
            set: sinon.spy()
        };
        getTokenInfo = sinon.stub().resolves({
            aud: OUR_CLIENT_ID,
            email: userData.email,
            email_verified: true
        });
        getUserInfo = sinon.stub().resolves(userData);
        getGroupMemberships = sinon.stub().resolves([]);
    });

    afterEach(() => {
        if (originalClientId === undefined) {
            delete process.env.GOOGLE_CLIENT_ID;
        } else {
            process.env.GOOGLE_CLIENT_ID = originalClientId;
        }
        if (originalAllowedClientIds === undefined) {
            delete process.env.ALLOWED_CLIENT_IDS;
        } else {
            process.env.ALLOWED_CLIENT_IDS = originalAllowedClientIds;
        }
        if (originalAllowedDomains === undefined) {
            delete process.env.ALLOWED_EMAIL_DOMAINS;
        } else {
            process.env.ALLOWED_EMAIL_DOMAINS = originalAllowedDomains;
        }
        sinon.restore();
    });

    describe('missing or invalid authorization header', () => {
        it('should return 401 when authorization header is missing', async () => {
            const authenticate = createAuthenticator({
                getTokenInfo,
                getUserInfo,
                getGroupMemberships,
                cache
            });

            await authenticate(req, res, next);

            expect(res.status.calledWith(401)).to.be.true;
            expect(res.json.calledWith({ message: 'Unauthorized: No Bearer token provided' })).to.be.true;
            expect(next.called).to.be.false;
        });

        it('should return 401 when authorization header does not start with Bearer', async () => {
            req.headers.authorization = 'Basic dXNlcjpwYXNz';
            const authenticate = createAuthenticator({
                getTokenInfo,
                getUserInfo,
                getGroupMemberships,
                cache
            });

            await authenticate(req, res, next);

            expect(res.status.calledWith(401)).to.be.true;
            expect(res.json.calledWith({ message: 'Unauthorized: No Bearer token provided' })).to.be.true;
            expect(next.called).to.be.false;
        });
    });

    describe('getUserInfo failure', () => {
        it('should throw when getUserInfo returns null', async () => {
            sinon.stub(console, 'error');
            req.headers.authorization = 'Bearer valid-token';
            getUserInfo.resolves(null);

            const authenticate = createAuthenticator({
                getTokenInfo,
                getUserInfo,
                getGroupMemberships,
                cache
            });

            await authenticate(req, res, next);

            expect(res.status.calledWith(401)).to.be.true;
            expect(res.json.calledWith({ message: 'Unauthorized: Invalid token' })).to.be.true;
            expect(next.called).to.be.false;
        });

        it('should throw when getUserInfo returns undefined', async () => {
            sinon.stub(console, 'error');
            req.headers.authorization = 'Bearer valid-token';
            getUserInfo.resolves(undefined);

            const authenticate = createAuthenticator({
                getTokenInfo,
                getUserInfo,
                getGroupMemberships,
                cache
            });

            await authenticate(req, res, next);

            expect(res.status.calledWith(401)).to.be.true;
            expect(res.json.calledWith({ message: 'Unauthorized: Invalid token' })).to.be.true;
            expect(next.called).to.be.false;
        });
    });

    describe('DirectoryGroupsUnavailableError handling', () => {
        it('should return 503 when getGroupMemberships throws DirectoryGroupsUnavailableError', async () => {
            sinon.stub(console, 'error');
            req.headers.authorization = 'Bearer valid-token';
            const directoryError = new DirectoryGroupsUnavailableError('Directory service down');
            getGroupMemberships.rejects(directoryError);

            const authenticate = createAuthenticator({
                getTokenInfo,
                getUserInfo,
                getGroupMemberships,
                cache
            });

            await authenticate(req, res, next);

            expect(res.status.calledWith(503)).to.be.true;
            expect(res.json.calledWith({ message: 'Authentication service unavailable' })).to.be.true;
            expect(next.called).to.be.false;
            expect(cache.set.called).to.be.false;
        });
    });

    describe('other getGroupMemberships errors', () => {
        it('should rethrow non-DirectoryGroupsUnavailableError from getGroupMemberships', async () => {
            sinon.stub(console, 'error');
            req.headers.authorization = 'Bearer valid-token';
            const unexpectedError = new Error('Unexpected database error');
            getGroupMemberships.rejects(unexpectedError);

            const authenticate = createAuthenticator({
                getTokenInfo,
                getUserInfo,
                getGroupMemberships,
                cache
            });

            await authenticate(req, res, next);

            expect(res.status.calledWith(401)).to.be.true;
            expect(res.json.calledWith({ message: 'Unauthorized: Invalid token' })).to.be.true;
            expect(next.called).to.be.false;
        });

        it('should handle TypeError from getGroupMemberships', async () => {
            sinon.stub(console, 'error');
            req.headers.authorization = 'Bearer valid-token';
            getGroupMemberships.rejects(new TypeError('Cannot read property of undefined'));

            const authenticate = createAuthenticator({
                getTokenInfo,
                getUserInfo,
                getGroupMemberships,
                cache
            });

            await authenticate(req, res, next);

            expect(res.status.calledWith(401)).to.be.true;
            expect(next.called).to.be.false;
        });
    });

    describe('token introspection errors', () => {
        it('should return 401 for 4xx status errors from getTokenInfo', async () => {
            sinon.stub(console, 'error');
            req.headers.authorization = 'Bearer invalid-token';
            const error = new Error('Invalid token');
            error.status = 401;
            getTokenInfo.rejects(error);

            const authenticate = createAuthenticator({
                getTokenInfo,
                getUserInfo,
                getGroupMemberships,
                cache
            });

            await authenticate(req, res, next);

            expect(res.status.calledWith(401)).to.be.true;
            expect(res.json.calledWith({ message: 'Unauthorized: Invalid token' })).to.be.true;
            expect(next.called).to.be.false;
        });

        it('should return 401 for errors with response.status in 4xx range', async () => {
            sinon.stub(console, 'error');
            req.headers.authorization = 'Bearer expired-token';
            const error = new Error('Token expired');
            error.response = { status: 403 };
            getTokenInfo.rejects(error);

            const authenticate = createAuthenticator({
                getTokenInfo,
                getUserInfo,
                getGroupMemberships,
                cache
            });

            await authenticate(req, res, next);

            expect(res.status.calledWith(401)).to.be.true;
            expect(res.json.calledWith({ message: 'Unauthorized: Invalid token' })).to.be.true;
            expect(next.called).to.be.false;
        });
    });

    describe('token validation errors', () => {
        it('should return 401 for TokenAudienceError', async () => {
            sinon.stub(console, 'error');
            req.headers.authorization = 'Bearer wrong-audience-token';
            getTokenInfo.resolves({
                aud: 'different-client-id',
                email: userData.email,
                email_verified: true
            });

            const authenticate = createAuthenticator({
                getTokenInfo,
                getUserInfo,
                getGroupMemberships,
                cache
            });

            await authenticate(req, res, next);

            expect(res.status.calledWith(401)).to.be.true;
            expect(res.json.calledWith({ message: 'Unauthorized: Token not issued for this application' })).to.be.true;
            expect(next.called).to.be.false;
        });

        it('should return 403 for domain validation errors', async () => {
            sinon.stub(console, 'error');
            process.env.ALLOWED_EMAIL_DOMAINS = 'example.com';
            req.headers.authorization = 'Bearer wrong-domain-token';
            getTokenInfo.resolves({
                aud: OUR_CLIENT_ID,
                email: 'user@wrongdomain.com',
                email_verified: true
            });

            const authenticate = createAuthenticator({
                getTokenInfo,
                getUserInfo,
                getGroupMemberships,
                cache
            });

            await authenticate(req, res, next);

            expect(res.status.calledWith(403)).to.be.true;
            expect(res.json.calledWith({ message: 'Forbidden: Account not permitted' })).to.be.true;
            expect(next.called).to.be.false;
        });

        it('should return 403 for unverified email', async () => {
            sinon.stub(console, 'error');
            process.env.ALLOWED_EMAIL_DOMAINS = 'starsandstripeshonorflight.org';
            req.headers.authorization = 'Bearer unverified-token';
            getTokenInfo.resolves({
                aud: OUR_CLIENT_ID,
                email: userData.email,
                email_verified: false
            });

            const authenticate = createAuthenticator({
                getTokenInfo,
                getUserInfo,
                getGroupMemberships,
                cache
            });

            await authenticate(req, res, next);

            expect(res.status.calledWith(403)).to.be.true;
            expect(res.json.calledWith({ message: 'Forbidden: Account not permitted' })).to.be.true;
            expect(next.called).to.be.false;
        });
    });

    describe('generic error handling', () => {
        it('should catch and return 503 for unexpected 5xx errors during authentication', async () => {
            sinon.stub(console, 'error');
            req.headers.authorization = 'Bearer valid-token';
            getTokenInfo.rejects(new Error('Network error'));

            const authenticate = createAuthenticator({
                getTokenInfo,
                getUserInfo,
                getGroupMemberships,
                cache
            });

            await authenticate(req, res, next);

            expect(console.error.called).to.be.true;
            expect(res.status.calledWith(503)).to.be.true;
            expect(res.json.calledWith({ message: 'Authentication service unavailable' })).to.be.true;
            expect(next.called).to.be.false;
        });
    });

    describe('successful authentication paths', () => {
        it('should authenticate successfully and cache user', async () => {
            req.headers.authorization = 'Bearer valid-token';
            getGroupMemberships.resolves([
                { id: '1', name: 'Developers', email: 'dev@example.com' }
            ]);

            const authenticate = createAuthenticator({
                getTokenInfo,
                getUserInfo,
                getGroupMemberships,
                cache
            });

            await authenticate(req, res, next);

            expect(next.calledOnce).to.be.true;
            expect(res.status.called).to.be.false;
            expect(cache.set.calledOnce).to.be.true;
            expect(req.user).to.deep.include({
                id: userData.sub,
                email: userData.email,
                firstName: userData.given_name,
                lastName: userData.family_name,
                avatar: userData.picture
            });
            expect(req.user.roles).to.have.lengthOf(1);
            expect(req.user.roles[0]).to.deep.equal({
                id: '1',
                name: 'Developers',
                email: 'dev@example.com'
            });
        });

        it('should use cached user when token is in cache', async () => {
            req.headers.authorization = 'Bearer cached-token';
            const cachedUser = {
                id: 'cached-123',
                email: 'cached@example.com',
                roles: []
            };
            cache.get.returns(cachedUser);

            const authenticate = createAuthenticator({
                getTokenInfo,
                getUserInfo,
                getGroupMemberships,
                cache
            });

            await authenticate(req, res, next);

            expect(next.calledOnce).to.be.true;
            expect(req.user).to.equal(cachedUser);
            expect(getTokenInfo.called).to.be.false;
            expect(getUserInfo.called).to.be.false;
            expect(getGroupMemberships.called).to.be.false;
        });
    });
});
