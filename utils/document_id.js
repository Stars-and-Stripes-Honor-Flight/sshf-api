export const INVALID_DOCUMENT_ID_ERROR = 'Invalid document id';

/**
 * Validate a CouchDB document id and return a URL-encoded path segment.
 *
 * @param {unknown} id
 * @returns {{ encoded: string } | { error: string }}
 */
export function getEncodedDocumentIdSegment(id) {
    if (typeof id !== 'string' || id.length === 0) {
        return { error: INVALID_DOCUMENT_ID_ERROR };
    }
    if (id.startsWith('_')) {
        return { error: INVALID_DOCUMENT_ID_ERROR };
    }
    if (id === '..' || id.includes('/') || id.includes('\\')) {
        return { error: INVALID_DOCUMENT_ID_ERROR };
    }
    return { encoded: encodeURIComponent(id) };
}

/**
 * Build a CouchDB document URL from a base (`{dbUrl}/{dbName}`) and document id.
 *
 * @param {string} baseUrl
 * @param {unknown} id
 * @returns {{ url: string } | { error: string }}
 */
export function buildCouchDocumentUrl(baseUrl, id) {
    const segment = getEncodedDocumentIdSegment(id);
    if (segment.error) {
        return { error: segment.error };
    }
    return { url: `${baseUrl}/${segment.encoded}` };
}

/**
 * Build a CouchDB document URL or respond with 400 for an invalid id.
 *
 * @param {import('express').Response} res
 * @param {string} baseUrl
 * @param {unknown} id
 * @returns {string|null}
 */
export function buildCouchDocumentUrlOrRespond(res, baseUrl, id) {
    const built = buildCouchDocumentUrl(baseUrl, id);
    if (built.error) {
        res.status(400).json({ error: built.error });
        return null;
    }
    return built.url;
}
