import { FlightDetailResult } from '../models/flight_detail.js';
import { dbFetch, DatabaseSessionError } from '../utils/db.js';

const dbUrl = process.env.DB_URL;
const dbName = process.env.DB_NAME;

/**
 * @swagger
 * /flights/{id}/detail:
 *   get:
 *     summary: Retrieve flight detail data with seat and bus assignments
 *     description: |
 *       Retrieves detailed seat and bus assignment data for a specified flight including:
 *       - Flight metadata (name, capacity, date)
 *       - Statistics:
 *         - Bus counts (None, Alpha1-5, Bravo1-5)
 *         - Tour counts (Alpha, Bravo, None)
 *         - Flight counts (excludes nofly entries)
 *       - List of veteran-guardian pairs with seat/bus assignments
 *       
 *       Each pair includes mismatch flags:
 *       - busMismatch: true if people in the pair have different bus assignments
 *       - missingPairedPerson: true if a paired person is not on this flight
 *       
 *       Guardians paired with multiple veterans are deduplicated within each pair.
 *     tags: [Flight Detail]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Flight document ID
 *     responses:
 *       200:
 *         description: Flight detail data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FlightDetailResult'
 *       400:
 *         description: Document is not a flight record
 *       404:
 *         description: Flight not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export async function getFlightDetail(req, res) {
    try {
        const flightId = req.params.id;

        // First, get the flight document
        const flightUrl = `${dbUrl}/${dbName}/${flightId}`;
        const flightResponse = await dbFetch(req, flightUrl);

        const flightData = await flightResponse.json();
        if (!flightResponse.ok) {
            if (flightResponse.status === 404) {
                return res.status(404).json({ error: 'Flight not found' });
            }
            throw new Error(flightData.reason || 'Failed to get flight');
        }

        // Verify this is a flight document
        if (flightData.type !== 'Flight') {
            return res.status(400).json({ error: 'Document is not a flight record' });
        }

        // Create the flight detail result from the flight document
        const flightDetail = FlightDetailResult.fromFlightDoc(flightData);

        // Query the flight_pairings view to get veterans and guardians assigned to this flight
        const viewUrl = `${dbUrl}/${dbName}/_design/basic/_view/flight_pairings?` +
            `startkey=${encodeURIComponent(JSON.stringify([flightData.name]))}` +
            `&endkey=${encodeURIComponent(JSON.stringify([flightData.name + '\ufff0']))}` +
            `&descending=false`;

        const viewResponse = await dbFetch(req, viewUrl, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!viewResponse.ok) {
            const viewData = await viewResponse.json();
            throw new Error(viewData.reason || 'Failed to retrieve flight detail');
        }

        const viewData = await viewResponse.json();

        // Build pairs from view results (includes deduplication and mismatch detection)
        flightDetail.pairs = FlightDetailResult.buildPairsFromViewResults(viewData.rows);

        // Calculate statistics
        flightDetail.calculateStats();

        res.json(flightDetail.toJSON());
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error retrieving flight detail:', error);
        res.status(500).json({ error: error.message });
    }
}
