import { QueryRequest } from '../models/query_request.js';
import { dbFetch, DatabaseSessionError } from '../utils/db.js';

const dbUrl = process.env.DB_URL;
const dbName = process.env.DB_NAME;

/**
 * @swagger
 * /query:
 *   post:
 *     summary: Execute a CouchDB Mango _find query
 *     description: |
 *       Executes a read-only Mango selector query against the database.
 *       This endpoint is a secure proxy that only allows _find queries and prevents
 *       any mutation operations. Queries are never persisted.
 *       
 *       **Security**: Queries are validated to prevent mutations. The following are forbidden:
 *       - Mutation operators ($set, $update, $unset, $inc, $push, $pull)
 *       - Bulk operations (docs, bulk, new_edits)
 *       - Index creation (index, ddoc, type)
 *       - Map/reduce operations (map, reduce, views)
 *       - Skip-based pagination (use bookmark instead)
 *       
 *       **Pagination**: Use bookmark for pagination, not skip.
 *       Default limit is 25, maximum is 100. Limits exceeding 100 are clamped.
 *       
 *       **Empty selector**: An empty selector object {} is allowed and matches all documents
 *       (subject to the limit).
 *       
 *       **Index refresh**: This endpoint forces update: false in the CouchDB request to disable
 *       index refresh during query execution.
 *     tags: [Search]
 *     security:
 *       - GoogleAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/QueryRequest'
 *           examples:
 *             basicQuery:
 *               summary: Basic query with selector
 *               value:
 *                 selector:
 *                   type: veteran
 *                   status: Active
 *                 limit: 25
 *             withFields:
 *               summary: Query with field projection
 *               value:
 *                 selector:
 *                   type: guardian
 *                 fields: ["_id", "name", "phone", "status"]
 *                 limit: 10
 *             withBookmark:
 *               summary: Paginated query with bookmark
 *               value:
 *                 selector:
 *                   flight: SSHF-Nov2024
 *                 bookmark: g1AAAAG3eJzLYWBg4M
 *                 limit: 50
 *             withSort:
 *               summary: Query with sorting
 *               value:
 *                 selector:
 *                   status: Active
 *                 sort:
 *                   - name: asc
 *                 limit: 25
 *     responses:
 *       200:
 *         description: Query executed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/QueryResults'
 *             examples:
 *               success:
 *                 summary: Successful query result
 *                 value:
 *                   docs:
 *                     - _id: "v123"
 *                       type: "veteran"
 *                       name: "John Smith"
 *                       status: "Active"
 *                     - _id: "v124"
 *                       type: "veteran"
 *                       name: "Jane Doe"
 *                       status: "Active"
 *                   bookmark: "g1AAAAG3eJzLYWBg4M"
 *                   warning: "no matching index found, the query was executed without an index"
 *               withStats:
 *                 summary: Result with execution statistics
 *                 value:
 *                   docs:
 *                     - _id: "v123"
 *                       type: "veteran"
 *                   bookmark: "g1AAAAG3eJzLYWBg4M"
 *                   execution_stats:
 *                     total_keys_examined: 0
 *                     total_docs_examined: 100
 *                     total_quorum_docs_examined: 0
 *                     results_returned: 1
 *                     execution_time_ms: 12.5
 *       400:
 *         description: Invalid query or forbidden operation
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *             examples:
 *               missingSelector:
 *                 summary: Missing selector
 *                 value:
 *                   error: "Validation failed: selector is required"
 *               mutationAttempt:
 *                 summary: Mutation operator detected
 *                 value:
 *                   error: "Validation failed: mutation operator not allowed: $set"
 *               skipNotAllowed:
 *                 summary: Skip pagination not allowed
 *                 value:
 *                   error: "Validation failed: forbidden keys detected: skip"
 *               invalidSyntax:
 *                 summary: CouchDB syntax error
 *                 value:
 *                   error: "Invalid selector syntax"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - insufficient permissions
 *       500:
 *         description: Server error
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
export async function postQuery(req, res, next) {
    try {
        // Validate and normalize the request
        const queryRequest = new QueryRequest(req.body);
        
        // Build CouchDB _find request body
        const requestBody = queryRequest.toRequestBody();
        
        // Execute the query via dbFetch
        const url = `${dbUrl}/${dbName}/_find`;
        const response = await dbFetch(req, url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        // Handle CouchDB 400 errors (invalid query syntax)
        if (response.status === 400) {
            const errorData = await response.json();
            const errorMessage = errorData.reason || errorData.error || 'Invalid query';
            return res.status(400).json({ error: errorMessage });
        }

        // Handle other non-OK responses from CouchDB
        if (!response.ok) {
            const errorData = await response.json();
            const errorMessage = errorData.reason || errorData.error || 'Database error';
            return res.status(500).json({ error: errorMessage });
        }

        // Parse and return the result
        const data = await response.json();
        
        // Build response with docs, bookmark, and warning
        const result = {
            docs: data.docs || []
        };

        // Include bookmark if present
        if (data.bookmark) {
            result.bookmark = data.bookmark;
        }

        // Include warning if present (e.g., "no matching index found")
        if (data.warning) {
            result.warning = data.warning;
        }

        // Include execution_stats if present
        if (data.execution_stats) {
            result.execution_stats = data.execution_stats;
        }

        res.json(result);
    } catch (error) {
        if (error.message && error.message.includes('Validation failed')) {
            return res.status(400).json({ error: error.message });
        }
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error executing query:', error);
        res.status(500).json({ error: error.message });
    }
}
