import { Flight } from './flight.js';
import { Guardian } from './guardian.js';
import { Veteran } from './veteran.js';
import { getEncodedDocumentIdSegment } from '../utils/document_id.js';

/** Logistics document types this API is allowed to store through `/docs`. */
export const ALLOWED_DOCUMENT_TYPES = Object.freeze(['Flight', 'Guardian', 'Veteran']);

/**
 * CouchDB design-document members. These are never taken from a client body.
 * `_id` is kept when it passes id validation. `_rev` is assigned by the route
 * from the stored revision on update, never from the client.
 */
export const DESIGN_DOCUMENT_FIELDS = Object.freeze([
    'filters',
    'indexes',
    'language',
    'libs',
    'lists',
    'options',
    'rewrites',
    'shows',
    'updates',
    'validate_doc_update',
    'views'
]);

export const MISSING_ID_ERROR = 'Document _id is required';
export const DESIGN_OR_SYSTEM_ID_ERROR = 'Document _id must not refer to a design or system document';
export const ID_MISMATCH_ERROR = 'Document _id must match the URL id';
export const TYPE_NOT_ALLOWED_ERROR = `Document type must be one of: ${ALLOWED_DOCUMENT_TYPES.join(', ')}`;
export const STORED_TYPE_NOT_ALLOWED_ERROR = 'Stored document type is not allowed';
export const TYPE_CHANGE_ERROR = 'Document type must match the stored document type';

const designDocumentFields = new Set(DESIGN_DOCUMENT_FIELDS);

const MODEL_BY_TYPE = Object.freeze({
    Flight,
    Guardian,
    Veteran
});

const HISTORY_OWNERS = Object.freeze(['flight', 'guardian', 'veteran', 'call']);

export class GenericDocumentError extends Error {
    constructor(message) {
        super(message);
        this.name = 'GenericDocumentError';
        this.status = 400;
    }
}

/**
 * Validate a generic document write and return the object that may be stored.
 * Client `_rev`, `_deleted`, other underscore fields, and design-document
 * fields are dropped.
 *
 * @param {unknown} body
 * @param {{ urlId?: string }} [options]
 * @returns {Record<string, unknown>}
 */
export function prepareGenericDocumentWrite(body, { urlId } = {}) {
    if (body === null || typeof body !== 'object' || Array.isArray(body)) {
        throw new GenericDocumentError('Document body must be a JSON object');
    }

    const id = body._id;
    if (typeof id !== 'string' || id.length === 0) {
        throw new GenericDocumentError(MISSING_ID_ERROR);
    }
    if (id.startsWith('_')) {
        throw new GenericDocumentError(DESIGN_OR_SYSTEM_ID_ERROR);
    }

    const segment = getEncodedDocumentIdSegment(id);
    if (segment.error) {
        throw new GenericDocumentError(segment.error);
    }
    if (urlId !== undefined && id !== urlId) {
        throw new GenericDocumentError(ID_MISMATCH_ERROR);
    }
    if (!ALLOWED_DOCUMENT_TYPES.includes(body.type)) {
        throw new GenericDocumentError(TYPE_NOT_ALLOWED_ERROR);
    }

    const doc = {};
    for (const [key, value] of Object.entries(body)) {
        if (key.startsWith('_') && key !== '_id') {
            continue;
        }
        if (designDocumentFields.has(key)) {
            continue;
        }
        doc[key] = value;
    }
    return doc;
}

/**
 * Reject updates and deletes of documents whose stored type is outside the
 * allowlist, and reject updates that would change that type.
 *
 * @param {unknown} currentDoc
 * @param {string} [nextType]
 * @returns {true}
 */
export function assertStoredDocumentType(currentDoc, nextType) {
    if (!currentDoc || typeof currentDoc !== 'object' || !ALLOWED_DOCUMENT_TYPES.includes(currentDoc.type)) {
        throw new GenericDocumentError(STORED_TYPE_NOT_ALLOWED_ERROR);
    }
    if (nextType !== undefined && currentDoc.type !== nextType) {
        throw new GenericDocumentError(TYPE_CHANGE_ERROR);
    }
    return true;
}

function preserveHistory(record, current) {
    for (const key of HISTORY_OWNERS) {
        if (record[key] && current[key] && Array.isArray(current[key].history)) {
            record[key].history = current[key].history;
        }
    }
}

/**
 * Build the CouchDB document for a `/docs` create or update.
 * The result is the Flight, Guardian, or Veteran model after the same
 * server-controlled field handling those typed routes apply: model
 * validation, user audit fields, preserved creation metadata, and
 * preserved history. A new flight is stored as not completed.
 *
 * @param {unknown} body
 * @param {{ urlId?: string, user: { firstName: string, lastName: string }, currentDoc?: Record<string, unknown> }} options
 * @returns {Record<string, unknown>}
 */
export function buildLogisticsDocument(body, { urlId, user, currentDoc } = {}) {
    const prepared = prepareGenericDocumentWrite(body, { urlId });
    const Model = MODEL_BY_TYPE[prepared.type];
    const record = new Model(prepared);
    record.type = prepared.type;
    record._id = prepared._id;

    if (currentDoc) {
        const current = new Model(currentDoc);
        record._rev = currentDoc._rev;
        record.metadata.created_at = current.metadata.created_at;
        record.metadata.created_by = current.metadata.created_by;
        preserveHistory(record, current);
        if (typeof record.updateHistory === 'function') {
            record.updateHistory(current, user);
        }
    } else {
        record.metadata.created_at = '';
        record.metadata.created_by = '';
        record._rev = '';
        if (record.type === 'Flight') {
            record.completed = false;
        }
    }

    record.prepareForSave(user);
    record.validate();

    const document = record.toJSON();
    if (!currentDoc) {
        delete document._rev;
    }
    return document;
}
