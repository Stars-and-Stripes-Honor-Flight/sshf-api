import { expect } from 'chai';
import sinon from 'sinon';
import { OAuth2Client } from 'google-auth-library';
import { app } from '../index.js';
import { getHasGroup, getUserPermissions } from '../routes/user.js';

const FULL_ACCESS_GROUP = 'sshf_app_dev_full_access@starsandstripeshonorflight.org';

describe('getHasGroup', () => {
    const createRes = () => {
        const res = {
            body: null,
            json(payload) {
                this.body = payload;
                return this;
            }
        };
        return res;
    };

    it('returns hasgroup true when the user is in the requested group', () => {
        const req = {
            user: { roles: [{ email: FULL_ACCESS_GROUP }] },
            query: { groupEmail: FULL_ACCESS_GROUP }
        };
        const res = createRes();
        getHasGroup(req, res);
        expect(res.body).to.deep.equal({ hasgroup: true });
    });

    it('returns hasgroup true when groupEmail differs only by case', () => {
        const req = {
            user: { roles: [{ email: FULL_ACCESS_GROUP.toUpperCase() }] },
            query: { groupEmail: FULL_ACCESS_GROUP }
        };
        const res = createRes();
        getHasGroup(req, res);
        expect(res.body).to.deep.equal({ hasgroup: true });
    });

    it('returns hasgroup false when the user is not in the requested group', () => {
        const req = {
            user: { roles: [{ email: 'other@example.com' }] },
            query: { groupEmail: FULL_ACCESS_GROUP }
        };
        const res = createRes();
        getHasGroup(req, res);
        expect(res.body).to.deep.equal({ hasgroup: false });
    });

    it('returns hasgroup true for a nested membership role', () => {
        const req = {
            user: {
                roles: [{ email: FULL_ACCESS_GROUP, membership: 'nested' }]
            },
            query: { groupEmail: FULL_ACCESS_GROUP }
        };
        const res = createRes();
        getHasGroup(req, res);
        expect(res.body).to.deep.equal({ hasgroup: true });
    });

    it('returns hasgroup false when the user has no roles (probe still works)', () => {
        const req = {
            user: { roles: [] },
            query: { groupEmail: FULL_ACCESS_GROUP }
        };
        const res = createRes();
        getHasGroup(req, res);
        expect(res.body).to.deep.equal({ hasgroup: false });
    });
});

describe('getUserPermissions', () => {
    const createRes = () => {
        const res = {
            statusCode: 200,
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
        return res;
    };

    it('returns 200 with empty permissions and Cache-Control no-store for a signed-in user with no role', () => {
        const req = {
            user: {
                email: 'new.volunteer@starsandstripeshonorflight.org',
                authorizationRoles: [],
                permissions: [],
                evaluatedAt: '2026-10-01T15:04:05.000Z',
                expiresAt: '2026-10-01T15:06:05.000Z'
            }
        };
        const res = createRes();
        getUserPermissions(req, res);
        expect(res.statusCode).to.equal(200);
        expect(res.headers['cache-control']).to.equal('no-store');
        expect(res.body).to.deep.equal({
            email: 'new.volunteer@starsandstripeshonorflight.org',
            hasAccess: false,
            roles: [],
            permissions: [],
            evaluatedAt: '2026-10-01T15:04:05.000Z',
            expiresAt: '2026-10-01T15:06:05.000Z'
        });
    });

    it('returns the authenticated user roles and effective permissions', () => {
        const req = {
            user: {
                email: 'jane.doe@starsandstripeshonorflight.org',
                authorizationRoles: ['REVIEW', 'READ'],
                permissions: ['applications:review', 'records:read', 'exports:read', 'applications:accept'],
                evaluatedAt: '2026-10-01T15:04:05.000Z',
                expiresAt: '2026-10-01T15:19:05.000Z'
            }
        };
        const res = createRes();
        getUserPermissions(req, res);
        expect(res.body.roles).to.deep.equal(['READ', 'REVIEW']);
        expect(res.body.permissions).to.deep.equal([
            'applications:accept',
            'applications:review',
            'exports:read',
            'records:read'
        ]);
        expect(res.body.hasAccess).to.equal(true);
        expect(res.headers['cache-control']).to.equal('no-store');
    });
});

describe('GET /user/permissions route contract', () => {
    function findRoute() {
        return app._router.stack.find((layer) => (
            layer.route &&
            layer.route.path === '/user/permissions' &&
            layer.route.methods.get
        ));
    }

    function createRes() {
        return {
            statusCode: null,
            body: null,
            headers: {},
            setHeader(name, value) {
                this.headers[String(name).toLowerCase()] = value;
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

    afterEach(() => {
        sinon.restore();
    });

    it('returns 401 when the bearer token is missing', async () => {
        const route = findRoute();
        expect(route, 'GET /user/permissions').to.exist;
        const res = createRes();
        let nextCalled = false;
        await route.route.stack[0].handle({ headers: {} }, res, () => {
            nextCalled = true;
        });
        expect(nextCalled).to.equal(false);
        expect(res.statusCode).to.equal(401);
        expect(res.body.message).to.match(/^Unauthorized:/);
    });

    it('returns 503 when token introspection is unavailable', async () => {
        sinon.stub(OAuth2Client.prototype, 'getTokenInfo').rejects(new Error('introspection down'));
        const route = findRoute();
        const res = createRes();
        let nextCalled = false;
        await route.route.stack[0].handle(
            { headers: { authorization: 'Bearer not-a-real-token' } },
            res,
            () => { nextCalled = true; }
        );
        expect(nextCalled).to.equal(false);
        expect(res.statusCode).to.equal(503);
        expect(res.body).to.deep.equal({ message: 'Authentication service unavailable' });
    });
});
