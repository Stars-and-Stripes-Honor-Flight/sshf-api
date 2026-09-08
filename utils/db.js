import cookie from 'cookie';

// Session cache TTL shared by every client
const dbCacheTTL = 3 * 60 * 1000; // 3 minutes in milliseconds

// Maximum retry attempts for session refresh
const MAX_SESSION_RETRY_ATTEMPTS = 3;

/**
 * Custom error class for database session failures
 */
export class DatabaseSessionError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DatabaseSessionError';
    }
}

/**
 * Resolve the connection settings for the application review database.
 * URL, user and password fall back to the main database settings so a review
 * database hosted on the same CouchDB server only needs REVIEW_DB_NAME.
 *
 * @param {Object} [env=process.env]
 * @returns {{url: string|undefined, name: string|undefined, user: string|undefined, pass: string|undefined}}
 */
export function getReviewDbConfig(env = process.env) {
    return {
        url: env.REVIEW_DB_URL || env.DB_URL,
        name: env.REVIEW_DB_NAME,
        user: env.REVIEW_DB_USER || env.DB_USER,
        pass: env.REVIEW_DB_PASS || env.DB_PASS
    };
}

/**
 * Create an isolated CouchDB client (session middleware + fetch with retry).
 *
 * @param {Object|Function} config - `{ url, user, pass, cookieProperty }` or a
 *   function returning that object (evaluated on every use so env changes are
 *   picked up). `cookieProperty` is the request property that carries the
 *   AuthSession cookie (default `dbCookie`).
 * @returns {{session: Function, fetch: Function, clearSessionCache: Function}}
 */
export function createDbClient(config) {
    const sessionCache = new Map();

    const resolveConfig = () => {
        const resolved = typeof config === 'function' ? config() : config;
        return {
            url: resolved.url,
            user: resolved.user,
            pass: resolved.pass,
            cookieProperty: resolved.cookieProperty || 'dbCookie'
        };
    };

    const cacheKeyFor = ({ url, user, pass, cookieProperty }) =>
        `AuthSession_${url}_${user}_${pass}_${cookieProperty}`;

    /**
     * Authenticates with CouchDB and returns a new session cookie
     * @throws {Error} If authentication fails
     */
    async function authenticateWithDb({ url, user, pass }) {
        const response = await fetch(`${url}/_session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                name: user,
                password: pass
            })
        });

        if (!response.ok) {
            throw new Error('Failed to create CouchDB session');
        }

        const cookieString = response.headers.get('set-cookie');
        return `AuthSession=${cookie.parse(cookieString).AuthSession}`;
    }

    /**
     * Invalidates the cached session and creates a new one
     */
    async function refreshSession(resolved) {
        const cacheKey = cacheKeyFor(resolved);
        sessionCache.delete(cacheKey);

        const authCookie = await authenticateWithDb(resolved);
        sessionCache.set(cacheKey, { cookie: authCookie, timestamp: Date.now() });

        return authCookie;
    }

    /**
     * Middleware to establish a CouchDB session and attach the cookie to the request
     */
    async function session(req, res, next) {
        try {
            const resolved = resolveConfig();
            const cacheKey = cacheKeyFor(resolved);

            if (sessionCache.has(cacheKey)) {
                const cachedCookie = sessionCache.get(cacheKey);
                if (Date.now() - cachedCookie.timestamp < dbCacheTTL) {
                    req[resolved.cookieProperty] = cachedCookie.cookie;
                    return next();
                }
                sessionCache.delete(cacheKey);
            }

            const authCookie = await authenticateWithDb(resolved);
            sessionCache.set(cacheKey, { cookie: authCookie, timestamp: Date.now() });

            req[resolved.cookieProperty] = authCookie;
            next();
        } catch (error) {
            console.error('CouchDB session error:', error);
            res.status(500).json({ message: 'Database session error' });
        }
    }

    /**
     * Performs a fetch request to the database with automatic session refresh on 401
     *
     * @param {Object} req - Express request object (must carry the session cookie property)
     * @param {string} url - The URL to fetch
     * @param {Object} options - Fetch options (method, headers, body, etc.)
     * @returns {Promise<Response>} The fetch response
     * @throws {DatabaseSessionError} If session cannot be established after max retries
     */
    async function dbFetchWithRetry(req, url, options = {}) {
        const resolved = resolveConfig();
        const { cookieProperty } = resolved;
        let attempts = 0;

        while (attempts < MAX_SESSION_RETRY_ATTEMPTS) {
            attempts++;

            const headers = {
                'Accept': 'application/json',
                ...options.headers,
                'Cookie': req[cookieProperty]
            };

            try {
                const response = await fetch(url, {
                    ...options,
                    headers
                });

                if (response.status === 401) {
                    console.warn(`CouchDB session expired (attempt ${attempts}/${MAX_SESSION_RETRY_ATTEMPTS}), refreshing...`);

                    try {
                        req[cookieProperty] = await refreshSession(resolved);
                        continue;
                    } catch (refreshError) {
                        console.error(`Session refresh failed (attempt ${attempts}/${MAX_SESSION_RETRY_ATTEMPTS}):`, refreshError.message);
                        continue;
                    }
                }

                return response;
            } catch (fetchError) {
                console.error(`Database fetch error (attempt ${attempts}/${MAX_SESSION_RETRY_ATTEMPTS}):`, fetchError.message);

                if (attempts < MAX_SESSION_RETRY_ATTEMPTS) {
                    try {
                        req[cookieProperty] = await refreshSession(resolved);
                    } catch (refreshError) {
                        // Ignore refresh error, will retry anyway
                    }
                }
            }
        }

        throw new DatabaseSessionError(
            `Database session could not be established after ${MAX_SESSION_RETRY_ATTEMPTS} attempts. Please try again.`
        );
    }

    return {
        session,
        fetch: dbFetchWithRetry,
        clearSessionCache: () => sessionCache.clear()
    };
}

// Default client for the main logistics database (DB_URL / DB_USER / DB_PASS)
const mainDbClient = createDbClient({
    url: process.env.DB_URL,
    user: process.env.DB_USER,
    pass: process.env.DB_PASS,
    cookieProperty: 'dbCookie'
});

/**
 * Middleware to establish a CouchDB session for the main database.
 * Attaches dbCookie to the request object.
 */
export const dbSession = mainDbClient.session;

/**
 * Fetch against the main database with automatic session refresh on 401.
 */
export const dbFetch = mainDbClient.fetch;

/**
 * Clears the main database session cache (for testing purposes)
 */
export const clearSessionCache = mainDbClient.clearSessionCache;

// Client for the application review database. Config is resolved per use so
// REVIEW_DB_* / DB_* environment changes are honored.
const reviewDbClient = createDbClient(() => ({
    ...getReviewDbConfig(),
    cookieProperty: 'reviewDbCookie'
}));

/**
 * Middleware to establish a CouchDB session for the review database.
 * Attaches reviewDbCookie to the request object.
 */
export const reviewDbSession = reviewDbClient.session;

/**
 * Fetch against the review database with automatic session refresh on 401.
 */
export const reviewDbFetch = reviewDbClient.fetch;

/**
 * Clears the review database session cache (for testing purposes)
 */
export const clearReviewSessionCache = reviewDbClient.clearSessionCache;
