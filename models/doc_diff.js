/**
 * Document revision listing and JSON diff helpers for CouchDB history.
 */

export const COMPACTION_WARNING = 'Older revisions were removed by database compaction.';

const REV_ALIASES = new Set(['current', 'previous']);
const REV_PATTERN = /^[1-9][0-9]*-[a-fA-F0-9]+$/;
const IGNORED_DIFF_KEYS = new Set(['_rev']);

export class DocDiffError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = 'DocDiffError';
        this.status = status;
    }
}

function normalizeRevParam(value) {
    if (value === undefined || value === null) {
        return undefined;
    }
    const trimmed = String(value).trim();
    return trimmed === '' ? undefined : trimmed;
}

function assertValidRevParam(value, field) {
    if (value === undefined || REV_ALIASES.has(value) || REV_PATTERN.test(value)) {
        return;
    }
    throw new DocDiffError(`Invalid ${field} revision: ${value}`, 400);
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function compactionWarning(revisions) {
    if (revisions.some((revision) => revision.status === 'missing')) {
        return COMPACTION_WARNING;
    }
    return undefined;
}

export class DocDiffRequest {
    constructor(query = {}) {
        this.from = normalizeRevParam(query.from);
        this.to = normalizeRevParam(query.to);
        assertValidRevParam(this.from, 'from');
        assertValidRevParam(this.to, 'to');
    }
}

export function buildRevisionList(doc) {
    const revisions = Array.isArray(doc._revs_info) ? doc._revs_info : [];
    const result = {
        id: doc._id,
        currentRev: doc._rev,
        revisions,
        availableCount: revisions.filter((revision) => revision.status === 'available').length
    };

    const warning = compactionWarning(revisions);
    if (warning) {
        result.warning = warning;
    }

    return result;
}

export function resolveRevisionPair(revsInfo, fromParam, toParam) {
    if (!Array.isArray(revsInfo) || revsInfo.length === 0) {
        throw new DocDiffError('Document revision history is not available', 400);
    }

    const available = revsInfo.filter((revision) => revision.status === 'available');
    if (available.length === 0) {
        throw new DocDiffError('No available revisions found for this document', 404);
    }

    const resolveOne = (param, defaultAlias) => {
        const requested = param === undefined ? defaultAlias : param;

        if (requested === 'current') {
            return available[0];
        }

        if (requested === 'previous') {
            if (available.length < 2) {
                throw new DocDiffError('No previous available revision exists for this document', 400);
            }
            return available[1];
        }

        const match = revsInfo.find((revision) => revision.rev === requested);
        if (!match) {
            throw new DocDiffError(`Revision ${requested} was not found for this document`, 404);
        }
        if (match.status !== 'available') {
            throw new DocDiffError(
                `Revision ${requested} is ${match.status} and cannot be retrieved. Older revisions are removed by database compaction.`,
                404
            );
        }
        return match;
    };

    const from = resolveOne(fromParam, 'previous');
    const to = resolveOne(toParam, 'current');

    if (from.rev === to.rev) {
        throw new DocDiffError('from and to revisions must be different', 400);
    }

    const pair = { from, to };
    const warning = compactionWarning(revsInfo);
    if (warning) {
        pair.warning = warning;
    }
    return pair;
}

function walkDiff(fromVal, toVal, path, changes) {
    if (Object.is(fromVal, toVal)) {
        return;
    }

    if (Array.isArray(fromVal) && Array.isArray(toVal)) {
        const length = Math.max(fromVal.length, toVal.length);
        for (let index = 0; index < length; index += 1) {
            const childPath = `${path}[${index}]`;
            if (index >= fromVal.length) {
                changes.push({ path: childPath, op: 'add', to: toVal[index] });
            } else if (index >= toVal.length) {
                changes.push({ path: childPath, op: 'remove', from: fromVal[index] });
            } else {
                walkDiff(fromVal[index], toVal[index], childPath, changes);
            }
        }
        return;
    }

    if (isPlainObject(fromVal) && isPlainObject(toVal)) {
        const keys = new Set([...Object.keys(fromVal), ...Object.keys(toVal)]);
        for (const key of keys) {
            if (IGNORED_DIFF_KEYS.has(key)) {
                continue;
            }
            const childPath = path ? `${path}.${key}` : key;
            if (!Object.prototype.hasOwnProperty.call(fromVal, key)) {
                changes.push({ path: childPath, op: 'add', to: toVal[key] });
            } else if (!Object.prototype.hasOwnProperty.call(toVal, key)) {
                changes.push({ path: childPath, op: 'remove', from: fromVal[key] });
            } else {
                walkDiff(fromVal[key], toVal[key], childPath, changes);
            }
        }
        return;
    }

    changes.push({ path, op: 'replace', from: fromVal, to: toVal });
}

export function diffDocuments(fromDoc, toDoc) {
    const changes = [];
    walkDiff(fromDoc ?? {}, toDoc ?? {}, '', changes);
    return changes;
}

export function buildDiffResponse(docId, pair, fromDoc, toDoc) {
    const result = {
        id: docId,
        from: pair.from,
        to: pair.to,
        changes: diffDocuments(fromDoc, toDoc),
        fromDoc,
        toDoc
    };

    if (pair.warning) {
        result.warning = pair.warning;
    }

    return result;
}
