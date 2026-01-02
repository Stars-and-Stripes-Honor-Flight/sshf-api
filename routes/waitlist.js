import { Veteran } from '../models/veteran.js';
import { Guardian } from '../models/guardian.js';
import { WaitlistRequest } from '../models/waitlist_request.js';
import { dbFetch, DatabaseSessionError } from '../utils/db.js';

const dbUrl = process.env.DB_URL;
const dbName = process.env.DB_NAME;

/**
 * @swagger
 * /waitlist:
 *   get:
 *     summary: Retrieve waitlist entries for veterans or guardians
 *     description: |
 *       Retrieves paginated waitlist entries from the database.
 *       The veteran waitlist shows veterans waiting to be assigned to a flight.
 *       The guardian waitlist shows unpaired guardians waiting to be matched with a veteran.
 *       Results are returned in waitlist order as defined by the database views.
 *     tags: [Waitlist]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: ['veterans', 'guardians']
 *         description: Type of waitlist to retrieve
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
 *         description: Waitlist entries retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 oneOf:
 *                   - $ref: '#/components/schemas/Veteran'
 *                   - $ref: '#/components/schemas/Guardian'
 *             examples:
 *               veterans:
 *                 summary: Veteran waitlist response
 *                 value:
 *                   - _id: "vet123"
 *                     type: "Veteran"
 *                     name:
 *                       first: "John"
 *                       last: "Smith"
 *                     address:
 *                       city: "Chicago"
 *                       state: "IL"
 *               guardians:
 *                 summary: Guardian waitlist response
 *                 value:
 *                   - _id: "guard456"
 *                     type: "Guardian"
 *                     name:
 *                       first: "Jane"
 *                       last: "Doe"
 *                     address:
 *                       city: "Springfield"
 *                       state: "IL"
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
export async function getWaitlist(req, res) {
    try {
        const waitlistRequest = new WaitlistRequest(req.query);
        
        // Validate the request
        const validation = waitlistRequest.validate();
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }
        
        const viewName = waitlistRequest.getViewName();
        const queryParams = waitlistRequest.toQueryParams();
        const url = `${dbUrl}/${dbName}/_design/basic/_view/${viewName}?${queryParams}`;
        
        const response = await dbFetch(req, url, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.reason || data.error || 'Failed to retrieve waitlist');
        }
        
        // Map rows to appropriate model based on type
        let results;
        if (waitlistRequest.type === 'veterans') {
            results = data.rows.map(row => {
                const veteran = Veteran.fromJSON(row.doc);
                return veteran.toJSON();
            });
        } else {
            results = data.rows.map(row => {
                const guardian = Guardian.fromJSON(row.doc);
                return guardian.toJSON();
            });
        }
        
        res.json(results);
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error retrieving waitlist:', error);
        res.status(500).json({ error: error.message });
    }
}

