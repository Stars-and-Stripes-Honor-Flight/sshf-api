import { expect } from 'chai';
import sinon from 'sinon';
import { createAuthenticator } from '../utils/authenticate.js';
import { assertGroupAuthorizationConfigured, requirePermission } from '../utils/auth.js';
import {
    cloudRunAuthorizationProblems,
    describeDevOverride,
    devOverrideRoles,
    permissionsForRoles,
    startupWarnings
} from '../utils/permissions.js';
import { USER_CACHE_TTL_MS } from '../utils/user_cache.js';
import { validateGroupAuthorization } from '../index.js';
import { getUserPermissions } from '../routes/user.js';

const CLIENT_ID = '111111111111-ourapp.apps.googleusercontent.com';
const READ_GROUP = 'sshf_app_dev_read_access@starsandstripeshonorflight.org';

function restoreEnv(original) {
    for (const key of Object.keys(process.env)) {
        if (!(key in original)) {
            delete process.env[key];
        }
    }
    for (const [key, value] of Object.entries(original)) {
        process.env[key] = value;
    }
}

function clearRoleEnv() {
    delete process.env.K_SERVICE;
    delete process.env.ALLOWED_GROUP_EMAILS;
    delete process.env.AUTHZ_DEV_OVERRIDE_ROLES;
    for (const key of Object.keys(process.env)) {
        if (key.startsWith('AUTHZ_ROLE_')) {
            delete process.env[key];
        }
    }
}

function createRes() {
    return {
        statusCode: null,
        body: null,
        headers: {},
        setHeader(name, value) {
            this.headers[name.toLowerCase()] = value;
            return this;
        },
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        }
    };
}

function authenticator({ getGroupMemberships, cache }) {
    return createAuthenticator({
        getTokenInfo: async () => ({
            aud: CLIENT_ID,
            email: 'dev@starsandstripeshonorflight.org',
            email_verified: true
        }),
        getUserInfo: async () => ({
            sub: 'dev-user',
            email: 'dev@starsandstripeshonorflight.org',
            given_name: 'Dev',
            family_name: 'User',
            picture: 'https://example.com/avatar.jpg'
        }),
        getGroupMemberships,
        cache
    });
}

describe('local AUTHZ_DEV_OVERRIDE_ROLES', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        clearRoleEnv();
        process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
        delete process.env.ALLOWED_CLIENT_IDS;
        delete process.env.ALLOWED_EMAIL_DOMAINS;
    });

    afterEach(() => {
        sinon.restore();
        restoreEnv(originalEnv);
    });

    describe('startup', () => {
        it('fails Cloud Run startup when the override is set', () => {
            const env = {
                K_SERVICE: 'sshf-api',
                AUTHZ_ROLE_FULL_GROUPS: 'sshf_app_prd_full_access@starsandstripeshonorflight.org',
                AUTHZ_DEV_OVERRIDE_ROLES: 'FULL,REVIEW'
            };
            const problems = cloudRunAuthorizationProblems(env);
            expect(problems.join('\n')).to.match(/AUTHZ_DEV_OVERRIDE_ROLES/);
            expect(problems.join('\n')).to.match(/Cloud Run/);
            expect(() => assertGroupAuthorizationConfigured(env)).to.throw(/AUTHZ_DEV_OVERRIDE_ROLES/);
            expect(devOverrideRoles(env)).to.equal(null);
        });

        it('exits validateGroupAuthorization on Cloud Run before Directory checks', async () => {
            process.env.K_SERVICE = 'sshf-api';
            process.env.AUTHZ_ROLE_FULL_GROUPS = 'sshf_app_prd_full_access@starsandstripeshonorflight.org';
            process.env.AUTHZ_DEV_OVERRIDE_ROLES = 'WRITE';
            const exit = sinon.stub(process, 'exit');
            sinon.stub(console, 'error');
            sinon.stub(console, 'warn');
            const getGroup = sinon.stub().resolves({});

            await validateGroupAuthorization({ getGroup, sleep: async () => {} });

            expect(exit.calledOnceWith(1)).to.be.true;
            expect(getGroup.called).to.be.false;
            expect(console.error.firstCall.args.join(' ')).to.match(/AUTHZ_DEV_OVERRIDE_ROLES/);
        });

        it('does not exit locally when the override is set and no groups are configured', async () => {
            process.env.AUTHZ_DEV_OVERRIDE_ROLES = 'FULL,REVIEW';
            const exit = sinon.stub(process, 'exit');
            sinon.stub(console, 'error');
            sinon.stub(console, 'warn');
            const getGroup = sinon.stub().resolves({});

            await validateGroupAuthorization({ getGroup });

            expect(exit.called).to.be.false;
            expect(getGroup.called).to.be.false;
            expect(startupWarnings().join('\n')).to.match(/AUTHZ_DEV_OVERRIDE_ROLES/);
            expect(startupWarnings().join('\n')).to.match(/local/i);
        });
    });

    describe('local projection', () => {
        it('parses catalog role ids and does not invent inherited roles', () => {
            const described = describeDevOverride({
                AUTHZ_DEV_OVERRIDE_ROLES: ' review, FULL ,full, NOT_A_ROLE '
            });
            expect(described.configured).to.equal(true);
            expect(described.roles).to.deep.equal(['FULL', 'REVIEW']);
            expect(described.unknown).to.deep.equal(['NOT_A_ROLE']);
            expect(devOverrideRoles({
                AUTHZ_DEV_OVERRIDE_ROLES: ' review, FULL ,full '
            })).to.deep.equal(['FULL', 'REVIEW']);
        });

        it('skips Directory and projects permissions onto the user and GET /user/permissions', async () => {
            process.env.AUTHZ_DEV_OVERRIDE_ROLES = 'FULL,REVIEW';
            const getGroupMemberships = sinon.stub().resolves({ groups: [], userCacheTtlMs: 120000 });
            const cache = { get: sinon.stub().returns(undefined), set: sinon.spy() };
            const authenticate = authenticator({ getGroupMemberships, cache });
            const req = { headers: { authorization: 'Bearer local-token' } };
            const res = { status: sinon.stub().returnsThis(), json: sinon.spy() };
            const next = sinon.spy();

            await authenticate(req, res, next);

            expect(next.calledOnce).to.be.true;
            expect(getGroupMemberships.called).to.be.false;
            expect(req.user.authorizationRoles).to.deep.equal(['FULL', 'REVIEW']);
            expect(req.user.permissions).to.deep.equal(permissionsForRoles(['FULL', 'REVIEW']));
            expect(req.user.permissions).to.include('records:read');
            expect(req.user.permissions).to.include('records:write');
            expect(req.user.permissions).to.include('records:delete');
            expect(req.user.permissions).to.include('applications:review');
            expect(req.user.permissions).to.not.include('medical:read');
            expect(Date.parse(req.user.expiresAt) - Date.parse(req.user.evaluatedAt))
                .to.equal(USER_CACHE_TTL_MS);

            const permissionsRes = createRes();
            getUserPermissions(req, permissionsRes);
            expect(permissionsRes.statusCode).to.equal(200);
            expect(permissionsRes.headers['cache-control']).to.equal('no-store');
            expect(permissionsRes.body.hasAccess).to.equal(true);
            expect(permissionsRes.body.roles).to.deep.equal(['FULL', 'REVIEW']);
            expect(permissionsRes.body.permissions).to.deep.equal(req.user.permissions);
            expect(permissionsRes.body.evaluatedAt).to.equal(req.user.evaluatedAt);
            expect(permissionsRes.body.expiresAt).to.equal(req.user.expiresAt);
        });

        it('enforces requirePermission against the override when no role groups are configured', () => {
            process.env.AUTHZ_DEV_OVERRIDE_ROLES = 'WRITE';
            const user = {
                authorizationRoles: ['WRITE'],
                permissions: permissionsForRoles(['WRITE'])
            };

            let allowed = false;
            requirePermission('records:write')({ user }, createRes(), () => {
                allowed = true;
            });
            expect(allowed).to.equal(true);

            const denied = createRes();
            let deniedNext = false;
            requirePermission('records:delete')({ user }, denied, () => {
                deniedNext = true;
            });
            expect(deniedNext).to.equal(false);
            expect(denied.statusCode).to.equal(403);
            expect(denied.body).to.deep.equal({
                message: 'Forbidden: requires permission records:delete',
                requiredPermission: 'records:delete'
            });

            const review = createRes();
            requirePermission('applications:review')({ user }, review, () => {});
            expect(review.body.requiredPermission).to.equal('applications:review');
        });

        it('keeps the local open gate only when neither groups nor the override are set', () => {
            const res = createRes();
            let nextCalled = false;
            requirePermission('records:delete')(
                { user: { permissions: [] } },
                res,
                () => { nextCalled = true; }
            );
            expect(nextCalled).to.equal(true);
            expect(res.statusCode).to.equal(null);
        });

        it('still resolves Directory membership locally when the override is unset', async () => {
            process.env.AUTHZ_ROLE_READ_GROUPS = READ_GROUP;
            const groups = [{ email: READ_GROUP, membership: 'direct' }];
            const getGroupMemberships = sinon.stub().resolves({ groups, userCacheTtlMs: 120000 });
            const cache = { get: sinon.stub().returns(undefined), set: sinon.spy() };
            const authenticate = authenticator({ getGroupMemberships, cache });
            const req = { headers: { authorization: 'Bearer local-token' } };
            const res = { status: sinon.stub().returnsThis(), json: sinon.spy() };
            const next = sinon.spy();

            await authenticate(req, res, next);

            expect(getGroupMemberships.calledOnce).to.be.true;
            expect(req.user.authorizationRoles).to.deep.equal(['READ']);
            expect(req.user.permissions).to.deep.equal(permissionsForRoles(['READ']));
            expect(Date.parse(req.user.expiresAt) - Date.parse(req.user.evaluatedAt)).to.equal(120000);
        });
    });

    describe('Cloud Run never honors the override', () => {
        it('uses Directory membership even if AUTHZ_DEV_OVERRIDE_ROLES is present', async () => {
            process.env.K_SERVICE = 'sshf-api';
            process.env.AUTHZ_ROLE_READ_GROUPS = READ_GROUP;
            process.env.AUTHZ_DEV_OVERRIDE_ROLES = 'FULL,REVIEW';
            const groups = [{ email: READ_GROUP, membership: 'direct' }];
            const getGroupMemberships = sinon.stub().resolves({ groups, userCacheTtlMs: 120000 });
            const cache = { get: sinon.stub().returns(undefined), set: sinon.spy() };
            const authenticate = authenticator({ getGroupMemberships, cache });
            const req = { headers: { authorization: 'Bearer cloud-token' } };
            const res = { status: sinon.stub().returnsThis(), json: sinon.spy() };
            const next = sinon.spy();

            await authenticate(req, res, next);

            expect(getGroupMemberships.calledOnce).to.be.true;
            expect(req.user.authorizationRoles).to.deep.equal(['READ']);
            expect(req.user.permissions).to.deep.equal(permissionsForRoles(['READ']));
            expect(req.user.permissions).to.not.include('records:delete');
            expect(req.user.permissions).to.not.include('applications:review');
        });
    });
});
