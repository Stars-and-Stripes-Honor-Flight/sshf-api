import { expect } from 'chai';
import sinon from 'sinon';
import { app, validateGroupAuthorization, getUserInfo, resolveRequestGroupMemberships } from '../index.js';
import { google } from 'googleapis';

describe('Express application', () => {
    it('should export Express app', () => {
        expect(app).to.be.a('function');
        expect(app.listen).to.be.a('function');
    });

    it('should have routes registered', () => {
        const routes = [];
        app._router.stack.forEach((middleware) => {
            if (middleware.route) {
                routes.push({
                    path: middleware.route.path,
                    methods: Object.keys(middleware.route.methods)
                });
            }
        });

        expect(routes.length).to.be.greaterThan(0);
        
        const paths = routes.map(r => r.path);
        expect(paths).to.include('/user/hasgroup');
        expect(paths).to.include('/search');
        expect(paths).to.include('/query');
        expect(paths).to.include('/docs');
        expect(paths).to.include('/docs/:id');
        expect(paths).to.include('/veterans');
        expect(paths).to.include('/guardians');
        expect(paths).to.include('/flights');
        expect(paths).to.include('/openapi.json');
    });

    it('should serve OpenAPI JSON spec at /openapi.json', (done) => {
        const req = { headers: {} };
        const res = {
            setHeader: sinon.spy(),
            send: sinon.spy((data) => {
                expect(res.setHeader.calledWith('Content-Type', 'application/json')).to.be.true;
                expect(data).to.be.an('object');
                expect(data.openapi).to.exist;
                done();
            })
        };

        app._router.stack.forEach((middleware) => {
            if (middleware.route && middleware.route.path === '/openapi.json') {
                middleware.route.stack[0].handle(req, res);
            }
        });
    });

    describe('getUserInfo', () => {
        afterEach(() => {
            sinon.restore();
        });

        it('should fetch user info successfully', async () => {
            const mockUserData = {
                sub: 'user-123',
                email: 'test@example.com',
                given_name: 'Test',
                family_name: 'User',
                picture: 'https://example.com/avatar.jpg'
            };

            sinon.stub(google.auth, 'OAuth2').returns({
                setCredentials: sinon.stub()
            });
            sinon.stub(google, 'oauth2').returns({
                userinfo: {
                    get: sinon.stub().resolves({ data: mockUserData })
                }
            });

            const result = await getUserInfo('test-token');

            expect(result).to.deep.equal(mockUserData);
        });

        it('should throw when userResponse.data is undefined', async () => {
            sinon.stub(google.auth, 'OAuth2').returns({
                setCredentials: sinon.stub()
            });
            sinon.stub(google, 'oauth2').returns({
                userinfo: {
                    get: sinon.stub().resolves({})
                }
            });

            try {
                await getUserInfo('test-token');
                expect.fail('Should have thrown');
            } catch (error) {
                expect(error.message).to.equal('Failed to fetch user info');
            }
        });
    });

    describe('validateGroupAuthorization', () => {
        const originalEnv = { ...process.env };
        let processExitStub;
        let consoleErrorStub;

        beforeEach(() => {
            processExitStub = sinon.stub(process, 'exit');
            consoleErrorStub = sinon.stub(console, 'error');
        });

        afterEach(() => {
            processExitStub.restore();
            consoleErrorStub.restore();
            process.env = { ...originalEnv };
        });

        it('should not exit when group authorization is properly configured', () => {
            process.env.K_SERVICE = 'test-service';
            process.env.ALLOWED_GROUP_EMAILS = 'group@example.com';

            validateGroupAuthorization();

            expect(processExitStub.called).to.be.false;
            expect(consoleErrorStub.called).to.be.false;
        });

        it('should not exit for local development without K_SERVICE', () => {
            delete process.env.K_SERVICE;
            delete process.env.ALLOWED_GROUP_EMAILS;

            validateGroupAuthorization();

            expect(processExitStub.called).to.be.false;
        });

        it('should exit when Cloud Run is detected but no groups are configured', () => {
            process.env.K_SERVICE = 'test-service';
            delete process.env.ALLOWED_GROUP_EMAILS;

            validateGroupAuthorization();

            expect(consoleErrorStub.called).to.be.true;
            expect(processExitStub.calledOnceWith(1)).to.be.true;
        });
    });

    describe('resolveRequestGroupMemberships', () => {
        const originalEnv = { ...process.env };

        afterEach(() => {
            sinon.restore();
            process.env = { ...originalEnv };
        });

        it('checks ALLOWED_GROUP_EMAILS with members.hasMember for nested membership', async () => {
            process.env.ALLOWED_GROUP_EMAILS = 'sshf_app_dev_full_access@starsandstripeshonorflight.org';
            delete process.env.K_SERVICE;
            delete process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
            delete process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

            const list = sinon.stub().resolves({
                data: { groups: [{ id: 'n1', name: 'Nested', email: 'nested@starsandstripeshonorflight.org' }] }
            });
            const hasMember = sinon.stub().resolves({ data: { isMember: true } });
            sinon.stub(console, 'log');
            sinon.stub(console, 'error');
            sinon.stub(console, 'warn');
            sinon.stub(google, 'admin').returns({
                groups: { list },
                members: { hasMember }
            });
            sinon.stub(google.auth, 'GoogleAuth').callsFake(function FakeGoogleAuth() {
                return { scopes: [] };
            });

            const result = await resolveRequestGroupMemberships({
                email: 'index-nested@starsandstripeshonorflight.org'
            });

            expect(hasMember.calledOnce).to.be.true;
            expect(hasMember.firstCall.args[0]).to.deep.equal({
                groupKey: 'sshf_app_dev_full_access@starsandstripeshonorflight.org',
                memberKey: 'index-nested@starsandstripeshonorflight.org'
            });
            expect(result.groups).to.deep.equal([
                { id: 'n1', name: 'Nested', email: 'nested@starsandstripeshonorflight.org' },
                {
                    email: 'sshf_app_dev_full_access@starsandstripeshonorflight.org',
                    membership: 'nested'
                }
            ]);
            expect(result.userCacheTtlMs).to.equal(15 * 60 * 1000);
        });
    });
});
