import { SearchRequest } from '../models/search_request.js';
import { SearchResults } from '../models/search_results.js';

const dbUrl = process.env.DB_URL;
const dbName = process.env.DB_NAME;

async function search(searchRequest, dbCookie) {
    try {
        const viewName = searchRequest.getViewName();
        const queryParams = searchRequest.toQueryParams();
        const url = `${dbUrl}/${dbName}/_design/basic/_view/${viewName}?${queryParams}&descending=false`;
        
        const response = await fetch(url, {
            headers: {
                'Cookie': dbCookie,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Database connection error:', error);
        throw error;
    }
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
 *         description: Last name to search for (partial match)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: ['Active', 'All']
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
    const searchRequest = new SearchRequest(req.query);
    const dbResult = await search(searchRequest, req.dbCookie);
    const searchResults = new SearchResults(dbResult);
    res.json(searchResults.toJSON());
} 