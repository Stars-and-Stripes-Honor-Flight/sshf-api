import { dbFetch, DatabaseSessionError } from '../utils/db.js';

const dbUrl = process.env.DB_URL;
const dbName = process.env.DB_NAME;

/**
 * @swagger
 * /waitlist/veteran-groups:
 *   get:
 *     summary: Retrieve active veteran groups from waitlist
 *     description: |
 *       Retrieves active veterans that have a flight group assignment and
 *       returns them grouped by group number.
 *       Group keys are sorted ascending in the API response.
 *     tags: [Waitlist]
 *     security:
 *       - GoogleAuth: []
 *     responses:
 *       200:
 *         description: Veteran groups retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/WaitlistVeteranGroup'
 *             example:
 *               - group: "853-3"
 *                 names:
 *                   - "William Mathias (SSHF-Mark1)"
 *                   - "Robert Kossow (SSHF-Mark1)"
 *               - group: "855-2"
 *                 names:
 *                   - "Philip Schultz"
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
export async function getWaitlistVeteranGroups(req, res) {
    try {
        const url = `${dbUrl}/${dbName}/_design/basic/_view/waitlist_veteran_groups?descending=false`;
        const response = await dbFetch(req, url, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.reason || data.error || 'Failed to retrieve veteran groups');
        }

        const groupedNames = new Map();

        for (const row of data.rows || []) {
            const group = row.key;
            const name = row.value;

            if (!groupedNames.has(group)) {
                groupedNames.set(group, []);
            }
            groupedNames.get(group).push(name);
        }

        const results = Array.from(groupedNames.entries())
            .map(([group, names]) => ({ group, names }))
            .sort((a, b) => a.group.localeCompare(b.group, undefined, { numeric: true, sensitivity: 'base' }));

        res.json(results);
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error retrieving veteran groups:', error);
        res.status(500).json({ error: error.message });
    }
}
