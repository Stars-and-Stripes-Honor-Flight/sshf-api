import { RecentActivityRequest } from '../models/recent_activity_request.js';
import { RecentActivityEntry } from '../models/recent_activity_entry.js';
import { dbFetch, DatabaseSessionError } from '../utils/db.js';

const dbUrl = process.env.DB_URL;
const dbName = process.env.DB_NAME;


/**
 * @swagger
 * /recent-activity:
 *   get:
 *     summary: Retrieve recent activity entries
 *     description: |
 *       Retrieves paginated recent activity entries from the database.
 *       Shows various categories of recent changes from most recent to oldest.
 *       The type parameter determines which category of changes to retrieve.
 *     tags: [Recent Activity]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: ['modified', 'added', 'call', 'flight', 'pairing']
 *         description: |
 *           Type of recent activity to retrieve:
 *           - modified: Recently modified records
 *           - added: Recently added records
 *           - call: Recent call changes
 *           - flight: Recent flight changes
 *           - pairing: Recent pairing changes
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Zero-based offset for pagination (number of records to skip)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Maximum number of results to return
 *     responses:
 *       200:
 *         description: Recent activity entries retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/RecentActivityEntry'
 *             example:
 *               - id: "0ccf1cdbac2279ae3e2de3791209c357"
 *                 type: "Guardian"
 *                 name: "Catherine Manaspas"
 *                 city: "Chippewa Falls, WI"
 *                 appdate: "2025-11-18"
 *                 recdate: "2025-12-29T01:04:40Z"
 *                 recby: "Steve Schmechel"
 *                 change: "changed flight from: None to: SSHF-Test01"
 *       400:
 *         description: Invalid or missing type parameter
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *             example:
 *               error: "type parameter is required"
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
export async function getRecentActivity(req, res) {
    try {
        const activityRequest = new RecentActivityRequest(req.query);
        
        // Validate the request
        const validation = activityRequest.validate();
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }
        
        const viewName = activityRequest.getViewName();
        const queryParams = activityRequest.toQueryParams();
        const url = `${dbUrl}/${dbName}/_design/basic/_view/${viewName}?${queryParams}`;
        
        const response = await dbFetch(req, url, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.reason || data.error || 'Failed to retrieve recent activity');
        }
        
        // Transform rows to RecentActivityEntry objects
        const results = data.rows.map(row => {
            const entry = RecentActivityEntry.fromRow(row);
            return entry.toJSON();
        });
        
        res.json(results);
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error retrieving recent activity:', error);
        res.status(500).json({ error: error.message });
    }
}

