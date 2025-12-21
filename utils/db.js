import cookie from 'cookie';

const dbUrl = process.env.DB_URL;
const dbUser = process.env.DB_USER;
const dbPass = process.env.DB_PASS;

// Session cache shared between middleware and dbFetch
const sessionCache = new Map();
const dbCacheTTL = 3 * 60 * 1000; // 3 minutes in milliseconds
const cacheKey = `AuthSession_${dbUrl}_${dbUser}_${dbPass}`;

/**
 * Clears the session cache (for testing purposes)
 */
export function clearSessionCache() {
    sessionCache.clear();
}

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
 * Authenticates with CouchDB and returns a new session cookie
 * @returns {Promise<string>} The AuthSession cookie string
 * @throws {Error} If authentication fails
 */
async function authenticateWithDb() {
    const response = await fetch(`${dbUrl}/_session`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            name: dbUser,
            password: dbPass
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
 * @returns {Promise<string>} The new AuthSession cookie string
 * @throws {Error} If reauthentication fails
 */
async function refreshSession() {
    // Invalidate existing cache
    sessionCache.delete(cacheKey);
    
    // Create new session
    const authCookie = await authenticateWithDb();
    
    // Store new cookie in cache
    sessionCache.set(cacheKey, { cookie: authCookie, timestamp: Date.now() });
    
    return authCookie;
}

/**
 * Middleware to establish a CouchDB session
 * Attaches dbCookie to the request object
 */
export async function dbSession(req, res, next) {
    try {
        if (sessionCache.has(cacheKey)) {
            const cachedCookie = sessionCache.get(cacheKey);
            // Check if cache is expired
            if (Date.now() - cachedCookie.timestamp < dbCacheTTL) {
                req.dbCookie = cachedCookie.cookie;
                return next();
            } else {
                // Remove expired cache entry
                sessionCache.delete(cacheKey);
            }
        }

        const authCookie = await authenticateWithDb();
        
        // Store cookie in cache
        sessionCache.set(cacheKey, { cookie: authCookie, timestamp: Date.now() });

        req.dbCookie = authCookie;
        next();
    } catch (error) {
        console.error('CouchDB session error:', error);
        res.status(500).json({ message: 'Database session error' });
    }
}

/**
 * Performs a fetch request to the database with automatic session refresh on 401
 * 
 * @param {Object} req - Express request object (must have dbCookie property)
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options (method, headers, body, etc.)
 * @returns {Promise<Response>} The fetch response
 * @throws {DatabaseSessionError} If session cannot be established after max retries
 */
export async function dbFetch(req, url, options = {}) {
    let attempts = 0;
    let lastError = null;

    while (attempts < MAX_SESSION_RETRY_ATTEMPTS) {
        attempts++;

        // Merge the dbCookie into headers
        const headers = {
            'Accept': 'application/json',
            ...options.headers,
            'Cookie': req.dbCookie
        };

        try {
            const response = await fetch(url, {
                ...options,
                headers
            });

            // If response is 401, the session has expired
            if (response.status === 401) {
                console.warn(`CouchDB session expired (attempt ${attempts}/${MAX_SESSION_RETRY_ATTEMPTS}), refreshing...`);
                
                try {
                    // Refresh the session
                    const newCookie = await refreshSession();
                    // Update the request object so subsequent calls in the same request use the new cookie
                    req.dbCookie = newCookie;
                    // Continue to retry the request
                    continue;
                } catch (refreshError) {
                    lastError = refreshError;
                    console.error(`Session refresh failed (attempt ${attempts}/${MAX_SESSION_RETRY_ATTEMPTS}):`, refreshError.message);
                    // Continue to retry
                    continue;
                }
            }

            // For any other response (success or other errors), return it
            return response;

        } catch (fetchError) {
            // Network errors or other fetch failures
            lastError = fetchError;
            console.error(`Database fetch error (attempt ${attempts}/${MAX_SESSION_RETRY_ATTEMPTS}):`, fetchError.message);
            
            // If it's not the last attempt, try refreshing the session
            if (attempts < MAX_SESSION_RETRY_ATTEMPTS) {
                try {
                    const newCookie = await refreshSession();
                    req.dbCookie = newCookie;
                } catch (refreshError) {
                    // Ignore refresh error, will retry anyway
                }
            }
        }
    }

    // All attempts exhausted
    throw new DatabaseSessionError(
        `Database session could not be established after ${MAX_SESSION_RETRY_ATTEMPTS} attempts. Please try again.`
    );
}

