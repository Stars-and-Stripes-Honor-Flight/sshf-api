export const SCRIPT_NAME = '2026-11-14-remove-loc-zipcode-docs';
export const name = SCRIPT_NAME;

export const LOC_START_KEY = 'loc-';
export const LOC_END_KEY = 'loc-\ufff0';
export const ALL_DOCS_PAGE_SIZE = 100;
export const SAMPLE_SIZE = 5;

const LOC_ID_PATTERN = /^loc-\d{5}$/;

export function looksLikeZipCodeDoc(document) {
    if (!document || typeof document._id !== 'string') {
        return false;
    }
    if (!LOC_ID_PATTERN.test(document._id)) {
        return false;
    }
    return document.type === 'Location';
}

export function buildDeletion(document) {
    return {
        _id: document._id,
        _rev: document._rev,
        _deleted: true
    };
}

function classifyLocRow(document) {
    if (!document || typeof document._id !== 'string' || !document._id.startsWith('loc-')) {
        return { action: 'ignore' };
    }
    if (!document._rev) {
        return { action: 'skip', id: document._id, reason: 'missing-rev' };
    }
    if (!LOC_ID_PATTERN.test(document._id)) {
        return { action: 'flag', id: document._id, reason: 'unexpected-id' };
    }
    if (document.type !== 'Location') {
        return { action: 'flag', id: document._id, reason: 'not-location' };
    }
    return { action: 'delete', document };
}

function buildSampleEntry(document, flagged) {
    if (flagged) {
        return {
            id: document._id,
            before: document,
            after: null,
            flagged: true
        };
    }
    return {
        id: document._id,
        before: document,
        after: buildDeletion(document),
        flagged: false
    };
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
    let startkey = LOC_START_KEY;

    while (true) {
        const query = {
            startkey,
            endkey: LOC_END_KEY,
            include_docs: true,
            limit: pageSize
        };
        if (startkey !== LOC_START_KEY) {
            query.skip = 1;
        }
        const page = await allDocs(query);
        const rows = Array.isArray(page?.rows) ? page.rows : [];
        for (const row of rows) {
            const document = row?.doc;
            const id = row?.id || document?._id;
            if (!id || !String(id).startsWith('loc-')) {
                continue;
            }
            matched += 1;
            if (!document) {
                skipped.push({ id, reason: 'missing-doc' });
                continue;
            }
            const classification = classifyLocRow(document);
            if (classification.action === 'ignore') {
                matched -= 1;
                continue;
            }
            if (classification.action === 'skip') {
                skipped.push({ id: classification.id, reason: classification.reason });
            } else if (classification.action === 'flag') {
                const entry = { id: classification.id, reason: classification.reason };
                flagged.push(entry);
                skipped.push(entry);
            } else {
                writes.push(buildDeletion(classification.document));
                originals.push(classification.document);
            }
            if (sample.length < sampleSize && document) {
                sample.push(buildSampleEntry(
                    document,
                    classification.action === 'flag'
                ));
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