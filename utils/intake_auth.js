/**
 * Intake authentication for POST /review/applications.
 *
 * The hf_appcollector Cloud Function authenticates with a Google-signed
 * service-account ID token. The API verifies the token signature and audience
 * and only accepts identities explicitly listed in
 * REVIEW_INTAKE_SERVICE_ACCOUNTS. The middleware fails closed when it is not
 * configured. Tokens are never logged.
 */
import { OAuth2Client } from 'google-auth-library';

const NETWORK_ERROR_CODES = new Set([
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    'ECONNRESET',
    'EAI_AGAIN'
]);

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
 * Service-account emails allowed to submit applications (comma-separated,
 * lowercased). Empty disables intake entirely.
 */
export function getIntakeAllowedServiceAccounts(env = process.env) {
    return parseList(env.REVIEW_INTAKE_SERVICE_ACCOUNTS).map((email) => email.toLowerCase());
}

/**
 * Expected ID-token audience. Defaults to the public API URL.
 */
export function getIntakeAudience(env = process.env) {
    return env.REVIEW_INTAKE_AUDIENCE || env.API_URL || '';
}

function isEmailVerified(value) {
    return value === true || value === 'true';
}

function isServiceUnavailable(error) {
    if (error?.code && NETWORK_ERROR_CODES.has(error.code)) {
        return true;
    }
    const status = error?.status ?? error?.response?.status;
    return typeof status === 'number' && status >= 500;
}

function defaultVerifyIdToken(idToken, audience) {
    const client = new OAuth2Client();
    return client.verifyIdToken({ idToken, audience }).then((ticket) => ticket.getPayload());
}

/**
 * Build the intake authentication middleware.
 *
 * @param {Object} [options]
 * @param {(token: string, audience: string) => Promise<Object>} [options.verifyIdToken]
 *   Token verifier returning the ID-token payload (injectable for tests).
 * @param {Object} [options.env] Environment source (defaults to process.env, read per request).
 * @returns {Function} Express middleware
 */
export function createIntakeAuthenticator({ verifyIdToken = defaultVerifyIdToken, env } = {}) {
    return async function authenticateIntake(req, res, next) {
        const currentEnv = env || process.env;

        const authHeader = req.headers?.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Unauthorized: No Bearer token provided' });
        }
        const token = authHeader.slice('Bearer '.length).trim();

        const allowedAccounts = getIntakeAllowedServiceAccounts(currentEnv);
        const audience = getIntakeAudience(currentEnv);
        if (allowedAccounts.length === 0 || !audience) {
            return res.status(401).json({ message: 'Unauthorized: Intake authentication is not configured' });
        }

        let payload;
        try {
            payload = await verifyIdToken(token, audience);
        } catch (error) {
            if (isServiceUnavailable(error)) {
                console.error('Intake token verification unavailable:', error?.message);
                return res.status(503).json({ message: 'Authentication service unavailable' });
            }
            return res.status(401).json({ message: 'Unauthorized: Invalid token' });
        }

        const email = typeof payload?.email === 'string' ? payload.email.toLowerCase() : '';
        if (!email || !isEmailVerified(payload.email_verified) || !allowedAccounts.includes(email)) {
            return res.status(403).json({ message: 'Forbidden: Account not permitted' });
        }

        req.intake = { email: payload.email, subject: payload.sub };
        next();
    };
}

/**
 * Default intake authenticator using Google ID-token verification.
 */
export const authenticateIntake = createIntakeAuthenticator();
