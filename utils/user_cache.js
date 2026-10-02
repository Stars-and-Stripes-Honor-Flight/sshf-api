/**
 * In-memory cache of successful Google user authentications.
 *
 * Successful lookups are reused for USER_CACHE_TTL_MS (15 minutes), or for a
 * shorter per-entry TTL when a negative group membership must be rechecked
 * sooner (about 2 minutes). That bounds how long a revoked token, or a user
 * removed from an allowed group, can keep access without another token
 * introspection and Admin SDK lookup.
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
 * TTL actually stored for one cache entry. Non-positive or missing requests
 * use the cache maximum. Longer requests are capped at that maximum.
 */
export function resolveUserCacheTtlMs(requested, maxTtlMs = USER_CACHE_TTL_MS) {
    return Number.isFinite(requested) && requested > 0
        ? Math.min(requested, maxTtlMs)
        : maxTtlMs;
}

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
            if (current - entry.timestamp >= (entry.ttlMs ?? ttlMs)) {
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

        /**
         * @param {string} token
         * @param {object} user
         * @param {{ttlMs?: number}} [options] Shorter than the cache maximum
         *   when membership must be rechecked sooner. Longer values are capped
         *   at ttlMs. Non-positive values keep the default lifetime.
         */
        set(token, user, options = {}) {
            evictExpired();
            const key = hashBearerToken(token);
            if (entries.has(key)) {
                entries.delete(key);
            }
            const entryTtlMs = resolveUserCacheTtlMs(options.ttlMs, ttlMs);
            entries.set(key, { user, timestamp: now(), ttlMs: entryTtlMs });
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
