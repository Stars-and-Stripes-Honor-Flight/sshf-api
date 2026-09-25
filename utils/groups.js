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
 */
import { google } from 'googleapis';
import { isRunningOnCloudRun } from './auth.js';

/** Groups requested per Directory groups.list call. */
export const GROUP_LIST_PAGE_SIZE = 100;

/**
 * High cap on groups.list pages per user (GROUP_LIST_PAGE_SIZE each).
 * 20 pages covers 2,000 memberships, well above a single ignored page of 100.
 */
export const MAX_GROUP_LIST_PAGES = 20;

const DIRECTORY_GROUP_SCOPE = 'https://www.googleapis.com/auth/admin.directory.group.readonly';

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

function createDirectoryJwtAuth(env = process.env) {
    return new google.auth.JWT({
        email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
        scopes: [DIRECTORY_GROUP_SCOPE]
    });
}

function createDirectoryAdcAuth() {
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
        return [];
    };

    const tryJwt = async () => {
        console.log('Using service-account JWT for Directory group lookup');
        return listGroups(userData, createJwtAuth());
    };

    const tryAdc = async () => {
        console.log('Using Application Default Credentials for authentication');
        return listGroups(userData, createAdcAuth());
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
