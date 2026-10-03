/**
 * Phase 2 authorization roles.
 *
 * Group emails are configuration (AUTHZ_ROLE_*_GROUPS). Role ids and the
 * permission catalog are code. WRITE includes every READ permission. FULL
 * includes every WRITE permission. FULL does not include MEDICAL or REVIEW.
 *
 * Protected routes enforce these permissions with requirePermission
 * (ROUTE_PERMISSIONS). AUTHZ_ROLE_FULL_GROUPS is the only FULL source.
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

/**
 * Method + Express path → permissions required by requirePermission.
 * This is the source of truth for route registration, the router matrix,
 * and the OpenAPI x-required-permission check.
 *
 * FULL-only (confirmed for Phase 3 review): records:delete, documents:admin,
 * and flights:manage. REVIEW does not inherit those, and FULL does not
 * include applications:* or medical:*.
 */
export const ROUTE_PERMISSIONS = Object.freeze({
    'GET /search': Object.freeze(['records:read']),
    'POST /query': Object.freeze(['records:read']),
    'GET /docs/:id/revisions': Object.freeze(['records:read']),
    'GET /docs/:id/diff': Object.freeze(['records:read']),
    'POST /docs': Object.freeze(['documents:admin']),
    'GET /docs/:id': Object.freeze(['records:read']),
    'PUT /docs/:id': Object.freeze(['documents:admin']),
    'DELETE /docs/:id': Object.freeze(['documents:admin']),
    'POST /veterans': Object.freeze(['records:write']),
    'GET /veterans/search': Object.freeze(['records:read']),
    'GET /veterans/:id': Object.freeze(['records:read']),
    'PUT /veterans/:id': Object.freeze(['records:write']),
    'PATCH /veterans/:id/seat': Object.freeze(['records:write']),
    'PATCH /veterans/:id/bus': Object.freeze(['records:write']),
    'PATCH /veterans/:id/mail-call-received': Object.freeze(['records:write']),
    'PATCH /veterans/:id/mail-call-adopt': Object.freeze(['records:write']),
    'PATCH /veterans/:id/medical-form': Object.freeze(['records:write']),
    'PATCH /veterans/:id/medical-review': Object.freeze(['records:write']),
    'PATCH /veterans/:id/vaccinated': Object.freeze(['records:write']),
    'PATCH /veterans/:id/homecoming-destination': Object.freeze(['records:write']),
    'PATCH /veterans/:id/apparel-shirt-size': Object.freeze(['records:write']),
    'PATCH /veterans/:id/apparel-jacket-size': Object.freeze(['records:write']),
    'PATCH /veterans/:id/apparel-notes': Object.freeze(['records:write']),
    'DELETE /veterans/:id': Object.freeze(['records:delete']),
    'POST /guardians': Object.freeze(['records:write']),
    'GET /guardians/:id': Object.freeze(['records:read']),
    'PUT /guardians/:id': Object.freeze(['records:write']),
    'PATCH /guardians/:id/seat': Object.freeze(['records:write']),
    'PATCH /guardians/:id/bus': Object.freeze(['records:write']),
    'PATCH /guardians/:id/training-notes': Object.freeze(['records:write']),
    'PATCH /guardians/:id/training-complete': Object.freeze(['records:write']),
    'PATCH /guardians/:id/waiver': Object.freeze(['records:write']),
    'PATCH /guardians/:id/training-see-doc': Object.freeze(['records:write']),
    'PATCH /guardians/:id/vaccinated': Object.freeze(['records:write']),
    'PATCH /guardians/:id/medical-form': Object.freeze(['records:write']),
    'PATCH /guardians/:id/paid': Object.freeze(['records:write']),
    'PATCH /guardians/:id/books-ordered': Object.freeze(['records:write']),
    'PATCH /guardians/:id/apparel-shirt-size': Object.freeze(['records:write']),
    'PATCH /guardians/:id/apparel-jacket-size': Object.freeze(['records:write']),
    'PATCH /guardians/:id/apparel-notes': Object.freeze(['records:write']),
    'DELETE /guardians/:id': Object.freeze(['records:delete']),
    'GET /flights': Object.freeze(['records:read']),
    'POST /flights': Object.freeze(['flights:manage']),
    'GET /flights/:id': Object.freeze(['records:read']),
    'PUT /flights/:id': Object.freeze(['flights:manage']),
    'GET /flights/:id/assignments': Object.freeze(['records:read']),
    'POST /flights/:id/assignments': Object.freeze(['flights:manage']),
    'POST /flights/:id/complete': Object.freeze(['flights:manage']),
    'POST /flights/future-status/activate': Object.freeze(['flights:manage']),
    'GET /flights/:id/detail': Object.freeze(['records:read']),
    'GET /waitlist': Object.freeze(['records:read']),
    'GET /waitlist/veteran-groups': Object.freeze(['records:read']),
    'GET /recent-activity': Object.freeze(['records:read']),
    'GET /exports/flight': Object.freeze(['exports:read']),
    'GET /exports/callcenterfollowup': Object.freeze(['exports:read']),
    'GET /exports/tourlead': Object.freeze(['exports:read']),
    'GET /review/applications': Object.freeze(['applications:review']),
    'GET /review/applications/:id': Object.freeze(['applications:review']),
    'PUT /review/applications/:id': Object.freeze(['applications:review']),
    'PATCH /review/applications/:id/status': Object.freeze(['applications:review']),
    'POST /review/applications/:id/accept': Object.freeze(['applications:accept'])
});

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

    return {
        groupsByRole,
        unknownRoleEnvVars: unknownRoleEnvVars(source),
        malformed
    };
}

export function getFullAccessGroupEmails(env = process.env) {
    return describeRoleConfig(env).groupsByRole.FULL;
}

export function listConfiguredGroupEntries(env = process.env) {
    const described = describeRoleConfig(env);
    const byEmail = new Map();
    for (const roleId of ROLE_IDS) {
        const envVar = ROLE_GROUP_ENV[roleId];
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

export const DEV_OVERRIDE_ENV = 'AUTHZ_DEV_OVERRIDE_ROLES';

/**
 * Local-only role projection. Blank or missing is not configured.
 * Unknown tokens are reported and omitted. Inherited roles are not added:
 * FULL stays FULL, and permissionsForRoles applies WRITE/READ inheritance.
 */
export function describeDevOverride(env = process.env) {
    const raw = env?.[DEV_OVERRIDE_ENV];
    const configured = raw != null && String(raw).trim() !== '';
    const roles = [];
    const unknown = [];
    const seen = new Set();
    if (configured) {
        for (const part of String(raw).split(',')) {
            const roleId = part.trim().toUpperCase();
            if (!roleId) {
                continue;
            }
            if (!ROLE_IDS.includes(roleId)) {
                unknown.push(roleId);
                continue;
            }
            if (seen.has(roleId)) {
                continue;
            }
            seen.add(roleId);
            roles.push(roleId);
        }
    }
    roles.sort();
    return { configured, roles, unknown };
}

/**
 * Role ids to project for this process. Null when the override is unset or
 * when running on Cloud Run, where the variable is never honored.
 */
export function devOverrideRoles(env = process.env) {
    if (isCloudRun(env)) {
        return null;
    }
    const described = describeDevOverride(env);
    if (!described.configured) {
        return null;
    }
    return described.roles;
}

export function startupWarnings(env = process.env) {
    const described = describeRoleConfig(env);
    const warnings = [];
    for (const envVar of described.unknownRoleEnvVars) {
        warnings.push(unknownRoleMessage(envVar));
    }
    for (const entry of described.malformed) {
        warnings.push(malformedMessage(entry));
    }
    if (!isCloudRun(env)) {
        const override = describeDevOverride(env);
        if (override.configured) {
            warnings.push(
                'AUTHZ_DEV_OVERRIDE_ROLES is a local-only authorization override. ' +
                'Do not set it on Cloud Run.'
            );
            for (const roleId of override.unknown) {
                warnings.push(`AUTHZ_DEV_OVERRIDE_ROLES contains an unknown role: ${roleId}`);
            }
        }
    }
    return warnings;
}

/**
 * Fatal configuration problems. Empty off Cloud Run so local development can
 * omit the group list. On Cloud Run an unknown role, a malformed email, or
 * an empty AUTHZ_ROLE_FULL_GROUPS list is fatal.
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
            'AUTHZ_ROLE_FULL_GROUPS must be set when running on Cloud Run'
        );
    }
    if (describeDevOverride(env).configured) {
        problems.push(
            'AUTHZ_DEV_OVERRIDE_ROLES must not be set when running on Cloud Run'
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
