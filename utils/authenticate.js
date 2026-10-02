/**
 * Google user authentication middleware.
 *
 * Introspects the bearer access token, loads profile and Workspace groups,
 * and caches a successful result. On Cloud Run, Directory lookup failures are
 * 503 so a transient Admin SDK outage is not cached or turned into an empty
 * role list. Off Cloud Run, getGroupMemberships returns no roles instead.
 *
 * Group lookup may return { groups, userCacheTtlMs } so a negative membership
 * expires the sign-in cache in about 2 minutes. An array is the direct list
 * only and keeps the default cache lifetime.
 */
import { assertValidTokenClaims, TokenAudienceError } from './auth.js';
import { DirectoryGroupsUnavailableError } from './groups.js';
import { resolveAccessFromMemberships } from './permissions.js';

function toRole(group) {
    const role = { email: group.email };
    if (group.id !== undefined) {
        role.id = group.id;
    }
    if (group.name !== undefined) {
        role.name = group.name;
    }
    if (group.membership === 'direct' || group.membership === 'nested') {
        role.membership = group.membership;
    }
    return role;
}

/**
 * @param {object} options
 * @param {(token: string) => Promise<object>} options.getTokenInfo
 * @param {(token: string) => Promise<object>} options.getUserInfo
 * @param {(userData: object) => Promise<object[]>} options.getGroupMemberships
 * @param {{get: Function, set: Function}} options.cache
 */
export function createAuthenticator({
    getTokenInfo,
    getUserInfo,
    getGroupMemberships,
    cache
}) {
    return async function authenticate(req, res, next) {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ message: 'Unauthorized: No Bearer token provided' });
            }
            const token = authHeader.split(' ')[1];

            const cachedUser = cache.get(token);
            if (cachedUser) {
                req.user = cachedUser;
                return next();
            }

            let tokenInfo;
            try {
                tokenInfo = await getTokenInfo(token);
            } catch (introspectionError) {
                const status = introspectionError?.status ?? introspectionError?.response?.status;
                if (status && status >= 400 && status < 500) {
                    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
                }
                console.error('Token introspection failed:', introspectionError?.message);
                return res.status(503).json({ message: 'Authentication service unavailable' });
            }

            try {
                assertValidTokenClaims({
                    aud: tokenInfo.aud,
                    email: tokenInfo.email,
                    emailVerified: tokenInfo.email_verified
                });
            } catch (validationError) {
                if (validationError instanceof TokenAudienceError) {
                    return res.status(401).json({ message: 'Unauthorized: Token not issued for this application' });
                }
                return res.status(403).json({ message: 'Forbidden: Account not permitted' });
            }

            const userData = await getUserInfo(token);
            if (!userData) {
                throw new Error('Failed to fetch user info');
            }

            let membershipResult;
            try {
                membershipResult = await getGroupMemberships(userData);
            } catch (error) {
                if (error instanceof DirectoryGroupsUnavailableError) {
                    console.error('Directory group lookup unavailable:', error.message);
                    return res.status(503).json({ message: 'Authentication service unavailable' });
                }
                throw error;
            }

            const groups = Array.isArray(membershipResult)
                ? membershipResult
                : membershipResult.groups;
            const userCacheTtlMs = Array.isArray(membershipResult)
                ? undefined
                : membershipResult.userCacheTtlMs;

            const roles = groups.map((group) => toRole(group));
            // Role ids and permissions are computed once per cache fill.
            // authorize still ignores every role except FULL.
            const access = resolveAccessFromMemberships(roles);

            const user = {
                id: userData.sub,
                email: userData.email,
                firstName: userData.given_name,
                lastName: userData.family_name,
                avatar: userData.picture,
                roles,
                authorizationRoles: access.roles,
                permissions: access.permissions
            };

            if (Number.isFinite(userCacheTtlMs)) {
                cache.set(token, user, { ttlMs: userCacheTtlMs });
            } else {
                cache.set(token, user);
            }
            req.user = user;
            next();
        } catch (error) {
            console.error('Authentication error:', error);
            res.status(401).json({ message: 'Unauthorized: Invalid token' });
        }
    };
}
