import { expect } from 'chai';
import { UserPermissions } from '../models/user_permissions.js';

describe('UserPermissions', () => {
    it('serializes direct roles and the effective permission union', () => {
        const model = new UserPermissions({
            email: 'jane.doe@starsandstripeshonorflight.org',
            authorizationRoles: ['REVIEW', 'READ'],
            permissions: ['records:read', 'applications:review', 'exports:read', 'applications:accept'],
            evaluatedAt: '2026-10-01T15:04:05.000Z',
            expiresAt: '2026-10-01T15:19:05.000Z'
        });

        expect(model.toJSON()).to.deep.equal({
            email: 'jane.doe@starsandstripeshonorflight.org',
            hasAccess: true,
            roles: ['READ', 'REVIEW'],
            permissions: [
                'applications:accept',
                'applications:review',
                'exports:read',
                'records:read'
            ],
            evaluatedAt: '2026-10-01T15:04:05.000Z',
            expiresAt: '2026-10-01T15:19:05.000Z'
        });
    });

    it('reports no access when the permission list is empty', () => {
        const model = new UserPermissions({
            email: 'new.volunteer@starsandstripeshonorflight.org',
            authorizationRoles: [],
            permissions: [],
            evaluatedAt: '2026-10-01T15:04:05.000Z',
            expiresAt: '2026-10-01T15:06:05.000Z'
        });
        const body = model.toJSON();
        expect(body.hasAccess).to.equal(false);
        expect(body.roles).to.deep.equal([]);
        expect(body.permissions).to.deep.equal([]);
    });

    it('does not list inherited roles for a FULL user', () => {
        const model = new UserPermissions({
            email: 'admin@starsandstripeshonorflight.org',
            authorizationRoles: ['FULL'],
            permissions: [
                'documents:admin',
                'exports:read',
                'flights:manage',
                'records:delete',
                'records:read',
                'records:write'
            ],
            evaluatedAt: '2026-10-01T15:04:05.000Z',
            expiresAt: '2026-10-01T15:19:05.000Z'
        });
        expect(model.toJSON().roles).to.deep.equal(['FULL']);
        expect(model.toJSON().hasAccess).to.equal(true);
    });
});
