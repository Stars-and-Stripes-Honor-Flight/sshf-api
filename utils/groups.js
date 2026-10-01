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
 * groups.list is paged. Each request uses GROUP_LIST_PAGE_SIZE (100), the
 * historical page size, which is within the Admin SDK maximum of 200.
 * Lookup follows nextPageToken until the user has no further pages or
 * MAX_GROUP_LIST_PAGES pages have been read (2,000 memberships). That cap
 * stops a stuck page token from looping. Membership past the cap is not
 * visible to authorization.
 *
 * Configured authorization groups (ALLOWED_GROUP_EMAILS in Phase 1) are also
 * checked with members.hasMember, which is true for direct and nested members.
 * A configured group already present in the direct list skips that call.
 * Positive answers are cached for up to USER_CACHE_TTL_MS. Negative answers
 * are cached for about 2 minutes. Directory errors are not cached.
 */
import { google } from 'googleapis';
import { isRunningOnCloudRun } from './auth.js';
import {
    createMembershipCache,
    POSITIVE_MEMBERSHIP_TTL_MS
} from './membership_cache.js';

/** Groups requested per Directory groups.list call. */
export const GROUP_LIST_PAGE_SIZE = 100;

/**
 * High cap on groups.list pages per user (GROUP_LIST_PAGE_SIZE each).
 * 20 pages covers 2,000 memberships, well above a single ignored page of 100.
 */
export const MAX_GROUP_LIST_PAGES = 20;

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

/**
 * Follow nextPageToken until groups are exhausted or maxPages is reached.
 * fetchPage receives the current page token (undefined on the first page)
 * and returns the groups.list response body.
 */
export async function collectPagedGroups(fetchPage, { maxPages = MAX_GROUP_LIST_PAGES } = {}) {
    const groups = [];
    let pageToken;

    for (let page = 0; page < maxPages; page += 1) {
        const data = await fetchPage(pageToken);
        const pageGroups = Array.isArray(data?.groups) ? data.groups : [];
        groups.push(...pageGroups);
        if (!data?.nextPageToken) {
            return groups;
        }
        pageToken = data.nextPageToken;
    }

    console.warn(
        `Directory group lookup stopped after ${maxPages} pages ` +
        `(${GROUP_LIST_PAGE_SIZE} groups per page; membership beyond this cap is ignored)`
    );
    return groups;
}

/**
 * List every Workspace group for a user, following nextPageToken.
 *
 * @param {{email: string}} userData
 * @param {object} auth Directory client auth
 * @param {{createAdmin?: Function, maxPages?: number}} [options]
 */
export async function listGroupsForUser(userData, auth, options = {}) {
    const createAdmin = options.createAdmin
        ?? ((directoryAuth) => google.admin({ version: 'directory_v1', auth: directoryAuth }));
    const admin = createAdmin(auth);
    const domain = userData.email.split('@')[1];

    return collectPagedGroups(async (pageToken) => {
        const response = await admin.groups.list({
            userKey: userData.email,
            domain,
            maxResults: GROUP_LIST_PAGE_SIZE,
            ...(pageToken ? { pageToken } : {})
        });
        return response.data || {};
    }, { maxPages: options.maxPages });
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
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const error = new Error(`Directory membership lookup timed out after ${timeoutMs}ms`);
            error.code = 'ETIMEDOUT';
            reject(error);
        }, timeoutMs);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Run a Directory operation with the same JWT / ADC fallback as group listing.
 * On Cloud Run, exhaustion throws DirectoryGroupsUnavailableError. Off Cloud
 * Run, onLocalFailure() is returned so local development can continue.
 */
async function withDirectoryAuth(env, options, operation, onLocalFailure) {
    const createJwtAuth = options.createJwtAuth ?? (() => createDirectoryJwtAuth(env));
    const createAdcAuth = options.createAdcAuth ?? createDirectoryAdcAuth;

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
            logGroupFetchError('JWT group fetch failed, trying ADC', error);
            try {
                return await tryAdc();
            } catch (adcError) {
                return giveUp(adcError);
            }
        }
    }

    try {
        return await tryAdc();
    } catch (error) {
        if (shouldFallbackToServiceAccountJwt(error, env)) {
            console.log('ADC authentication failed, falling back to JWT with env vars:', error.message);
            try {
                return await tryJwt();
            } catch (jwtError) {
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
 * empty role list. Off Cloud Run, that same exhaustion returns []: gcloud
 * user ADC is often unusable for Directory, and local development without
 * K_SERVICE may omit ALLOWED_GROUP_EMAILS so the request can still reach
 * CouchDB. A configured local allow-list still fail-closes on those empty roles.
 */
export async function getGroupMemberships(userData, options = {}) {
    const env = options.env ?? process.env;
    const listGroups = options.listGroups
        ?? ((data, auth) => listGroupsForUser(data, auth, options));
    return withDirectoryAuth(
        env,
        options,
        (auth) => listGroups(userData, auth),
        () => []
    );
}

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
    const groupEnvVar = options.groupEnvVar ?? 'ALLOWED_GROUP_EMAILS';

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
 * Merge direct groups.list results with members.hasMember for configured groups.
 * Phase 2 can pass the role-group union here without changing the check itself.
 *
 * @param {{email: string}} userData
 * @param {string[]} groupEmails Authorization groups. Empty skips hasMember.
 * @param {object} [options]
 * @returns {Promise<{groups: object[], userCacheTtlMs: number}>}
 */
export async function resolveAuthorizationGroups(userData, groupEmails, options = {}) {
    const env = options.env ?? process.env;
    const configured = normalizeGroupList(groupEmails);
    const listGroups = options.listGroups
        ?? ((data, auth) => listGroupsForUser(data, auth, options));
    const checkMembership = options.checkMembership
        ?? ((userEmail, groupEmail, auth) => checkGroupMembership(userEmail, groupEmail, auth, {
            createAdmin: options.createAdmin,
            timeoutMs: options.timeoutMs,
            groupEnvVar: options.groupEnvVar
        }));
    const membershipCache = options.membershipCache ?? defaultMembershipCache;
    const now = options.now ?? Date.now;

    if (configured.length === 0) {
        const groups = await getGroupMemberships(userData, {
            ...options,
            env,
            listGroups
        });
        return { groups, userCacheTtlMs: POSITIVE_MEMBERSHIP_TTL_MS };
    }

    return withDirectoryAuth(
        env,
        options,
        (auth) => mergeAuthorizationGroups({
            userData,
            configured,
            auth,
            listGroups,
            checkMembership,
            membershipCache,
            now
        }),
        () => ({ groups: [], userCacheTtlMs: POSITIVE_MEMBERSHIP_TTL_MS })
    );
}

async function mergeAuthorizationGroups({
    userData,
    configured,
    auth,
    listGroups,
    checkMembership,
    membershipCache,
    now
}) {
    const directList = await listGroups(userData, auth);
    const directByEmail = new Map();
    for (const group of directList) {
        const email = normalizeEmail(group?.email);
        if (email && !directByEmail.has(email)) {
            directByEmail.set(email, group);
        }
    }

    const current = now();
    const userEmail = userData.email;
    const known = [];
    const pending = [];

    for (const groupEmail of configured) {
        if (directByEmail.has(groupEmail)) {
            known.push({ groupEmail, isMember: true, direct: true });
            continue;
        }
        const cached = membershipCache.get(userEmail, groupEmail);
        if (cached) {
            known.push({
                groupEmail,
                isMember: cached.isMember,
                expiresAt: cached.expiresAt,
                cached: true
            });
            continue;
        }
        pending.push(groupEmail);
    }

    const checked = await Promise.all(pending.map(async (groupEmail) => {
        const result = await checkMembership(userEmail, groupEmail, auth);
        return { groupEmail, isMember: result?.isMember === true };
    }));

    const outcome = new Map();
    let earliest = current + POSITIVE_MEMBERSHIP_TTL_MS;

    for (const item of known) {
        if (item.direct) {
            const expiresAt = membershipCache.set(userEmail, item.groupEmail, true);
            earliest = Math.min(earliest, expiresAt);
            outcome.set(item.groupEmail, true);
            continue;
        }
        earliest = Math.min(earliest, item.expiresAt);
        outcome.set(item.groupEmail, item.isMember);
    }

    for (const item of checked) {
        const expiresAt = membershipCache.set(userEmail, item.groupEmail, item.isMember);
        earliest = Math.min(earliest, expiresAt);
        outcome.set(item.groupEmail, item.isMember);
    }

    const configuredSet = new Set(configured);
    const groups = directList.map((group) => {
        const email = normalizeEmail(group?.email);
        if (email && configuredSet.has(email)) {
            return { ...group, membership: 'direct' };
        }
        return group;
    });

    for (const groupEmail of configured) {
        if (directByEmail.has(groupEmail)) {
            continue;
        }
        if (outcome.get(groupEmail) === true) {
            groups.push({ email: groupEmail, membership: 'nested' });
        }
    }

    const userCacheTtlMs = Math.min(
        POSITIVE_MEMBERSHIP_TTL_MS,
        Math.max(0, earliest - current)
    );
    return { groups, userCacheTtlMs };
}
