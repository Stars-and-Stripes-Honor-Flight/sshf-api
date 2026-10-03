import { dbFetch, DatabaseSessionError, stableDatabaseError } from './db.js';

export const BULK_BATCH_SIZE = 100;

const SESSION_FAILURE = 'Database session error';

function databaseBase() {
    return `${process.env.DB_URL}/${process.env.DB_NAME}`;
}

function perDocumentStatus(errorName) {
    if (errorName === 'conflict') {
        return 409;
    }
    if (errorName === 'forbidden') {
        return 403;
    }
    if (errorName === 'unauthorized') {
        return 401;
    }
    return 500;
}

function perDocumentMessage(errorName) {
    if (errorName === 'conflict') {
        return 'Document update conflict.';
    }
    if (errorName === 'forbidden') {
        return 'Document update rejected.';
    }
    if (errorName === 'unauthorized') {
        return 'Document update unauthorized.';
    }
    return 'Document update failed.';
}

function failSession(docs, failed) {
    for (const doc of docs) {
        failed.push({ id: doc._id, status: 503, error: SESSION_FAILURE });
    }
}

function postBulk(req, batch) {
    return dbFetch(req, `${databaseBase()}/_bulk_docs`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ docs: batch })
    });
}

async function failWholeBatch(response, batch, failed) {
    const status = Number.isInteger(response.status) ? response.status : 500;
    let data = {};
    try {
        data = await response.json();
    } catch {
        data = {};
    }
    const error = stableDatabaseError('Bulk save failed.', data, status);
    for (const doc of batch) {
        failed.push({ id: doc._id, status, error });
    }
}

function recordResults(batch, results, saved, failed, retryConflicts) {
    const conflicts = [];
    if (!Array.isArray(results)) {
        for (const doc of batch) {
            failed.push({ id: doc._id, status: 500, error: 'Document update failed.' });
        }
        return conflicts;
    }

    for (let index = 0; index < batch.length; index += 1) {
        const doc = batch[index];
        const result = results[index] || { error: 'error' };
        const id = result.id || doc._id;
        if (result.ok) {
            saved.push({ id, rev: result.rev });
            continue;
        }
        if (result.error === 'conflict' && retryConflicts) {
            conflicts.push(doc);
            continue;
        }
        const status = perDocumentStatus(result.error);
        failed.push({
            id,
            status,
            error: stableDatabaseError(perDocumentMessage(result.error), result, status)
        });
    }
    return conflicts;
}

async function readConflictedDocs(req, docs) {
    const response = await dbFetch(req, `${databaseBase()}/_all_docs?include_docs=true`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ keys: docs.map((doc) => doc._id) })
    });
    if (!response.ok) {
        let data = {};
        try {
            data = await response.json();
        } catch {
            data = {};
        }
        const error = new Error(stableDatabaseError(
            'Failed to re-read conflicted documents',
            data,
            response.status
        ));
        error.statusCode = Number.isInteger(response.status) ? response.status : 500;
        throw error;
    }

    const data = await response.json();
    const byId = new Map();
    for (const row of data?.rows || []) {
        if (row?.doc && row.doc._id) {
            byId.set(row.doc._id, row.doc);
        }
    }
    return byId;
}

function applyDecision(decision, doc, fresh, saved, failed, skipped, retryDocs) {
    if (!decision || decision.action === 'skip') {
        skipped.push({ id: doc._id });
        return;
    }
    if (decision.action === 'ok') {
        saved.push({ id: doc._id, rev: fresh._rev });
        return;
    }
    if (decision.action === 'save' && decision.doc) {
        retryDocs.push(decision.doc);
        return;
    }
    if (decision.action === 'fail') {
        failed.push({
            id: doc._id,
            status: Number.isInteger(decision.status) ? decision.status : 500,
            error: decision.error || 'Document update failed.'
        });
        return;
    }
    failed.push({ id: doc._id, status: 500, error: 'Document update failed.' });
}

/**
 * Save documents with CouchDB _bulk_docs in batches of 100.
 * A conflict is re-read once. prepareRetry returns the document to save,
 * or { action: 'skip' | 'ok' | 'fail' }. A second conflict is a 409 failure.
 *
 * @param {object} req
 * @param {object[]} docs
 * @param {{ prepareRetry?: (freshDoc: object, originalDoc: object) => object }} [options]
 * @returns {Promise<{ saved: object[], failed: object[], skipped: object[] }>}
 */
export async function saveBulkDocs(req, docs, options = {}) {
    const saved = [];
    const failed = [];
    const skipped = [];
    if (!Array.isArray(docs) || docs.length === 0) {
        return { saved, failed, skipped };
    }

    const batches = [];
    for (let index = 0; index < docs.length; index += BULK_BATCH_SIZE) {
        batches.push(docs.slice(index, index + BULK_BATCH_SIZE));
    }

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const batch = batches[batchIndex];
        let response;
        try {
            response = await postBulk(req, batch);
        } catch (error) {
            if (error instanceof DatabaseSessionError) {
                for (let rest = batchIndex; rest < batches.length; rest += 1) {
                    failSession(batches[rest], failed);
                }
                break;
            }
            throw error;
        }

        if (!response.ok) {
            await failWholeBatch(response, batch, failed);
            continue;
        }

        let results;
        try {
            results = await response.json();
        } catch {
            for (const doc of batch) {
                failed.push({ id: doc._id, status: 500, error: 'Document update failed.' });
            }
            continue;
        }

        const conflicts = recordResults(batch, results, saved, failed, true);
        if (conflicts.length === 0) {
            continue;
        }

        let byId;
        try {
            byId = await readConflictedDocs(req, conflicts);
        } catch (error) {
            if (error instanceof DatabaseSessionError) {
                failSession(conflicts, failed);
                for (let rest = batchIndex + 1; rest < batches.length; rest += 1) {
                    failSession(batches[rest], failed);
                }
                break;
            }
            const status = Number.isInteger(error.statusCode) ? error.statusCode : 500;
            const message = error.message || 'Failed to re-read conflicted documents';
            for (const doc of conflicts) {
                failed.push({ id: doc._id, status, error: message });
            }
            continue;
        }

        const retryDocs = [];
        for (const doc of conflicts) {
            const fresh = byId.get(doc._id);
            if (!fresh) {
                failed.push({ id: doc._id, status: 404, error: 'Document not found.' });
                continue;
            }
            const decision = typeof options.prepareRetry === 'function'
                ? options.prepareRetry(fresh, doc)
                : { action: 'fail', status: 409, error: 'Document update conflict.' };
            applyDecision(decision, doc, fresh, saved, failed, skipped, retryDocs);
        }

        if (retryDocs.length === 0) {
            continue;
        }

        let retryResponse;
        try {
            retryResponse = await postBulk(req, retryDocs);
        } catch (error) {
            if (error instanceof DatabaseSessionError) {
                failSession(retryDocs, failed);
                for (let rest = batchIndex + 1; rest < batches.length; rest += 1) {
                    failSession(batches[rest], failed);
                }
                break;
            }
            throw error;
        }

        if (!retryResponse.ok) {
            await failWholeBatch(retryResponse, retryDocs, failed);
            continue;
        }

        let retryResults;
        try {
            retryResults = await retryResponse.json();
        } catch {
            for (const doc of retryDocs) {
                failed.push({ id: doc._id, status: 500, error: 'Document update failed.' });
            }
            continue;
        }
        recordResults(retryDocs, retryResults, saved, failed, false);
    }

    return { saved, failed, skipped };
}
