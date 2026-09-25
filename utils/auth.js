/**
 * Access-token authorization helpers.
 *
 * The API receives an opaque Google OAuth2 access token as a Bearer token.
 * A valid Google token is not sufficient: it must have been issued for THIS
 * application's OAuth client. Optionally, an allow-list of email domains 
 * provides defense in depth on top of the OAuth client's org-internal consent restriction.
 */

/** Token was not issued for one of this application's OAuth clients. */
export class TokenAudienceError extends Error {
    constructor(message) {
        super(message);
        this.name = 'TokenAudienceError';
    }
}

/** Token is valid and for this app, but the account is not permitted. */
export class DomainNotAllowedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DomainNotAllowedError';
    }
}

/** Token is valid and for this app, but the user is not in an allowed Workspace group. */
export class GroupNotAllowedError extends Error {
    constructor(message) {
        super(message);
        this.name = 'GroupNotAllowedError';
    }
}

function parseList(raw) {
    if (!raw || raw.trim() === '') {
        return [];
    }
    return raw
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0);
}

/**
 * OAuth client IDs whose tokens this API accepts. Prefers ALLOWED_CLIENT_IDS
 * (comma-separated) and falls back to the single GOOGLE_CLIENT_ID.
 */
export function getAllowedClientIds(env = process.env) {
    const explicit = env.ALLOWED_CLIENT_IDS;
    if (explicit && explicit.trim() !== '') {
        return parseList(explicit);
    }
    return parseList(env.GOOGLE_CLIENT_ID);
}

/**
 * Email domains permitted to access the API. Empty (the default) disables the
 * domain check, leaving audience validation as the sole gate.
 */
export function getAllowedEmailDomains(env = process.env) {
    return parseList(env.ALLOWED_EMAIL_DOMAINS).map((domain) => domain.toLowerCase());
}

/**
 * Workspace group emails permitted to access protected data routes. Empty
 * disables the group check off Cloud Run so local development can omit it.
 * On Cloud Run (K_SERVICE set) an empty list fails closed. When the list is
 * set, membership is required (fail closed if Admin SDK returns no roles).
 */
export function getAllowedGroupEmails(env = process.env) {
    return parseList(env.ALLOWED_GROUP_EMAILS).map((email) => email.toLowerCase());
}

/**
 * Cloud Run sets K_SERVICE to the service name. Local development does not.
 */
export function isRunningOnCloudRun(env = process.env) {
    return typeof env.K_SERVICE === 'string' && env.K_SERVICE.trim() !== '';
}

/**
 * Deployed Cloud Run revisions must configure ALLOWED_GROUP_EMAILS. An empty
 * list would otherwise accept any access token minted for the public OAuth
 * client. Local development without K_SERVICE may omit the list.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @throws {GroupNotAllowedError} when Cloud Run has no group allow-list
 */
export function assertGroupAuthorizationConfigured(env = process.env) {
    if (isRunningOnCloudRun(env) && getAllowedGroupEmails(env).length === 0) {
        throw new GroupNotAllowedError(
            'ALLOWED_GROUP_EMAILS must be set when running on Cloud Run'
        );
    }
}

function isEmailVerified(value) {
    // Google's tokeninfo response may deliver this as a boolean or the
    // string "true"; treat both as verified.
    return value === true || value === 'true';
}

/**
 * Validate the security-relevant claims of an introspected access token.
 *
 * @param {{aud?: string, email?: string, emailVerified?: boolean|string}} claims
 * @param {{allowedClientIds?: string[], allowedEmailDomains?: string[]}} [options]
 * @throws {TokenAudienceError} when the token was not issued for this app
 * @throws {DomainNotAllowedError} when the account email is not permitted
 */
export function assertValidTokenClaims(claims = {}, options = {}) {
    const allowedClientIds = options.allowedClientIds ?? getAllowedClientIds();
    const allowedEmailDomains = options.allowedEmailDomains ?? getAllowedEmailDomains();

    if (allowedClientIds.length === 0) {
        throw new TokenAudienceError('No allowed OAuth client IDs are configured');
    }

    if (!claims.aud || !allowedClientIds.includes(claims.aud)) {
        throw new TokenAudienceError('Access token was not issued for this application');
    }

    if (allowedEmailDomains.length > 0) {
        const email = typeof claims.email === 'string' ? claims.email.toLowerCase() : '';
        if (!email || !isEmailVerified(claims.emailVerified)) {
            throw new DomainNotAllowedError('A verified account email is required');
        }
        const domain = email.split('@')[1];
        if (!domain || !allowedEmailDomains.includes(domain)) {
            throw new DomainNotAllowedError('Account email domain is not permitted');
        }
    }
}

/**
 * Require the authenticated user to belong to at least one configured
 * Workspace group. When the allow-list is empty the check is disabled off
 * Cloud Run. On Cloud Run an empty list fails closed.
 *
 * @param {Array<{email?: string}>|undefined|null} roles
 * @param {{allowedGroupEmails?: string[], env?: NodeJS.ProcessEnv}} [options]
 * @throws {GroupNotAllowedError} when the user is not in an allowed group,
 *   or when Cloud Run has no group allow-list
 */
export function assertUserInAllowedGroups(roles, options = {}) {
    const env = options.env ?? process.env;
    const allowedGroupEmails = options.allowedGroupEmails ?? getAllowedGroupEmails(env);

    if (allowedGroupEmails.length === 0) {
        assertGroupAuthorizationConfigured(env);
        return;
    }

    const userEmails = (Array.isArray(roles) ? roles : [])
        .map((role) => (typeof role?.email === 'string' ? role.email.toLowerCase() : ''))
        .filter((email) => email.length > 0);

    const isMember = userEmails.some((email) => allowedGroupEmails.includes(email));
    if (!isMember) {
        throw new GroupNotAllowedError('Account is not a member of an allowed group');
    }
}

/**
 * Express middleware: enforce ALLOWED_GROUP_EMAILS against req.user.roles.
 * Intended to run after authenticate on data routes (not on /user/hasgroup).
 */
export function authorize(req, res, next) {
    try {
        assertUserInAllowedGroups(req.user?.roles);
        next();
    } catch (error) {
        if (error instanceof GroupNotAllowedError) {
            return res.status(403).json({ message: 'Forbidden: Account not permitted' });
        }
        throw error;
    }
}
