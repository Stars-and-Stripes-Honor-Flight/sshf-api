/**
 * Google user authentication middleware.
 *
 * Introspects the bearer access token, loads profile and Workspace groups,
 * and caches a successful result. Directory lookup failures are 503 so a
 * transient Admin SDK outage is not cached or turned into an empty role list.
 */
import { assertValidTokenClaims, TokenAudienceError } from './auth.js';
import { DirectoryGroupsUnavailableError } from './groups.js';

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

            let groups;
            try {
                groups = await getGroupMemberships(userData);
            } catch (error) {
                if (error instanceof DirectoryGroupsUnavailableError) {
                    console.error('Directory group lookup unavailable:', error.message);
                    return res.status(503).json({ message: 'Authentication service unavailable' });
                }
                throw error;
            }

            const roles = groups.map(group => ({
                id: group.id,
                name: group.name,
                email: group.email
            }));

            const user = {
                id: userData.sub,
                email: userData.email,
                firstName: userData.given_name,
                lastName: userData.family_name,
                avatar: userData.picture,
                roles
            };

            cache.set(token, user);
            req.user = user;
            next();
        } catch (error) {
            console.error('Authentication error:', error);
            res.status(401).json({ message: 'Unauthorized: Invalid token' });
        }
    };
}
