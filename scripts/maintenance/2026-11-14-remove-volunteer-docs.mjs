export const SCRIPT_NAME = '2026-11-14-remove-volunteer-docs';
export const name = SCRIPT_NAME;

export const ALL_DOCS_PAGE_SIZE = 100;
export const SAMPLE_SIZE = 5;

export function isVolunteerDoc(document) {
    if (!document || typeof document._id !== 'string') {
        return false;
    }
    if (document._id.startsWith('_design/')) {
        return false;
    }
    return document.type === 'Volunteer';
}

export function buildDeletion(document) {
    return {
        _id: document._id,
        _rev: document._rev,
        _deleted: true
    };
}

function buildSampleEntry(document, skipped = false) {
    return {
        id: document._id,
        before: document,
        after: skipped ? null : buildDeletion(document),
        flagged: false
    };
}

function classifyVolunteerRow(document) {
    if (!document || typeof document._id !== 'string') {
        return { action: 'ignore' };
    }
    if (document._id.startsWith('_design/')) {
        return { action: 'ignore' };
    }
    if (document.type !== 'Volunteer') {
        return { action: 'ignore' };
    }
    if (!document._rev) {
        return { action: 'skip', id: document._id, reason: 'missing-rev' };
    }
    return { action: 'delete', document };
}

export async function plan({
    allDocs,
    pageSize = ALL_DOCS_PAGE_SIZE,
    sampleSize = SAMPLE_SIZE
} = {}) {
    if (typeof allDocs !== 'function') {
        throw new Error('plan requires allDocs');
    }

    const writes = [];
    const originals = [];
    const skipped = [];
    const flagged = [];
    const sample = [];
    let matched = 0;
    let startkey;

    while (true) {
        const query = {
            include_docs: true,
            limit: pageSize
        };
        if (startkey !== undefined) {
            query.startkey = startkey;
            query.skip = 1;
        }
        const page = await allDocs(query);
        const rows = Array.isArray(page?.rows) ? page.rows : [];
        for (const row of rows) {
            const document = row?.doc;
            const id = row?.id || document?._id;
            if (!id || String(id).startsWith('_design/')) {
                continue;
            }
            if (!document) {
                continue;
            }
            const classification = classifyVolunteerRow(document);
            if (classification.action === 'ignore') {
                continue;
            }
            matched += 1;
            if (classification.action === 'skip') {
                skipped.push({ id: classification.id, reason: classification.reason });
                if (sample.length < sampleSize) {
                    sample.push(buildSampleEntry(document, true));
                }
            } else {
                writes.push(buildDeletion(classification.document));
                originals.push(classification.document);
                if (sample.length < sampleSize) {
                    sample.push(buildSampleEntry(classification.document, false));
                }
            }
        }

        if (rows.length < pageSize) {
            break;
        }
        const lastId = rows[rows.length - 1]?.id;
        if (!lastId) {
            break;
        }
        startkey = lastId;
    }

    return {
        matched,
        writes,
        originals,
        skipped,
        flagged,
        sample
    };
}

export default { name, plan };