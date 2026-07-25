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
