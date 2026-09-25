/**
 * In-memory cache of successful Google user authentications.
 *
 * Successful lookups are reused for USER_CACHE_TTL_MS (15 minutes). That
 * bounds how long a revoked token, or a user removed from an allowed group,
 * can keep access without another token introspection and Admin SDK lookup.
 * Every read and write drops expired entries, including tokens that were not
 * presented again. The map holds at most USER_CACHE_MAX_ENTRIES; past that
 * cap the least-recently-used live entry is removed.
 *
 * Keys are SHA-256 digests of the bearer token. The raw token is never stored.
 */
import { createHash } from 'node:crypto';

/** Cache lifetime for a successful authentication. Must stay at or below 15 minutes. */
export const USER_CACHE_TTL_MS = 15 * 60 * 1000;

/** Maximum cached authentications. Prevents unbounded growth of the in-memory map. */
export const USER_CACHE_MAX_ENTRIES = 1000;

/**
 * One-way cache key for a bearer token. SHA-256 cannot be reversed to the token.
 */
export function hashBearerToken(token) {
    return createHash('sha256').update(String(token), 'utf8').digest('hex');
}

/**
 * @param {object} [options]
 * @param {number} [options.ttlMs]
 * @param {number} [options.maxEntries]
 * @param {() => number} [options.now]
 */
export function createUserCache({
    ttlMs = USER_CACHE_TTL_MS,
    maxEntries = USER_CACHE_MAX_ENTRIES,
    now = Date.now
} = {}) {
    const entries = new Map();

    function evictExpired() {
        const current = now();
        for (const [key, entry] of entries) {
            if (current - entry.timestamp >= ttlMs) {
                entries.delete(key);
            }
        }
    }

    function evictOverflow() {
        while (entries.size > maxEntries) {
            const oldestKey = entries.keys().next().value;
            entries.delete(oldestKey);
        }
    }

    return {
        get(token) {
            evictExpired();
            const key = hashBearerToken(token);
            const entry = entries.get(key);
            if (!entry) {
                return undefined;
            }
            entries.delete(key);
            entries.set(key, entry);
            return entry.user;
        },

        set(token, user) {
            evictExpired();
            const key = hashBearerToken(token);
            if (entries.has(key)) {
                entries.delete(key);
            }
            entries.set(key, { user, timestamp: now() });
            evictOverflow();
        },

        size() {
            return entries.size;
        },

        keys() {
            return [...entries.keys()];
        }
    };
}
