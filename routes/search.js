import { SearchRequest } from '../models/search_request.js';
import { SearchResults } from '../models/search_results.js';
import { dbFetch, DatabaseSessionError } from '../utils/db.js';

const dbUrl = process.env.DB_URL;
const dbName = process.env.DB_NAME;

async function search(searchRequest, req) {
    const viewName = searchRequest.getViewName();
    const queryParams = searchRequest.toQueryParams();
    const url = `${dbUrl}/${dbName}/_design/basic/_view/${viewName}?${queryParams}&descending=false`;
    
    const response = await dbFetch(req, url, {
        headers: {
            'Content-Type': 'application/json'
        }
    });
    
    const data = await response.json();
    return data;
}

function filterPhoneSearchResults(searchRequest, dbResult) {
    if (searchRequest.getViewName() !== 'all_by_phone_number') {
        return dbResult;
    }

    let filteredRows = dbResult.rows || [];

    if (searchRequest.status !== 'All') {
        filteredRows = filteredRows.filter(row => row.value && row.value.status === searchRequest.status);
    }

    if (searchRequest.flight !== 'All') {
        filteredRows = filteredRows.filter(row => row.value && row.value.flight === searchRequest.flight);
    }

    return {
        ...dbResult,
        total_rows: filteredRows.length,
        offset: 0,
        rows: filteredRows
    };
}

/**
 * @swagger
 * /search:
 *   get:
 *     summary: Search for veterans and guardians
 *     description: |
 *       Searches for veterans and guardians based on provided criteria.
 *       The search can be filtered by status or flight, but not both simultaneously.
 *       If status is not 'All', flight filter will be ignored.
 *     tags: [Search]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 25
 *         description: Maximum number of results to return
 *       - in: query
 *         name: lastname
 *         schema:
 *           type: string
 *         description: Last name to search for (partial match). Ignored when phone_num is provided.
 *       - in: query
 *         name: phone_num
 *         schema:
 *           type: string
 *         description: Phone number search term. Non-digits are ignored; requires at least 3 numeric digits.
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: ['All', 'Active', 'Flown', 'Deceased', 'Removed', 'Future-Spring', 'Future-Fall', 'Future-PostRestriction']
 *           default: 'Active'
 *         description: Status filter for the search
 *       - in: query
 *         name: flight
 *         schema:
 *           type: string
 *           default: 'All'
 *         description: Flight ID filter for the search (ignored if status is not 'All')
 *     responses:
 *       200:
 *         description: Search completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SearchResults'
 *             example:
 *               total_rows: 2
 *               offset: 0
 *               rows:
 *                 - id: "doc1"
 *                   key: ["Active", "Smith"]
 *                   value:
 *                     type: "Veteran"
 *                     name: "John Smith"
 *                     city: "Chicago"
 *                     appdate: "2024-01-15"
 *                     flight: "F23"
 *                     status: "Active"
 *                     pairing: "Jane Doe"
 *                     pairingId: "guard1"
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */

export async function getSearch(req, res, next) {
    try {
        const searchRequest = new SearchRequest(req.query);
        const dbResult = await search(searchRequest, req);
        const filteredResult = filterPhoneSearchResults(searchRequest, dbResult);
        const searchResults = new SearchResults(filteredResult);
        res.json(searchResults.toJSON());
    } catch (error) {
        if (error.message && error.message.includes('Validation failed')) {
            return res.status(400).json({ error: error.message });
        }
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error searching:', error);
        res.status(500).json({ error: error.message });
    }
} 