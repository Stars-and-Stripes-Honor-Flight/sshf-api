import {
    DocDiffError,
    DocDiffRequest,
    buildDiffResponse,
    buildRevisionList,
    resolveRevisionPair
} from '../models/doc_diff.js';
import {
    GenericDocumentError,
    assertStoredDocumentType,
    buildLogisticsDocument,
    prepareGenericDocumentWrite
} from '../models/generic_document.js';
import { dbFetch, DatabaseSessionError } from '../utils/db.js';
import { buildCouchDocumentUrlOrRespond } from '../utils/document_id.js';

const dbUrl = process.env.DB_URL;
const dbName = process.env.DB_NAME;
const dbBase = `${dbUrl}/${dbName}`;

function throwIfCouchWriteFailed(response, data, fallback) {
    if (response.status === 409) {
        const error = new Error(data.reason || 'Document update conflict.');
        error.statusCode = 409;
        throw error;
    }
    throw new Error(data.reason || fallback);
}

function sendDocumentError(res, error, logLabel) {
    if (error instanceof DatabaseSessionError) {
        console.error('Database session error:', error.message);
        return res.status(503).json({ error: error.message });
    }
    if (error instanceof GenericDocumentError) {
        return res.status(error.status).json({ error: error.message });
    }
    if (error.message && error.message.includes('Validation failed')) {
        return res.status(400).json({ error: error.message });
    }
    if (error.statusCode === 409) {
        return res.status(409).json({ error: error.message });
    }
    console.error(logLabel, error);
    return res.status(500).json({ error: error.message });
}

/**
 * @swagger
 * /docs:
 *   post:
 *     summary: Create an allowlisted logistics document
 *     description: |
 *       Stores a new CouchDB document whose type is Flight, Guardian, or Veteran.
 *       The body is validated with that type's model. The body `_id` is required
 *       and must not refer to a design or system document. Client-supplied
 *       `_rev`, `_deleted`, design-document fields, and audit metadata are not
 *       stored. Creation and update metadata are set from the authenticated user.
 *       A new flight is stored with completed false.
 *     tags: [Documents]
 *     security:
 *       - GoogleAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GenericDocumentWrite'
 *     responses:
 *       201:
 *         description: Document created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 id:
 *                   type: string
 *                 rev:
 *                   type: string
 *       400:
 *         description: Invalid document id, missing _id, a design or system document id, a type that is not allowlisted, or data that fails Flight, Guardian, or Veteran validation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       409:
 *         description: Document update conflict
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       500:
 *         description: Server error
 *       503:
 *         description: Database session error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */
export async function createDocument(req, res) {
    try {
        const document = buildLogisticsDocument(req.body, { user: req.user });
        const url = `${dbUrl}/${dbName}`;
        const response = await dbFetch(req, url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(document)
        });

        const data = await response.json();
        if (!response.ok) {
            throwIfCouchWriteFailed(response, data, 'Failed to create document');
        }

        res.status(201).json(data);
    } catch (error) {
        sendDocumentError(res, error, 'Error creating document:');
    }
}

/**
 * @swagger
 * /docs/{id}:
 *   get:
 *     summary: Retrieve a CouchDB document by ID
 *     tags: [Documents]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: CouchDB document ID
 *     responses:
 *       200:
 *         description: Document retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Invalid document id
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Document not found
 *       500:
 *         description: Server error
 *       503:
 *         description: Database session error
 *   put:
 *     summary: Update an allowlisted logistics document by ID
 *     description: |
 *       Replaces a Flight, Guardian, or Veteran document using that type's model
 *       validation. The body `_id` is required and must match the URL id.
 *       Design or system document ids are rejected. The stored type cannot be
 *       changed, and a document whose stored type is not allowlisted cannot be
 *       replaced. Creation metadata and history stay as stored. The
 *       authenticated user is recorded as the updater. Client-supplied `_rev`,
 *       `_deleted`, design-document fields, and audit metadata are not stored;
 *       the current CouchDB revision is sent instead.
 *     tags: [Documents]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: CouchDB document ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/GenericDocumentWrite'
 *     responses:
 *       200:
 *         description: Document updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Invalid document id, missing _id, a body _id that does not match the URL id, a design or system document id, a type that is not allowlisted, a type that does not match the stored document type, stored document type is not allowed, or data that fails Flight, Guardian, or Veteran validation
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Document not found
 *       409:
 *         description: Document update conflict
 *       500:
 *         description: Server error
 *       503:
 *         description: Database session error
 *   delete:
 *     summary: Delete an allowlisted logistics document by ID
 *     description: |
 *       Deletes a document only when its stored type is Flight, Guardian, or
 *       Veteran. Design or system document ids are rejected before CouchDB is
 *       called.
 *     tags: [Documents]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: CouchDB document ID
 *     responses:
 *       200:
 *         description: Document deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       400:
 *         description: Invalid document id, or stored document type is not allowed
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Document not found
 *       409:
 *         description: Document update conflict
 *       500:
 *         description: Server error
 *       503:
 *         description: Database session error
 */
export async function retrieveDocument(req, res) {
    try {
        const url = buildCouchDocumentUrlOrRespond(res, dbBase, req.params.id);
        if (url === null) {
            return;
        }

        const response = await dbFetch(req, url);

        const data = await response.json();
        if (!response.ok) {
            if (response.status === 404) {
                return res.status(404).json({ error: 'Document not found' });
            }
            throw new Error(data.reason || 'Failed to get document');
        }

        res.json(data);
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error getting document:', error);
        res.status(500).json({ error: error.message });
    }
}

// Update a document
export async function updateDocument(req, res) {
    try {
        const document = prepareGenericDocumentWrite(req.body, { urlId: req.params.id });
        const url = buildCouchDocumentUrlOrRespond(res, dbBase, req.params.id);
        if (url === null) {
            return;
        }

        // First, get the current revision
        const getResponse = await dbFetch(req, url);

        if (!getResponse.ok) {
            if (getResponse.status === 404) {
                return res.status(404).json({ error: 'Document not found' });
            }
            throw new Error('Failed to get document for update');
        }

        const currentDoc = await getResponse.json();
        assertStoredDocumentType(currentDoc, document.type);
        const updatedDoc = buildLogisticsDocument(req.body, {
            urlId: req.params.id,
            user: req.user,
            currentDoc
        });

        // Then, update the document
        const updateResponse = await dbFetch(req, url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedDoc)
        });

        const data = await updateResponse.json();
        if (!updateResponse.ok) {
            throwIfCouchWriteFailed(updateResponse, data, 'Failed to update document');
        }

        res.json(data);
    } catch (error) {
        sendDocumentError(res, error, 'Error updating document:');
    }
}

// Delete a document
export async function deleteDocument(req, res) {
    try {
        const url = buildCouchDocumentUrlOrRespond(res, dbBase, req.params.id);
        if (url === null) {
            return;
        }

        // First, get the current revision
        const getResponse = await dbFetch(req, url);

        if (!getResponse.ok) {
            if (getResponse.status === 404) {
                return res.status(404).json({ error: 'Document not found' });
            }
            throw new Error('Failed to get document for deletion');
        }

        const currentDoc = await getResponse.json();
        assertStoredDocumentType(currentDoc);
        const deleteUrl = `${url}?rev=${encodeURIComponent(currentDoc._rev)}`;

        const deleteResponse = await dbFetch(req, deleteUrl, {
            method: 'DELETE'
        });

        const data = await deleteResponse.json();
        if (!deleteResponse.ok) {
            throwIfCouchWriteFailed(deleteResponse, data, 'Failed to delete document');
        }

        res.json(data);
    } catch (error) {
        sendDocumentError(res, error, 'Error deleting document:');
    }
}

/**
 * @swagger
 * /docs/{id}/revisions:
 *   get:
 *     summary: List a document's CouchDB revision history
 *     description: |
 *       Returns revision metadata for a document using CouchDB `revs_info=true`.
 *       Revisions marked `missing` were removed by database compaction and cannot
 *       be fetched or diffed. This endpoint is intended for testers and debugging.
 *     tags: [Documents]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: CouchDB document ID
 *     responses:
 *       200:
 *         description: Revision history retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DocRevisionList'
 *       400:
 *         description: Invalid document id
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Document not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *             example:
 *               error: Document not found
 *       503:
 *         description: Database session error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */
export async function listDocumentRevisions(req, res) {
    try {
        const url = buildCouchDocumentUrlOrRespond(res, dbBase, req.params.id);
        if (url === null) {
            return;
        }
        const response = await dbFetch(req, `${url}?revs_info=true`);
        const data = await response.json();

        if (!response.ok) {
            if (response.status === 404) {
                return res.status(404).json({ error: 'Document not found' });
            }
            throw new Error(data.reason || 'Failed to get document revisions');
        }

        res.json(buildRevisionList(data));
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error listing document revisions:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * @swagger
 * /docs/{id}/diff:
 *   get:
 *     summary: Diff two revisions of a CouchDB document
 *     description: |
 *       Fetches two revision snapshots and returns a field-level JSON diff.
 *       When `from` and `to` are omitted, the current winning revision is
 *       compared with the next most recent available revision. Aliases
 *       `current` and `previous` are accepted. Compacted revisions cannot be
 *       retrieved and return 404. Intended for testers and debugging.
 *     tags: [Documents]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: CouchDB document ID
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *         description: Older revision token, or `previous` (the default)
 *       - in: query
 *         name: to
 *         schema:
 *           type: string
 *         description: Newer revision token, or `current` (the default)
 *     responses:
 *       200:
 *         description: Diff computed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DocDiff'
 *       400:
 *         description: Invalid document id, invalid revision parameters, or no previous revision
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Document or requested revision not found
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       503:
 *         description: Database session error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */
export async function diffDocument(req, res) {
    try {
        const baseUrl = buildCouchDocumentUrlOrRespond(res, dbBase, req.params.id);
        if (baseUrl === null) {
            return;
        }
        const request = new DocDiffRequest(req.query);
        const docId = req.params.id;

        const infoResponse = await dbFetch(req, `${baseUrl}?revs_info=true`);
        const infoData = await infoResponse.json();
        if (!infoResponse.ok) {
            if (infoResponse.status === 404) {
                return res.status(404).json({ error: 'Document not found' });
            }
            throw new Error(infoData.reason || 'Failed to get document revisions');
        }

        const pair = resolveRevisionPair(infoData._revs_info, request.from, request.to);

        const [fromResponse, toResponse] = await Promise.all([
            dbFetch(req, `${baseUrl}?rev=${encodeURIComponent(pair.from.rev)}`),
            dbFetch(req, `${baseUrl}?rev=${encodeURIComponent(pair.to.rev)}`)
        ]);

        if (!fromResponse.ok || !toResponse.ok) {
            const failed = !fromResponse.ok ? fromResponse : toResponse;
            const failedData = await failed.json();
            if (failed.status === 404) {
                return res.status(404).json({
                    error: 'Requested revision is not available. Older revisions are removed by database compaction.'
                });
            }
            throw new Error(failedData.reason || 'Failed to get document revision');
        }

        const [fromDoc, toDoc] = await Promise.all([
            fromResponse.json(),
            toResponse.json()
        ]);

        res.json(buildDiffResponse(docId, pair, fromDoc, toDoc));
    } catch (error) {
        if (error instanceof DocDiffError) {
            return res.status(error.status).json({ error: error.message });
        }
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error diffing document revisions:', error);
        res.status(500).json({ error: error.message });
    }
} 