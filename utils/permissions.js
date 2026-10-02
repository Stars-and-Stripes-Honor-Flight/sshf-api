/**
 * Phase 2 authorization roles.
 *
 * Group emails are configuration (AUTHZ_ROLE_*_GROUPS). Role ids and the
 * permission catalog are code. WRITE includes every READ permission. FULL
 * includes every WRITE permission. FULL does not include MEDICAL or REVIEW.
 *
 * Data routes still use the FULL group only (authorize). READ, WRITE,
 * MEDICAL, and REVIEW are resolved onto the user and are not enforced per
 * endpoint until Phase 3. ALLOWED_GROUP_EMAILS remains a deprecated alias
 * for AUTHZ_ROLE_FULL_GROUPS.
 */

export const ROLE_IDS = Object.freeze(['READ', 'WRITE', 'FULL', 'MEDICAL', 'REVIEW']);

export const ROLE_GROUP_ENV = Object.freeze({
    READ: 'AUTHZ_ROLE_READ_GROUPS',
    WRITE: 'AUTHZ_ROLE_WRITE_GROUPS',
    FULL: 'AUTHZ_ROLE_FULL_GROUPS',
    MEDICAL: 'AUTHZ_ROLE_MEDICAL_GROUPS',
    REVIEW: 'AUTHZ_ROLE_REVIEW_GROUPS'
});

const READ_PERMISSIONS = Object.freeze(['exports:read', 'records:read']);
const WRITE_ONLY_PERMISSIONS = Object.freeze(['records:write']);
const FULL_ONLY_PERMISSIONS = Object.freeze(['documents:admin', 'flights:manage', 'records:delete']);
const MEDICAL_PERMISSIONS = Object.freeze(['medical:read', 'medical:write']);
const REVIEW_PERMISSIONS = Object.freeze(['applications:accept', 'applications:review']);

export const ROLE_PERMISSIONS = Object.freeze({
    READ: READ_PERMISSIONS,
    WRITE: Object.freeze([...READ_PERMISSIONS, ...WRITE_ONLY_PERMISSIONS].sort()),
    FULL: Object.freeze([
        ...READ_PERMISSIONS,
        ...WRITE_ONLY_PERMISSIONS,
        ...FULL_ONLY_PERMISSIONS
    ].sort()),
    MEDICAL: MEDICAL_PERMISSIONS,
    REVIEW: REVIEW_PERMISSIONS
});

/** Existence checks: 3 attempts, with 4s then 8s backoff (about 15 seconds). */
export const GROUP_EXISTENCE_ATTEMPTS = 3;
export const GROUP_EXISTENCE_BACKOFF_MS = Object.freeze([4000, 8000]);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const KNOWN_ROLE_ENV = new Set(Object.values(ROLE_GROUP_ENV));
const DEPRECATED_FULL_ALIAS = 'ALLOWED_GROUP_EMAILS';

function isCloudRun(env) {
    return typeof env?.K_SERVICE === 'string' && env.K_SERVICE.trim() !== '';
}

function normalizeEmail(value) {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

/**
 * Split a comma-separated group list. Malformed tokens are reported and omitted.
 * Blank input is an empty list with no malformed tokens.
 */
function parseGroupEmails(raw, envVar) {
    const emails = [];
    const malformed = [];
    const seen = new Set();
    if (raw == null || String(raw).trim() === '') {
        return { emails, malformed };
    }
    for (const part of String(raw).split(',')) {
        const email = part.trim().toLowerCase();
        if (!email) {
            continue;
        }
        if (!EMAIL_PATTERN.test(email)) {
            malformed.push({ envVar, value: email });
            continue;
        }
        if (seen.has(email)) {
            continue;
        }
        seen.add(email);
        emails.push(email);
    }
    return { emails, malformed };
}

function rawIsUnset(raw) {
    if (raw == null) {
        return true;
    }
    return String(raw).split(',').every((part) => part.trim() === '');
}

function sameEmailSet(left, right) {
    if (left.length !== right.length) {
        return false;
    }
    const rightSet = new Set(right);
    return left.every((email) => rightSet.has(email));
}

function unknownRoleEnvVars(env) {
    const found = [];
    for (const key of Object.keys(env || {})) {
        if (!key.startsWith('AUTHZ_ROLE_') || !key.endsWith('_GROUPS')) {
            continue;
        }
        if (!KNOWN_ROLE_ENV.has(key)) {
            found.push(key);
        }
    }
    return found.sort();
}

function unknownRoleMessage(envVar) {
    return `${envVar} is not a recognized authorization role. ` +
        'Expected one of AUTHZ_ROLE_{READ,WRITE,FULL,MEDICAL,REVIEW}_GROUPS.';
}

function malformedMessage(entry) {
    return `${entry.envVar} contains a malformed group email: ${entry.value}`;
}

/**
 * Parse role-group configuration. Does not log. Callers decide whether a
 * problem fails startup (Cloud Run) or is a warning (local).
 */
export function describeRoleConfig(env = process.env) {
    const source = env || {};
    const malformed = [];
    const groupsByRole = {};
    for (const roleId of ROLE_IDS) {
        const envVar = ROLE_GROUP_ENV[roleId];
        const parsed = parseGroupEmails(source[envVar], envVar);
        groupsByRole[roleId] = parsed.emails;
        malformed.push(...parsed.malformed);
    }

    const allowedParsed = parseGroupEmails(source[DEPRECATED_FULL_ALIAS], DEPRECATED_FULL_ALIAS);
    const fullUnset = rawIsUnset(source[ROLE_GROUP_ENV.FULL]);
    const aliasProvided = !rawIsUnset(source[DEPRECATED_FULL_ALIAS]);
    const aliasUsed = fullUnset && aliasProvided;
    const aliasDiffers = !fullUnset && aliasProvided &&
        !sameEmailSet(groupsByRole.FULL, allowedParsed.emails);

    if (aliasUsed) {
        groupsByRole.FULL = allowedParsed.emails;
        malformed.push(...allowedParsed.malformed);
    }

    return {
        groupsByRole,
        unknownRoleEnvVars: unknownRoleEnvVars(source),
        malformed,
        aliasUsed,
        aliasDiffers
    };
}

export function getFullAccessGroupEmails(env = process.env) {
    return describeRoleConfig(env).groupsByRole.FULL;
}

export function listConfiguredGroupEntries(env = process.env) {
    const described = describeRoleConfig(env);
    const byEmail = new Map();
    for (const roleId of ROLE_IDS) {
        const envVar = described.aliasUsed && roleId === 'FULL'
            ? DEPRECATED_FULL_ALIAS
            : ROLE_GROUP_ENV[roleId];
        for (const email of described.groupsByRole[roleId]) {
            const existing = byEmail.get(email);
            if (!existing) {
                byEmail.set(email, { email, envVar });
                continue;
            }
            const names = existing.envVar.split(', ');
            if (!names.includes(envVar)) {
                existing.envVar = `${existing.envVar}, ${envVar}`;
            }
        }
    }
    return [...byEmail.values()];
}

export function startupWarnings(env = process.env) {
    const described = describeRoleConfig(env);
    const warnings = [];
    if (described.aliasUsed) {
        warnings.push(
            'ALLOWED_GROUP_EMAILS is deprecated and is being read as AUTHZ_ROLE_FULL_GROUPS. ' +
            'Set AUTHZ_ROLE_FULL_GROUPS instead.'
        );
    }
    if (described.aliasDiffers) {
        warnings.push(
            'AUTHZ_ROLE_FULL_GROUPS differs from ALLOWED_GROUP_EMAILS; AUTHZ_ROLE_FULL_GROUPS is used.'
        );
    }
    for (const envVar of described.unknownRoleEnvVars) {
        warnings.push(unknownRoleMessage(envVar));
    }
    for (const entry of described.malformed) {
        warnings.push(malformedMessage(entry));
    }
    return warnings;
}

/**
 * Fatal configuration problems. Empty off Cloud Run so local development can
 * omit the group list. On Cloud Run an unknown role, a malformed email, or
 * an empty FULL list (after the ALLOWED_GROUP_EMAILS alias) is fatal.
 */
export function cloudRunAuthorizationProblems(env = process.env) {
    if (!isCloudRun(env)) {
        return [];
    }
    const described = describeRoleConfig(env);
    const problems = [];
    for (const envVar of described.unknownRoleEnvVars) {
        problems.push(unknownRoleMessage(envVar));
    }
    for (const entry of described.malformed) {
        problems.push(malformedMessage(entry));
    }
    if (described.groupsByRole.FULL.length === 0) {
        problems.push(
            'AUTHZ_ROLE_FULL_GROUPS must be set when running on Cloud Run ' +
            '(ALLOWED_GROUP_EMAILS remains a deprecated alias)'
        );
    }
    return problems;
}

export function permissionsForRoles(roleIds) {
    const permissions = new Set();
    for (const roleId of Array.isArray(roleIds) ? roleIds : []) {
        const granted = ROLE_PERMISSIONS[roleId];
        if (!granted) {
            continue;
        }
        for (const permission of granted) {
            permissions.add(permission);
        }
    }
    return [...permissions].sort();
}

/**
 * Direct role ids for the groups this user belongs to. Inherited roles are
 * not listed: a WRITE member is ['WRITE'], not ['READ', 'WRITE']. Permissions
 * are the sorted union, including inheritance.
 */
export function resolveAccessFromMemberships(memberships, env = process.env) {
    const described = describeRoleConfig(env);
    const emails = new Set();
    for (const membership of Array.isArray(memberships) ? memberships : []) {
        const raw = typeof membership === 'string' ? membership : membership?.email;
        const email = normalizeEmail(raw);
        if (email) {
            emails.add(email);
        }
    }
    const roles = ROLE_IDS.filter((roleId) => (
        described.groupsByRole[roleId].some((groupEmail) => emails.has(groupEmail))
    )).sort();
    return {
        roles,
        permissions: permissionsForRoles(roles)
    };
}

function httpStatus(error) {
    const candidates = [error?.response?.status, error?.status, error?.code];
    for (const candidate of candidates) {
        const numeric = Number(candidate);
        if (Number.isInteger(numeric) && numeric >= 100 && numeric <= 599) {
            return numeric;
        }
    }
    return undefined;
}

function sleepMs(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function confirmOneGroup(entry, options) {
    const attempts = options.attempts ?? GROUP_EXISTENCE_ATTEMPTS;
    const backoffMs = options.backoffMs ?? GROUP_EXISTENCE_BACKOFF_MS;
    const sleep = options.sleep ?? sleepMs;
    let lastStatus;
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            await options.getGroup(entry.email);
            return;
        } catch (error) {
            const status = httpStatus(error);
            if (status === 404) {
                const notFound = new Error(
                    `${entry.envVar} group ${entry.email} was not found in Directory`
                );
                notFound.status = 404;
                notFound.code = 'GROUP_NOT_FOUND';
                throw notFound;
            }
            lastStatus = status;
            lastError = error;
            if (attempt < attempts) {
                const delay = backoffMs[attempt - 1] ?? backoffMs[backoffMs.length - 1] ?? 0;
                await sleep(delay);
            }
        }
    }
    const reason = lastStatus ? `status ${lastStatus}` : 'unreachable';
    const failure = new Error(
        `Directory group existence check failed for ${entry.envVar} group ${entry.email} ` +
        `after ${attempts} attempts (${reason})`
    );
    failure.status = lastStatus;
    failure.code = 'GROUP_CHECK_FAILED';
    failure.cause = lastError;
    throw failure;
}

/**
 * Confirm every configured group exists. 404 fails immediately. Transient
 * failures retry with backoff. getGroup is injected so tests do not call Directory.
 */
export async function confirmConfiguredGroupsExist(entries, options = {}) {
    if (!Array.isArray(entries) || entries.length === 0) {
        return;
    }
    if (typeof options.getGroup !== 'function') {
        throw new Error('getGroup is required to confirm authorization groups');
    }
    const results = await Promise.all(entries.map(async (entry) => {
        try {
            await confirmOneGroup(entry, options);
            return null;
        } catch (error) {
            return error;
        }
    }));
    const errors = results.filter(Boolean);
    if (errors.length === 0) {
        return;
    }
    const error = new Error(errors.map((item) => item.message).join('; '));
    error.status = errors.find((item) => item.status === 404)?.status ?? errors[0].status;
    error.code = errors.every((item) => item.code === 'GROUP_NOT_FOUND')
        ? 'GROUP_NOT_FOUND'
        : 'GROUP_CHECK_FAILED';
    throw error;
}
