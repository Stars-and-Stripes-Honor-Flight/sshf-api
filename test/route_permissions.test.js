import { expect } from 'chai';
import { app } from '../index.js';
import { requirePermission } from '../utils/auth.js';
import { ROUTE_PERMISSIONS, permissionsForRoles } from '../utils/permissions.js';

/**
 * Routes that are not gated by requirePermission. /api-docs is an app.use
 * mount rather than a method route and is asserted separately.
 */
const PUBLIC_ROUTES = new Set([
    'GET /openapi.json',
    'POST /review/applications',
    'GET /user/hasgroup',
    'GET /user/permissions'
]);

const ROLE_ENV = {
    AUTHZ_ROLE_READ_GROUPS: 'sshf_app_dev_read_access@starsandstripeshonorflight.org',
    AUTHZ_ROLE_WRITE_GROUPS: 'sshf_app_dev_write_access@starsandstripeshonorflight.org',
    AUTHZ_ROLE_FULL_GROUPS: 'sshf_app_dev_full_access@starsandstripeshonorflight.org',
    AUTHZ_ROLE_MEDICAL_GROUPS: 'sshf_app_dev_medical_access@starsandstripeshonorflight.org',
    AUTHZ_ROLE_REVIEW_GROUPS: 'sshf_app_dev_review_access@starsandstripeshonorflight.org'
};

function routeKey(method, path) {
    return `${method.toUpperCase()} ${path}`;
}

function listRoutes() {
    const routes = [];
    for (const layer of app._router.stack) {
        if (!layer.route) {
            continue;
        }
        const methods = Object.keys(layer.route.methods).filter((method) => layer.route.methods[method]);
        for (const method of methods) {
            routes.push({
                method: method.toUpperCase(),
                path: layer.route.path,
                key: routeKey(method, layer.route.path),
                stack: layer.route.stack
            });
        }
    }
    return routes;
}

function createRes() {
    return {
        statusCode: null,
        body: null,
        headers: {},
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
        setHeader(name, value) {
            this.headers[name.toLowerCase()] = value;
            return this;
        }
    };
}

function permissionGate(route) {
    const names = route.stack.map((layer) => layer.handle.name);
    const authIndex = names.indexOf('authenticate');
    return {
        names,
        authIndex,
        gate: authIndex >= 0 ? route.stack[authIndex + 1] : undefined
    };
}

function invokeGate(route, user) {
    const { gate } = permissionGate(route);
    const res = createRes();
    let nextCalled = false;
    gate.handle({ user }, res, () => {
        nextCalled = true;
    });
    return { res, nextCalled };
}

function userFor(roleIds) {
    return {
        email: 'volunteer@starsandstripeshonorflight.org',
        authorizationRoles: roleIds,
        permissions: permissionsForRoles(roleIds)
    };
}

function isReviewRoute(route) {
    return route.path.startsWith('/review/');
}

function readWouldAllow(route) {
    if (route.method === 'GET' && !isReviewRoute(route)) {
        return true;
    }
    return route.method === 'POST' && route.path === '/query';
}

function isRecordWrite(route) {
    const records = route.path.startsWith('/veterans') || route.path.startsWith('/guardians');
    return records && ['POST', 'PUT', 'PATCH'].includes(route.method);
}

describe('Phase 3 route permissions', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
        for (const key of Object.keys(process.env)) {
            if (!(key in originalEnv)) {
                delete process.env[key];
            }
        }
        for (const [key, value] of Object.entries(originalEnv)) {
            process.env[key] = value;
        }
    });

    describe('router matrix', () => {
        const routes = listRoutes();

        it('mounts /api-docs without requirePermission', () => {
            const apiDocs = app._router.stack.find((layer) => (
                !layer.route && layer.regexp && layer.regexp.test('/api-docs')
            ));
            expect(apiDocs, '/api-docs mount').to.exist;
            expect(routes.some((route) => route.path.startsWith('/api-docs'))).to.equal(false);
        });

        it('puts authenticate then requirePermission on every protected route', () => {
            const seen = new Set();
            for (const route of routes) {
                seen.add(route.key);
                if (PUBLIC_ROUTES.has(route.key)) {
                    const names = route.stack.map((layer) => layer.handle.name);
                    expect(names, route.key).to.not.include('requirePermission');
                    continue;
                }

                const { names, authIndex, gate } = permissionGate(route);
                expect(authIndex, `${route.key} authenticate`).to.be.at.least(0);
                expect(names[authIndex + 1], `${route.key} follows authenticate`).to.equal('requirePermission');
                expect(gate.handle.requiredPermissions, route.key).to.deep.equal(ROUTE_PERMISSIONS[route.key]);
                expect(ROUTE_PERMISSIONS[route.key], route.key).to.be.an('array').that.is.not.empty;
            }

            for (const key of Object.keys(ROUTE_PERMISSIONS)) {
                expect(seen.has(key), `missing mounted route ${key}`).to.equal(true);
            }
            for (const key of PUBLIC_ROUTES) {
                expect(seen.has(key), `missing public route ${key}`).to.equal(true);
            }
        });

        it('keeps public auth routes on authenticate only', () => {
            for (const key of ['GET /user/hasgroup', 'GET /user/permissions']) {
                const route = routes.find((item) => item.key === key);
                expect(route, key).to.exist;
                expect(route.stack[0].handle.name).to.equal('authenticate');
                expect(route.stack.some((layer) => layer.handle.name === 'requirePermission')).to.equal(false);
                expect(route.stack.some((layer) => layer.handle.name === 'authorize')).to.equal(false);
            }

            const intake = routes.find((item) => item.key === 'POST /review/applications');
            expect(intake.stack[0].handle.name).to.equal('authenticateIntake');
            expect(intake.stack.some((layer) => layer.handle.name === 'authorize')).to.equal(false);
        });
    });

    describe('requirePermission', () => {
        beforeEach(() => {
            delete process.env.K_SERVICE;
            Object.assign(process.env, ROLE_ENV);
        });

        it('calls next when every listed permission is held', () => {
            const res = createRes();
            let nextCalled = false;
            requirePermission('records:read', 'records:write')(
                { user: userFor(['WRITE']) },
                res,
                () => { nextCalled = true; }
            );
            expect(nextCalled).to.equal(true);
            expect(res.statusCode).to.equal(null);
        });

        it('returns 403 with requiredPermission when a held role lacks one permission', () => {
            const res = createRes();
            let nextCalled = false;
            requirePermission('records:read', 'records:delete')(
                { user: userFor(['WRITE']) },
                res,
                () => { nextCalled = true; }
            );
            expect(nextCalled).to.equal(false);
            expect(res.statusCode).to.equal(403);
            expect(res.body).to.deep.equal({
                message: 'Forbidden: requires permission records:delete',
                requiredPermission: 'records:delete'
            });
        });

        it('returns the account-not-permitted body when the user holds no role', () => {
            const res = createRes();
            requirePermission('records:read')(
                { user: { authorizationRoles: [], permissions: [] } },
                res,
                () => {}
            );
            expect(res.body).to.deep.equal({ message: 'Forbidden: Account not permitted' });
            expect(res.body).to.not.have.property('requiredPermission');
        });

        it('fails closed on Cloud Run even when no groups are configured', () => {
            for (const key of Object.keys(process.env)) {
                if (key.startsWith('AUTHZ_ROLE_') || key === 'ALLOWED_GROUP_EMAILS') {
                    delete process.env[key];
                }
            }
            process.env.K_SERVICE = 'sshf-api';
            const res = createRes();
            let nextCalled = false;
            requirePermission('records:read')(
                { user: { permissions: [] } },
                res,
                () => { nextCalled = true; }
            );
            expect(nextCalled).to.equal(false);
            expect(res.statusCode).to.equal(403);
            expect(res.body).to.deep.equal({ message: 'Forbidden: Account not permitted' });
        });

        it('leaves the gate open off Cloud Run when no role groups are configured', () => {
            delete process.env.K_SERVICE;
            for (const key of Object.keys(process.env)) {
                if (key.startsWith('AUTHZ_ROLE_') || key === 'ALLOWED_GROUP_EMAILS') {
                    delete process.env[key];
                }
            }
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
    });

    describe('role behavior', () => {
        const protectedRoutes = listRoutes().filter((route) => !PUBLIC_ROUTES.has(route.key));

        beforeEach(() => {
            delete process.env.K_SERVICE;
            Object.assign(process.env, ROLE_ENV);
        });

        function expectAllowed(roleIds, route) {
            const result = invokeGate(route, userFor(roleIds));
            expect(result.nextCalled, `${roleIds.join('+') || 'none'} ${route.key}`).to.equal(true);
            expect(result.res.statusCode, route.key).to.equal(null);
        }

        function expectDenied(roleIds, route) {
            const result = invokeGate(route, userFor(roleIds));
            expect(result.nextCalled, `${roleIds.join('+') || 'none'} ${route.key}`).to.equal(false);
            expect(result.res.statusCode, route.key).to.equal(403);
            expect(result.res.body.message, route.key).to.equal(
                `Forbidden: requires permission ${result.res.body.requiredPermission}`
            );
            expect(result.res.body.requiredPermission, route.key).to.be.a('string').that.is.not.empty;
        }

        it('lets READ read and export, and forbids other writes', () => {
            for (const route of protectedRoutes) {
                if (readWouldAllow(route)) {
                    expectAllowed(['READ'], route);
                } else {
                    expectDenied(['READ'], route);
                }
            }
        });

        it('lets WRITE update records, including medical indicators, and forbids admin, flight management, and review', () => {
            for (const route of protectedRoutes) {
                const allowed = !isReviewRoute(route) && (readWouldAllow(route) || isRecordWrite(route));
                if (allowed) {
                    expectAllowed(['WRITE'], route);
                } else {
                    expectDenied(['WRITE'], route);
                }
            }

            const medicalForm = protectedRoutes.find((route) => route.key === 'PATCH /veterans/:id/medical-form');
            const medicalReview = protectedRoutes.find((route) => route.key === 'PATCH /veterans/:id/medical-review');
            expectAllowed(['WRITE'], medicalForm);
            expectAllowed(['WRITE'], medicalReview);

            const deleteVeteran = invokeGate(
                protectedRoutes.find((route) => route.key === 'DELETE /veterans/:id'),
                userFor(['WRITE'])
            );
            expect(deleteVeteran.res.body.requiredPermission).to.equal('records:delete');
        });

        it('lets FULL do everything except review and medical', () => {
            for (const route of protectedRoutes) {
                if (isReviewRoute(route)) {
                    expectDenied(['FULL'], route);
                } else {
                    expectAllowed(['FULL'], route);
                }
            }
            const review = invokeGate(
                protectedRoutes.find((route) => route.key === 'GET /review/applications'),
                userFor(['FULL'])
            );
            expect(review.res.body.requiredPermission).to.equal('applications:review');
            const accept = invokeGate(
                protectedRoutes.find((route) => route.key === 'POST /review/applications/:id/accept'),
                userFor(['FULL'])
            );
            expect(accept.res.body.requiredPermission).to.equal('applications:accept');
        });

        it('lets REVIEW review and accept, and forbids logistics', () => {
            for (const route of protectedRoutes) {
                if (isReviewRoute(route)) {
                    expectAllowed(['REVIEW'], route);
                } else {
                    expectDenied(['REVIEW'], route);
                }
            }
        });

        it('forbids MEDICAL alone on every current route', () => {
            for (const route of protectedRoutes) {
                expectDenied(['MEDICAL'], route);
            }
        });

        it('forbids a signed-in user with no role without naming a permission', () => {
            const search = protectedRoutes.find((route) => route.key === 'GET /search');
            const result = invokeGate(search, {
                authorizationRoles: [],
                permissions: []
            });
            expect(result.nextCalled).to.equal(false);
            expect(result.res.statusCode).to.equal(403);
            expect(result.res.body).to.deep.equal({ message: 'Forbidden: Account not permitted' });
        });
    });
});
