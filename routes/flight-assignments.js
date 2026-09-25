import { FlightAssignment, AddVeteransResult } from '../models/flight_assignment.js';
import { Veteran } from '../models/veteran.js';
import { Guardian } from '../models/guardian.js';
import { dbFetch, DatabaseSessionError, stableDatabaseError } from '../utils/db.js';
import { buildCouchDocumentUrl, buildCouchDocumentUrlOrRespond } from '../utils/document_id.js';

const dbUrl = process.env.DB_URL;
const dbName = process.env.DB_NAME;
const dbBase = `${dbUrl}/${dbName}`;

function assignVeteranToFlight(vetDoc, flightName, userName, timestamp) {
    const oldFlight = vetDoc.flight?.id || 'None';
    vetDoc.flight.id = flightName;

    if (!vetDoc.flight.history) {
        vetDoc.flight.history = [];
    }
    vetDoc.flight.history.push({
        id: timestamp,
        change: `changed flight from: ${oldFlight} to: ${flightName} by: ${userName}`
    });

    vetDoc.metadata = vetDoc.metadata || {};
    vetDoc.metadata.updated_at = timestamp;
    vetDoc.metadata.updated_by = userName;
}

function assignGuardianToFlight(guardianDoc, flightName, userName, timestamp) {
    const oldFlight = guardianDoc.flight?.id || 'None';
    if (oldFlight === flightName) {
        return false;
    }

    guardianDoc.flight = guardianDoc.flight || {};
    guardianDoc.flight.id = flightName;

    if (!guardianDoc.flight.history) {
        guardianDoc.flight.history = [];
    }
    guardianDoc.flight.history.push({
        id: timestamp,
        change: `changed flight from: ${oldFlight} to: ${flightName} by: ${userName}`
    });

    guardianDoc.metadata = guardianDoc.metadata || {};
    guardianDoc.metadata.updated_at = timestamp;
    guardianDoc.metadata.updated_by = userName;
    return true;
}

function putDocument(req, url, doc) {
    return dbFetch(req, url, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(doc)
    });
}

/**
 * PUT a document. On 409, re-read the current revision, reapply mutate, and retry once.
 * mutate returns false when the re-read document is already assigned to the flight.
 */
async function putWithConflictRetry(req, url, doc, mutate) {
    const response = await putDocument(req, url, doc);
    if (response.ok || response.status !== 409) {
        return response;
    }

    const currentResponse = await dbFetch(req, url);
    if (!currentResponse.ok) {
        return currentResponse;
    }

    const current = await currentResponse.json();
    if (mutate(current) === false) {
        return { ok: true, status: 200, json: async () => ({ ok: true }) };
    }

    return putDocument(req, url, current);
}

function saveFailureMessage(label, id, data, status) {
    const fallback = status === 409 ? 'Document update conflict.' : 'Unknown error';
    return `Failed to save ${label} ${id}: ${stableDatabaseError(fallback, data, status)}`;
}

function failureStatus(response) {
    return Number.isInteger(response?.status) ? response.status : 500;
}

function sendAddVeteransResult(res, result) {
    const body = result.toJSON();
    const statusCode = result.statusCode();
    if (statusCode === 200) {
        return res.json(body);
    }
    return res.status(statusCode).json(body);
}

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
 *         description: Invalid document id or document is not a flight record
 *       404:
 *         description: Flight not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
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
export async function getFlightAssignments(req, res) {
    try {
        const flightUrl = buildCouchDocumentUrlOrRespond(res, dbBase, req.params.id);
        if (flightUrl === null) {
            return;
        }
        const flightResponse = await dbFetch(req, flightUrl);

        const flightData = await flightResponse.json();
        if (!flightResponse.ok) {
            if (flightResponse.status === 404) {
                return res.status(404).json({ error: 'Flight not found' });
            }
            throw new Error(stableDatabaseError('Failed to get flight', flightData, flightResponse.status));
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
            throw new Error(stableDatabaseError('Failed to retrieve flight assignments', viewData, viewResponse.status));
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
 *       Each veteran is saved, then each paired guardian. A CouchDB 409 is
 *       retried once after the current revision is re-read. If that retry still
 *       conflicts, the failure is a conflict for that document.
 *       
 *       The response is 200 only when every attempted save succeeds. When a
 *       veteran or guardian save fails, the status is 409 if any remaining
 *       failure is a conflict and 500 otherwise. Both failure responses list
 *       the ids that were saved and the ids that failed.
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
 *         description: Every selected veteran and paired guardian was saved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AddVeteransResult'
 *       400:
 *         description: Invalid document id or invalid request (bad veteranCount or not a flight record)
 *       404:
 *         description: Flight not found
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: |
 *           One or more veteran or guardian documents conflicted. The handler
 *           re-reads the current revision and retries that write once. This
 *           status is returned when a conflict remains after that retry. The
 *           body lists the ids that were saved and the ids that failed.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AddVeteransResult'
 *       500:
 *         description: |
 *           Server error while preparing the assignment, or one or more veteran
 *           or guardian saves failed for a reason other than a remaining document
 *           conflict. Save failures list the ids that were saved and the ids that failed.
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - $ref: '#/components/schemas/AddVeteransResult'
 *                 - $ref: '#/components/schemas/Error'
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
export async function addVeteransToFlight(req, res) {
    try {
        const flightId = req.params.id;
        const { veteranCount } = req.body;

        // Validate veteranCount
        if (!veteranCount || veteranCount < 1 || veteranCount > 100) {
            return res.status(400).json({ error: 'veteranCount must be between 1 and 100' });
        }

        // Get the flight document
        const flightUrl = buildCouchDocumentUrlOrRespond(res, dbBase, flightId);
        if (flightUrl === null) {
            return;
        }
        const flightResponse = await dbFetch(req, flightUrl);

        const flightData = await flightResponse.json();
        if (!flightResponse.ok) {
            if (flightResponse.status === 404) {
                return res.status(404).json({ error: 'Flight not found' });
            }
            throw new Error(stableDatabaseError('Failed to get flight', flightData, flightResponse.status));
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
            throw new Error(stableDatabaseError('Failed to retrieve waitlist', waitlistData, waitlistResponse.status));
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
                assignVeteranToFlight(vetDoc, flightName, userName, timestamp);

                const vetUrlBuilt = buildCouchDocumentUrl(dbBase, vetDoc._id);
                if (vetUrlBuilt.error) {
                    result.addFailure({
                        id: typeof vetDoc._id === 'string' ? vetDoc._id : String(row.id || ''),
                        type: 'veteran',
                        status: 400,
                        error: `Invalid veteran document id ${vetDoc._id}: ${vetUrlBuilt.error}`
                    });
                    continue;
                }
                const saveVetUrl = vetUrlBuilt.url;
                const saveVetResponse = await putWithConflictRetry(req, saveVetUrl, vetDoc, (current) => {
                    assignVeteranToFlight(current, flightName, userName, timestamp);
                });

                if (saveVetResponse.ok) {
                    result.incrementVeterans(vetDoc._id);

                    // Check if veteran has a guardian that needs to be added
                    const guardianId = vetDoc.guardian?.id;
                    if (guardianId && guardianId.length === 32 && !processedGuardians.has(guardianId)) {
                        processedGuardians.add(guardianId);

                        try {
                            const guardianBuilt = buildCouchDocumentUrl(dbBase, guardianId);
                            if (guardianBuilt.error) {
                                result.addFailure({
                                    id: guardianId,
                                    type: 'guardian',
                                    status: 400,
                                    error: `Invalid guardian document id ${guardianId}: ${guardianBuilt.error}`
                                });
                                continue;
                            }
                            const guardianUrl = guardianBuilt.url;
                            const guardianResponse = await dbFetch(req, guardianUrl);

                            if (guardianResponse.ok) {
                                const guardianDoc = await guardianResponse.json();
                                const changed = assignGuardianToFlight(guardianDoc, flightName, userName, timestamp);

                                // Only update if guardian is not already on this flight
                                if (changed) {
                                    const saveGrdResponse = await putWithConflictRetry(
                                        req,
                                        guardianUrl,
                                        guardianDoc,
                                        (current) => assignGuardianToFlight(current, flightName, userName, timestamp)
                                    );

                                    if (saveGrdResponse.ok) {
                                        result.incrementGuardians(guardianId);
                                    } else {
                                        const saveGrdData = await saveGrdResponse.json();
                                        const status = failureStatus(saveGrdResponse);
                                        result.addFailure({
                                            id: guardianId,
                                            type: 'guardian',
                                            status,
                                            error: saveFailureMessage('guardian', guardianId, saveGrdData, status)
                                        });
                                    }
                                }
                            }
                        } catch (guardianError) {
                            result.addFailure({
                                id: guardianId,
                                type: 'guardian',
                                status: 500,
                                error: `Error processing guardian ${guardianId}: ${guardianError.message}`
                            });
                        }
                    }
                } else {
                    const saveVetData = await saveVetResponse.json();
                    const status = failureStatus(saveVetResponse);
                    result.addFailure({
                        id: typeof vetDoc._id === 'string' ? vetDoc._id : '',
                        type: 'veteran',
                        status,
                        error: saveFailureMessage('veteran', vetDoc._id, saveVetData, status)
                    });
                }
            } catch (vetError) {
                result.addFailure({
                    id: typeof vetDoc?._id === 'string' ? vetDoc._id : String(row.id || ''),
                    type: 'veteran',
                    status: 500,
                    error: `Error processing veteran ${row.id}: ${vetError.message}`
                });
            }
        }

        sendAddVeteransResult(res, result);
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error adding veterans to flight:', error);
        res.status(500).json({ error: error.message });
    }
}

