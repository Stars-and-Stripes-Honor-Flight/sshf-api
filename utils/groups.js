/**
 * Choose how to authenticate Admin SDK group lookups.
 *
 * Cloud Run uses Application Default Credentials (the runtime service account).
 * Locally, gcloud user ADC is often present but unusable for Directory API
 * (expired reauth / invalid_rapt, or missing scopes). Prefer the explicit
 * service-account JWT from env, and fall back to it after any ADC failure.
 * When every local attempt fails, return no roles so API testing can continue
 * to CouchDB. Cloud Run (K_SERVICE) still throws so authenticate returns 503
 * instead of treating an Admin SDK outage as an empty allow-list miss.
 *
 * Authorization groups are the emails in AUTHZ_ROLE_*_GROUPS. Membership is
 * members.hasMember, which is true for direct and nested members. The API
 * does not call groups.list. Positive answers are cached for up to
 * USER_CACHE_TTL_MS. Negative answers are cached for about 2 minutes.
 * Directory errors are not cached. Startup still confirms configured groups
 * with groups.get.
 */
import { google } from 'googleapis';
import { isRunningOnCloudRun } from './auth.js';
import { confirmConfiguredGroupsExist } from './permissions.js';
import {
    createMembershipCache,
    POSITIVE_MEMBERSHIP_TTL_MS
} from './membership_cache.js';

const DIRECTORY_GROUP_SCOPE = 'https://www.googleapis.com/auth/admin.directory.group.readonly';

/** Per-call limit for members.hasMember before the lookup is treated as unavailable. */
export const HAS_MEMBER_TIMEOUT_MS = 5000;

const defaultMembershipCache = createMembershipCache();

/** Admin SDK group lookup failed after every configured credential attempt. */
export class DirectoryGroupsUnavailableError extends Error {
    constructor(message, options = {}) {
        super(message);
        this.name = 'DirectoryGroupsUnavailableError';
        if (options.cause) {
            this.cause = options.cause;
        }
    }
}

export function hasServiceAccountJwtConfig(env = process.env) {
    return Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);
}

export function shouldPreferServiceAccountJwt(env = process.env) {
    return hasServiceAccountJwtConfig(env) && !env.K_SERVICE;
}

export function shouldFallbackToServiceAccountJwt(error, env = process.env) {
    return Boolean(error) && hasServiceAccountJwtConfig(env);
}

function logGroupFetchError(label, error) {
    console.error(`${label}:`, error.message);
    if (error.response) {
        console.error('Error details:', {
            status: error.response.status,
            data: error.response.data
        });
    }
}

export function createDirectoryJwtAuth(env = process.env) {
    return new google.auth.JWT({
        email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
        scopes: [DIRECTORY_GROUP_SCOPE]
    });
}

export function createDirectoryAdcAuth() {
    return new google.auth.GoogleAuth({
        scopes: [DIRECTORY_GROUP_SCOPE]
    });
}

function normalizeEmail(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function normalizeGroupList(groupEmails) {
    const seen = new Set();
    const normalized = [];
    for (const entry of Array.isArray(groupEmails) ? groupEmails : []) {
        const email = normalizeEmail(entry);
        if (!email || seen.has(email)) {
            continue;
        }
        seen.add(email);
        normalized.push(email);
    }
    return normalized;
}

function directoryStatus(error) {
    const candidates = [error?.response?.status, error?.status, error?.code];
    for (const candidate of candidates) {
        const numeric = Number(candidate);
        if (Number.isInteger(numeric) && numeric >= 100 && numeric <= 599) {
            return numeric;
        }
    }
    return undefined;
}

function withTimeout(promise, timeoutMs) {
    let timer;
    let settled = false;
    return new Promise((resolve, reject) => {
        const finish = (settle, value) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timer);
            settle(value);
        };
        timer = setTimeout(() => {
            const error = new Error(`Directory membership lookup timed out after ${timeoutMs}ms`);
            error.code = 'ETIMEDOUT';
            finish(reject, error);
        }, timeoutMs);
        Promise.resolve(promise).then(
            (value) => finish(resolve, value),
            (error) => finish(reject, error)
        );
    });
}

/**
 * Run a Directory operation with the same JWT / ADC fallback as group listing.
 * On Cloud Run, exhaustion throws DirectoryGroupsUnavailableError. Off Cloud
 * Run, onLocalFailure() is returned so local development can continue.
 */
async function withDirectoryAuth(env, options, operation, onLocalFailure) {
    const createJwtAuth = options.createJwtAuth ?? (() => createDirectoryJwtAuth(env));
    const createAdcAuth = options.createAdcAuth ?? createDirectoryAdcAuth;
    const propagate = (error) => {
        if (options.passthroughError?.(error)) {
            throw error;
        }
    };

    const unavailable = (error) => new DirectoryGroupsUnavailableError(
        error?.message || 'Directory group lookup failed',
        { cause: error }
    );

    const giveUp = (error) => {
        logGroupFetchError('Error fetching groups', error);
        if (isRunningOnCloudRun(env)) {
            throw unavailable(error);
        }
        console.warn(
            'Local Directory group lookup failed; continuing without Workspace roles. ' +
            'On Cloud Run this failure returns 503.'
        );
        return onLocalFailure();
    };

    const tryJwt = async () => {
        console.log('Using service-account JWT for Directory group lookup');
        return operation(createJwtAuth());
    };

    const tryAdc = async () => {
        console.log('Using Application Default Credentials for authentication');
        return operation(createAdcAuth());
    };

    if (shouldPreferServiceAccountJwt(env)) {
        try {
            return await tryJwt();
        } catch (error) {
            propagate(error);
            logGroupFetchError('JWT group fetch failed, trying ADC', error);
            try {
                return await tryAdc();
            } catch (adcError) {
                propagate(adcError);
                return giveUp(adcError);
            }
        }
    }

    try {
        return await tryAdc();
    } catch (error) {
        propagate(error);
        if (shouldFallbackToServiceAccountJwt(error, env)) {
            console.log('ADC authentication failed, falling back to JWT with env vars:', error.message);
            try {
                return await tryJwt();
            } catch (jwtError) {
                propagate(jwtError);
                return giveUp(jwtError);
            }
        }

        return giveUp(error);
    }
}

/**
 * Resolve group memberships, falling back between JWT and ADC.
 * A successful response with no groups returns [].
 *
 * On Cloud Run, an Admin SDK failure after credential fallbacks throws
 * DirectoryGroupsUnavailableError so authenticate returns 503 instead of an
 * empty role list. Off Cloud Run, that same exhaustion returns no memberships:
 * gcloud user ADC is often unusable for Directory, and local development
 * without K_SERVICE may omit AUTHZ_ROLE_FULL_GROUPS so the request can still
 * reach CouchDB. A configured local role list still fail-closes on those
 * empty roles.
 */

/**
 * Check one Workspace group with members.hasMember.
 * True covers direct members and members of nested groups. A missing group
 * (404) or invalid nesting input (400) is not a member. Permission, server,
 * network, and timeout failures throw DirectoryGroupsUnavailableError and
 * must not be cached.
 *
 * @param {string} userEmail
 * @param {string} groupEmail
 * @param {object} auth Directory client auth
 * @param {{createAdmin?: Function, timeoutMs?: number, groupEnvVar?: string}} [options]
 * @returns {Promise<{isMember: boolean}>}
 */
export async function checkGroupMembership(userEmail, groupEmail, auth, options = {}) {
    const createAdmin = options.createAdmin
        ?? ((directoryAuth) => google.admin({ version: 'directory_v1', auth: directoryAuth }));
    const admin = createAdmin(auth);
    const timeoutMs = options.timeoutMs ?? HAS_MEMBER_TIMEOUT_MS;
    const groupEnvVar = options.groupEnvVar ?? 'AUTHZ_ROLE_FULL_GROUPS';

    try {
        const response = await withTimeout(
            admin.members.hasMember({
                groupKey: groupEmail,
                memberKey: userEmail
            }, { timeout: timeoutMs }),
            timeoutMs
        );
        return { isMember: response?.data?.isMember === true };
    } catch (error) {
        const status = directoryStatus(error);
        if (status === 404) {
            console.error(
                `${groupEnvVar} group ${groupEmail} was not found in Directory; treating membership as false`
            );
            return { isMember: false };
        }
        if (status === 400) {
            console.warn(
                `Directory members.hasMember returned 400 for group ${groupEmail} ` +
                `(user ${userEmail}); treating membership as false`
            );
            return { isMember: false };
        }
        const reason = error?.code === 'ETIMEDOUT'
            ? 'timeout'
            : (status ? `status ${status}` : 'network');
        throw new DirectoryGroupsUnavailableError(
            `Directory membership lookup unavailable (${reason})`,
            { cause: error }
        );
    }
}

/**
 * Resolve membership in the configured authorization groups.
 * An empty list skips Directory. Otherwise each uncached group is checked
 * with members.hasMember, which covers direct and nested members.
 *
 * @param {{email: string}} userData
 * @param {string[]} groupEmails Authorization groups. Empty skips Directory.
 * @param {object} [options]
 * @returns {Promise<{groups: object[], userCacheTtlMs: number}>}
 */
export async function resolveAuthorizationGroups(userData, groupEmails, options = {}) {
    const env = options.env ?? process.env;
    const configured = normalizeGroupList(groupEmails);
    const membershipCache = options.membershipCache ?? defaultMembershipCache;
    const now = options.now ?? Date.now;

    if (configured.length === 0) {
        return { groups: [], userCacheTtlMs: POSITIVE_MEMBERSHIP_TTL_MS };
    }

    const current = now();
    const userEmail = userData.email;
    const known = [];
    const pending = [];

    for (const groupEmail of configured) {
        const cached = membershipCache.get(userEmail, groupEmail);
        if (cached) {
            known.push({
                groupEmail,
                isMember: cached.isMember,
                expiresAt: cached.expiresAt
            });
            continue;
        }
        pending.push(groupEmail);
    }

    let checked = [];
    if (pending.length > 0) {
        const checkMembership = options.checkMembership
            ?? ((email, groupEmail, auth) => checkGroupMembership(email, groupEmail, auth, {
                createAdmin: options.createAdmin,
                timeoutMs: options.timeoutMs,
                groupEnvVar: options.groupEnvVars?.[groupEmail] ?? options.groupEnvVar
            }));
        const lookedUp = await withDirectoryAuth(
            env,
            options,
            (auth) => Promise.all(pending.map(async (groupEmail) => {
                const result = await checkMembership(userEmail, groupEmail, auth);
                return { groupEmail, isMember: result?.isMember === true };
            })),
            () => null
        );
        if (lookedUp === null) {
            return { groups: [], userCacheTtlMs: POSITIVE_MEMBERSHIP_TTL_MS };
        }
        checked = lookedUp;
    }

    return assembleMembershipResult({
        userEmail,
        configured,
        known,
        checked,
        membershipCache,
        current
    });
}

function assembleMembershipResult({
    userEmail,
    configured,
    known,
    checked,
    membershipCache,
    current
}) {
    const outcome = new Map();
    let earliest = current + POSITIVE_MEMBERSHIP_TTL_MS;

    for (const item of known) {
        earliest = Math.min(earliest, item.expiresAt);
        outcome.set(item.groupEmail, item.isMember);
    }

    for (const item of checked) {
        const expiresAt = membershipCache.set(userEmail, item.groupEmail, item.isMember);
        earliest = Math.min(earliest, expiresAt);
        outcome.set(item.groupEmail, item.isMember);
    }

    const groups = [];
    for (const groupEmail of configured) {
        if (outcome.get(groupEmail) === true) {
            groups.push({ email: groupEmail });
        }
    }

    const userCacheTtlMs = Math.min(
        POSITIVE_MEMBERSHIP_TTL_MS,
        Math.max(0, earliest - current)
    );
    return { groups, userCacheTtlMs };
}

/**
 * Startup existence check for configured role groups. Inject getGroup in tests.
 * Otherwise one Directory client calls groups.get, with the same JWT / ADC
 * fallback as membership lookup. A missing group (404) is not retried as an
 * outage and is not swallowed on a local run.
 */
export async function ensureAuthorizationGroupsExist(entries, options = {}) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return;
    }
    if (typeof options.getGroup === 'function') {
        return confirmConfiguredGroupsExist(entries, options);
    }

    const env = options.env ?? process.env;
    const createAdmin = options.createAdmin
        ?? ((directoryAuth) => google.admin({ version: 'directory_v1', auth: directoryAuth }));
    const passthroughError = (error) => (
        error?.code === 'GROUP_NOT_FOUND' || error?.code === 'GROUP_CHECK_FAILED'
    );

    await withDirectoryAuth(
        env,
        { ...options, passthroughError },
        async (auth) => {
            const admin = createAdmin(auth);
            await confirmConfiguredGroupsExist(entries, {
                attempts: options.attempts,
                backoffMs: options.backoffMs,
                sleep: options.sleep,
                getGroup: (email) => admin.groups.get({ groupKey: email })
            });
        },
        () => {
            throw new DirectoryGroupsUnavailableError('Directory group existence check failed');
        }
    );
}
