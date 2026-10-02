/**
 * Serializer for GET /user/permissions.
 *
 * roles are the role ids granted directly by group membership. Inherited
 * roles are not listed. permissions is the effective union, including
 * inheritance. hasAccess is true when that union is non-empty.
 */
export class UserPermissions {
    constructor(user = {}) {
        const roles = Array.isArray(user.authorizationRoles) ? [...user.authorizationRoles] : [];
        const permissions = Array.isArray(user.permissions) ? [...user.permissions] : [];
        this.email = typeof user.email === 'string' ? user.email : '';
        this.roles = roles.sort();
        this.permissions = permissions.sort();
        this.hasAccess = this.permissions.length > 0;
        this.evaluatedAt = user.evaluatedAt;
        this.expiresAt = user.expiresAt;
    }

    toJSON() {
        return {
            email: this.email,
            hasAccess: this.hasAccess,
            roles: this.roles,
            permissions: this.permissions,
            evaluatedAt: this.evaluatedAt,
            expiresAt: this.expiresAt
        };
    }
}
