import { FlightAssignment, AddVeteransResult } from '../models/flight_assignment.js';
import { Veteran } from '../models/veteran.js';
import { Guardian } from '../models/guardian.js';
import { dbFetch, DatabaseSessionError } from '../utils/db.js';

const dbUrl = process.env.DB_URL;
const dbName = process.env.DB_NAME;

/**
 * @swagger
 * /flights/{id}/assignments:
 *   get:
 *     summary: Retrieve flight assignment data
 *     description: |
 *       Retrieves the current assignment data for a specified flight including:
 *       - Flight metadata (name, capacity, date)
 *       - List of veteran-guardian pairs assigned to the flight
 *       - Counts of veterans, guardians, confirmed, and remaining capacity
 *       
 *       Veterans and guardians marked as nofly are excluded from counts.
 *       Pairs are sorted by group (if present) then by application date.
 *     tags: [Flight Assignments]
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
 *         description: Flight assignment data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FlightAssignment'
 *       400:
 *         description: Document is not a flight record
 *       404:
 *         description: Flight not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export async function getFlightAssignments(req, res) {
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

        // Create the flight assignment from the flight document
        const flightAssignment = FlightAssignment.fromFlightDoc(flightData);

        // Query the flight_assignment view to get veterans and guardians assigned to this flight
        const viewUrl = `${dbUrl}/${dbName}/_design/basic/_view/flight_assignment?` +
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
            throw new Error(viewData.reason || 'Failed to retrieve flight assignments');
        }

        const viewData = await viewResponse.json();

        // Build pairs from view results
        flightAssignment.pairs = FlightAssignment.buildPairsFromViewResults(viewData.rows);

        // Sort pairs and calculate counts
        flightAssignment.sortPairs();
        flightAssignment.calculateCounts();

        res.json(flightAssignment.toJSON());
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error retrieving flight assignments:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * @swagger
 * /flights/{id}/assignments:
 *   post:
 *     summary: Add veterans from waitlist to flight
 *     description: |
 *       Adds a specified number of veterans from the waitlist to the flight.
 *       
 *       The selection follows these rules:
 *       - Veterans are taken in order of application date
 *       - When a veteran in a group is selected, all group members are added
 *       - Veterans with paired guardians have their guardian added automatically
 *       - Flight history entries are recorded for each assignment
 *       
 *       The veteranCount must be between 1 and 100.
 *     tags: [Flight Assignments]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Flight document ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - veteranCount
 *             properties:
 *               veteranCount:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 100
 *                 description: Number of veterans to add from waitlist
 *     responses:
 *       200:
 *         description: Veterans added successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AddVeteransResult'
 *       400:
 *         description: Invalid request (bad veteranCount or not a flight record)
 *       404:
 *         description: Flight not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export async function addVeteransToFlight(req, res) {
    try {
        const flightId = req.params.id;
        const { veteranCount } = req.body;

        // Validate veteranCount
        if (!veteranCount || veteranCount < 1 || veteranCount > 100) {
            return res.status(400).json({ error: 'veteranCount must be between 1 and 100' });
        }

        // Get the flight document
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

        const flightName = flightData.name;
        const result = new AddVeteransResult();

        // Query waitlist_veterans_active view to get veterans not on a flight
        const waitlistUrl = `${dbUrl}/${dbName}/_design/basic/_view/waitlist_veterans_active?` +
            `limit=${veteranCount}&descending=false&include_docs=true`;

        const waitlistResponse = await dbFetch(req, waitlistUrl, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!waitlistResponse.ok) {
            const waitlistData = await waitlistResponse.json();
            throw new Error(waitlistData.reason || 'Failed to retrieve waitlist');
        }

        const waitlistData = await waitlistResponse.json();
        const veteransToAdd = [...waitlistData.rows];

        // Build a map of groups from the selected veterans
        const groupMap = {};
        for (const row of waitlistData.rows) {
            const group = row.value;
            if (group && group.length > 0) {
                if (!groupMap[group]) {
                    groupMap[group] = [];
                }
                groupMap[group].push(row.id);
            }
        }

        // If there are groups, query for other group members not already selected
        const groupCount = Object.keys(groupMap).length;
        if (groupCount > 0) {
            const groupsUrl = `${dbUrl}/${dbName}/_design/basic/_view/waitlist_veteran_groups?` +
                `descending=false&include_docs=true`;

            const groupsResponse = await dbFetch(req, groupsUrl, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (groupsResponse.ok) {
                const groupsData = await groupsResponse.json();

                for (const row of groupsData.rows) {
                    const groupName = row.key;

                    // Check if this group is one being added
                    if (groupMap[groupName]) {
                        const groupVetId = row.id;
                        const existingIds = groupMap[groupName];

                        // Check if this group member is already being added
                        if (!existingIds.includes(groupVetId)) {
                            // Check if the group member is not already on another flight
                            const vetFlightId = row.doc?.flight?.id;
                            if (!vetFlightId || vetFlightId === 'None' || vetFlightId.length === 0) {
                                veteransToAdd.push({
                                    id: groupVetId,
                                    key: groupName,
                                    value: '',
                                    doc: row.doc
                                });
                            }
                        }
                    }
                }
            }
        }

        // Process each veteran and add them to the flight
        const userName = req.user.firstName + ' ' + req.user.lastName;
        const timestamp = new Date().toISOString().split('.')[0] + 'Z';
        const processedGuardians = new Set();

        for (const row of veteransToAdd) {
            const vetDoc = row.doc;
            if (!vetDoc) continue;

            try {
                // Update veteran's flight assignment
                const oldFlight = vetDoc.flight?.id || 'None';
                vetDoc.flight.id = flightName;

                // Add history entry
                if (!vetDoc.flight.history) {
                    vetDoc.flight.history = [];
                }
                vetDoc.flight.history.push({
                    id: timestamp,
                    change: `changed flight from: ${oldFlight} to: ${flightName} by: ${userName}`
                });

                // Update metadata
                vetDoc.metadata = vetDoc.metadata || {};
                vetDoc.metadata.updated_at = timestamp;
                vetDoc.metadata.updated_by = userName;

                // Save the veteran document
                const saveVetUrl = `${dbUrl}/${dbName}/${vetDoc._id}`;
                const saveVetResponse = await dbFetch(req, saveVetUrl, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(vetDoc)
                });

                if (saveVetResponse.ok) {
                    result.incrementVeterans();

                    // Check if veteran has a guardian that needs to be added
                    const guardianId = vetDoc.guardian?.id;
                    if (guardianId && guardianId.length === 32 && !processedGuardians.has(guardianId)) {
                        processedGuardians.add(guardianId);

                        try {
                            // Get the guardian document
                            const guardianUrl = `${dbUrl}/${dbName}/${guardianId}`;
                            const guardianResponse = await dbFetch(req, guardianUrl);

                            if (guardianResponse.ok) {
                                const guardianDoc = await guardianResponse.json();
                                const grdOldFlight = guardianDoc.flight?.id || 'None';

                                // Only update if guardian is not already on this flight
                                if (grdOldFlight !== flightName) {
                                    guardianDoc.flight = guardianDoc.flight || {};
                                    guardianDoc.flight.id = flightName;

                                    if (!guardianDoc.flight.history) {
                                        guardianDoc.flight.history = [];
                                    }
                                    guardianDoc.flight.history.push({
                                        id: timestamp,
                                        change: `changed flight from: ${grdOldFlight} to: ${flightName} by: ${userName}`
                                    });

                                    guardianDoc.metadata = guardianDoc.metadata || {};
                                    guardianDoc.metadata.updated_at = timestamp;
                                    guardianDoc.metadata.updated_by = userName;

                                    const saveGrdResponse = await dbFetch(req, guardianUrl, {
                                        method: 'PUT',
                                        headers: {
                                            'Content-Type': 'application/json'
                                        },
                                        body: JSON.stringify(guardianDoc)
                                    });

                                    if (saveGrdResponse.ok) {
                                        result.incrementGuardians();
                                    } else {
                                        const saveGrdData = await saveGrdResponse.json();
                                        result.addError(`Failed to save guardian ${guardianId}: ${saveGrdData.reason || 'Unknown error'}`);
                                    }
                                }
                            }
                        } catch (guardianError) {
                            result.addError(`Error processing guardian ${guardianId}: ${guardianError.message}`);
                        }
                    }
                } else {
                    const saveVetData = await saveVetResponse.json();
                    result.addError(`Failed to save veteran ${vetDoc._id}: ${saveVetData.reason || 'Unknown error'}`);
                }
            } catch (vetError) {
                result.addError(`Error processing veteran ${row.id}: ${vetError.message}`);
            }
        }

        res.json(result.toJSON());
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error adding veterans to flight:', error);
        res.status(500).json({ error: error.message });
    }
}

