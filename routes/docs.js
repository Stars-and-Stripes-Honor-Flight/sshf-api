import {
    DocDiffError,
    DocDiffRequest,
    buildDiffResponse,
    buildRevisionList,
    resolveRevisionPair
} from '../models/doc_diff.js';
import { dbFetch, DatabaseSessionError } from '../utils/db.js';
import { buildCouchDocumentUrlOrRespond } from '../utils/document_id.js';

const dbUrl = process.env.DB_URL;
const dbName = process.env.DB_NAME;
const dbBase = `${dbUrl}/${dbName}`;

// Create a new document
export async function createDocument(req, res) {
    try {
        const url = `${dbUrl}/${dbName}`;
        const response = await dbFetch(req, url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.reason || 'Failed to create document');
        }

        res.status(201).json(data);
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error creating document:', error);
        res.status(500).json({ error: error.message });
    }
}

// Get a document by ID
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
        const updatedDoc = { ...req.body, _rev: currentDoc._rev };

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
            throw new Error(data.reason || 'Failed to update document');
        }

        res.json(data);
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error updating document:', error);
        res.status(500).json({ error: error.message });
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
        const deleteUrl = `${url}?rev=${encodeURIComponent(currentDoc._rev)}`;

        const deleteResponse = await dbFetch(req, deleteUrl, {
            method: 'DELETE'
        });

        const data = await deleteResponse.json();
        if (!deleteResponse.ok) {
            throw new Error(data.reason || 'Failed to delete document');
        }

        res.json(data);
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error deleting document:', error);
        res.status(500).json({ error: error.message });
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