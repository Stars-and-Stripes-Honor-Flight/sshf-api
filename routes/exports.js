import { dbFetch, DatabaseSessionError } from '../utils/db.js';

const dbUrl = process.env.DB_URL;
const dbName = process.env.DB_NAME;

const FLIGHT_FILTER_RANGES = {
    All: { startkey: ['a'], endkey: ['Z'] },
    Veterans: { startkey: ['Veteran'], endkey: ['Veteran'] },
    Guardians: { startkey: ['Guardian'], endkey: ['Guardian'] }
};

function getFlightName(query) {
    const flightName = query.flightName;
    if (typeof flightName !== 'string') {
        return '';
    }
    return flightName.trim();
}

function buildRangeParams(startkey, endkey, includeDocs = true) {
    const params = new URLSearchParams();
    params.set('startkey', JSON.stringify(startkey));
    params.set('endkey', JSON.stringify(endkey));
    if (includeDocs) {
        params.set('include_docs', 'true');
    }
    return params;
}

async function getResponseErrorMessage(response, fallbackMessage) {
    try {
        const data = await response.json();
        return data.reason || data.error || fallbackMessage;
    } catch (error) {
        return fallbackMessage;
    }
}

async function proxyCsvExport(req, res, options) {
    const {
        listName,
        viewName,
        startkey,
        endkey,
        fileName,
        fallbackErrorMessage,
        extraParams = {}
    } = options;

    try {
        const params = buildRangeParams(startkey, endkey, true);
        for (const [key, value] of Object.entries(extraParams)) {
            params.set(key, String(value));
        }

        const url = `${dbUrl}/${dbName}/_design/basic/_list/${listName}/${viewName}?${params.toString()}`;

        const response = await dbFetch(req, url, {
            headers: {
                Accept: 'text/csv'
            }
        });

        if (!response.ok) {
            const message = await getResponseErrorMessage(response, fallbackErrorMessage);
            throw new Error(message);
        }

        const csv = await response.text();
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.send(csv);
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }

        console.error(`Error retrieving ${fileName} export:`, error);
        return res.status(500).json({ error: error.message });
    }
}

/**
 * @swagger
 * /exports/flight:
 *   get:
 *     summary: Export flight roster data as CSV
 *     description: |
 *       Proxies the CouchDB `flight-csv` list export and returns a CSV file.
 *       This export accepts a flight name and an optional role filter.
 *       The response is served as a downloadable CSV attachment.
 *     tags: [Exports]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: query
 *         name: flightName
 *         required: false
 *         schema:
 *           type: string
 *         description: Flight name to export.
 *       - in: query
 *         name: filter
 *         required: false
 *         schema:
 *           type: string
 *           enum: [All, Veterans, Guardians]
 *           default: All
 *         description: Optional role-based filter for the flight export.
 *     responses:
 *       200:
 *         description: CSV export generated successfully
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Missing or invalid query parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to retrieve export data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       503:
 *         description: Database session could not be established
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function exportFlightCsv(req, res) {
    const flightName = getFlightName(req.query);
    if (!flightName) {
        return res.status(400).json({ error: 'flightName parameter is required' });
    }

    const filter = req.query.filter || 'All';
    if (!Object.prototype.hasOwnProperty.call(FLIGHT_FILTER_RANGES, filter)) {
        return res.status(400).json({ error: 'filter must be one of: All, Veterans, Guardians' });
    }

    const range = FLIGHT_FILTER_RANGES[filter];
    return proxyCsvExport(req, res, {
        listName: 'flight-csv',
        viewName: 'active_by_flight',
        startkey: [flightName, ...range.startkey],
        endkey: [flightName, ...range.endkey],
        fileName: 'FlightInfo.csv',
        fallbackErrorMessage: 'Failed to retrieve flight export'
    });
}

/**
 * @swagger
 * /exports/callcenterfollowup:
 *   get:
 *     summary: Export call center follow-up list as CSV
 *     description: |
 *       Proxies the CouchDB `callcenterfollowup-csv` list export and returns
 *       a CSV file for the selected flight.
 *     tags: [Exports]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: query
 *         name: flightName
 *         required: false
 *         schema:
 *           type: string
 *         description: Flight name to export.
 *     responses:
 *       200:
 *         description: CSV export generated successfully
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Missing required query parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to retrieve export data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       503:
 *         description: Database session could not be established
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function exportCallCenterFollowUpCsv(req, res) {
    const flightName = getFlightName(req.query);
    if (!flightName) {
        return res.status(400).json({ error: 'flightName parameter is required' });
    }

    return proxyCsvExport(req, res, {
        listName: 'callcenterfollowup-csv',
        viewName: 'active_by_flight',
        startkey: [flightName, 'a'],
        endkey: [flightName, 'Z'],
        fileName: 'CallCenterFollowUp.csv',
        fallbackErrorMessage: 'Failed to retrieve call center follow-up export'
    });
}

/**
 * @swagger
 * /exports/tourlead:
 *   get:
 *     summary: Export tour lead data as CSV
 *     description: |
 *       Proxies the CouchDB `tourlead-csv` list export and returns
 *       a CSV file for the selected flight.
 *     tags: [Exports]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: query
 *         name: flightName
 *         required: false
 *         schema:
 *           type: string
 *         description: Flight name to export.
 *     responses:
 *       200:
 *         description: CSV export generated successfully
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Missing required query parameters
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to retrieve export data
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       503:
 *         description: Database session could not be established
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
export async function exportTourLeadCsv(req, res) {
    const flightName = getFlightName(req.query);
    if (!flightName) {
        return res.status(400).json({ error: 'flightName parameter is required' });
    }

    return proxyCsvExport(req, res, {
        listName: 'tourlead-csv',
        viewName: 'flight_pairings',
        startkey: [flightName],
        endkey: [`${flightName}Z`],
        fileName: 'TourLead.csv',
        fallbackErrorMessage: 'Failed to retrieve tour lead export',
        extraParams: {
            descending: false
        }
    });
}
