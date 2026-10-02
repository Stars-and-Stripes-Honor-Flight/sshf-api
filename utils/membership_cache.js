/**
 * In-memory cache of Admin SDK members.hasMember results.
 *
 * Keyed by lowercased user email and group email so a token refresh does not
 * repeat Directory calls. Positive membership lasts at most USER_CACHE_TTL_MS
 * (15 minutes), the same revocation bound as the sign-in cache. Negative
 * membership ("not a member") lasts about 2 minutes so a newly added person
 * is not locked out for the full sign-in TTL. Callers must not store errors.
 */
import { USER_CACHE_TTL_MS } from './user_cache.js';

/** Longest a confirmed membership is reused. Matches the sign-in cache bound. */
export const POSITIVE_MEMBERSHIP_TTL_MS = USER_CACHE_TTL_MS;

/** How long a "not a member" result is reused before Directory is asked again. */
export const NEGATIVE_MEMBERSHIP_TTL_MS = 2 * 60 * 1000;

function normalizeEmail(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function membershipCacheKey(userEmail, groupEmail) {
    return `${normalizeEmail(userEmail)}\n${normalizeEmail(groupEmail)}`;
}

/**
 * @param {object} [options]
 * @param {number} [options.positiveTtlMs]
 * @param {number} [options.negativeTtlMs]
 * @param {() => number} [options.now]
 */
export function createMembershipCache({
    positiveTtlMs = POSITIVE_MEMBERSHIP_TTL_MS,
    negativeTtlMs = NEGATIVE_MEMBERSHIP_TTL_MS,
    now = Date.now
} = {}) {
    const entries = new Map();

    function evictExpired(current = now()) {
        for (const [key, entry] of entries) {
            if (current >= entry.expiresAt) {
                entries.delete(key);
            }
        }
    }

    return {
        /**
         * @returns {{isMember: boolean, expiresAt: number}|undefined}
         */
        get(userEmail, groupEmail) {
            evictExpired();
            const entry = entries.get(membershipCacheKey(userEmail, groupEmail));
            if (!entry) {
                return undefined;
            }
            return { isMember: entry.isMember, expiresAt: entry.expiresAt };
        },

        /**
         * Store a successful Directory answer. Returns the absolute expiry time.
         * @returns {number}
         */
        set(userEmail, groupEmail, isMember) {
            const current = now();
            evictExpired(current);
            const member = isMember === true;
            const ttl = member ? positiveTtlMs : negativeTtlMs;
            const expiresAt = current + ttl;
            entries.set(membershipCacheKey(userEmail, groupEmail), {
                isMember: member,
                expiresAt
            });
            return expiresAt;
        },

        size() {
            return entries.size;
        }
    };
}
