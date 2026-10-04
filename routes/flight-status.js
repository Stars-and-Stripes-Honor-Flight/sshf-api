import { Flight } from '../models/flight.js';
import {
    FutureStatusRequest,
    FlightStatusBulkResult,
    applyStatusChange,
    isOnFlight
} from '../models/flight_status_update.js';
import { dbFetch, DatabaseSessionError, stableDatabaseError } from '../utils/db.js';
import { buildCouchDocumentUrlOrRespond } from '../utils/document_id.js';
import { saveBulkDocs } from '../utils/bulk_docs.js';

const VIEW_PAGE_SIZE = 500;

function databaseBase() {
    return `${process.env.DB_URL}/${process.env.DB_NAME}`;
}

function personType(doc) {
    return doc?.type === 'Guardian' ? 'guardian' : 'veteran';
}

function uniquePeople(rows, predicate) {
    const seen = new Set();
    const people = [];
    for (const row of rows) {
        const doc = row?.doc;
        if (!doc || (doc.type !== 'Veteran' && doc.type !== 'Guardian')) {
            continue;
        }
        if (!doc._id || seen.has(doc._id)) {
            continue;
        }
        if (!predicate(doc)) {
            continue;
        }
        seen.add(doc._id);
        people.push(doc);
    }
    return people;
}

async function readExactView(req, viewName, keyValue) {
    const rows = [];
    let startkey = [keyValue];
    let startkeyDocId = null;
    const endkey = JSON.stringify([keyValue, {}]);

    for (;;) {
        const params = new URLSearchParams();
        params.set('startkey', JSON.stringify(startkey));
        params.set('endkey', endkey);
        params.set('include_docs', 'true');
        params.set('limit', String(VIEW_PAGE_SIZE));
        if (startkeyDocId !== null) {
            params.set('startkey_docid', startkeyDocId);
            params.set('skip', '1');
        }

        const response = await dbFetch(
            req,
            `${databaseBase()}/_design/basic/_view/${viewName}?${params.toString()}`
        );
        if (!response.ok) {
            let data = {};
            try {
                data = await response.json();
            } catch {
                data = {};
            }
            throw new Error(stableDatabaseError('Failed to read matching people', data, response.status));
        }

        const data = await response.json();
        const page = Array.isArray(data?.rows) ? data.rows : [];
        rows.push(...page);
        if (page.length < VIEW_PAGE_SIZE) {
            return rows;
        }
        const last = page[page.length - 1];
        startkey = last.key;
        startkeyDocId = last.id;
    }
}

function markFlightCompleted(flightDoc, user) {
    const model = Flight.fromJSON(structuredClone(flightDoc));
    model.completed = true;
    model.prepareForSave(user);
    flightDoc.completed = true;
    flightDoc.metadata = { ...(flightDoc.metadata || {}), ...model.metadata };
    return flightDoc;
}

function stillActiveOnFlight(doc, flightName) {
    const person = doc?.type === 'Veteran' || doc?.type === 'Guardian';
    return person && doc.flight?.id === flightName && doc.flight?.status === 'Active';
}

function logRun(entry) {
    console.info(JSON.stringify(entry));
}

function sendResult(res, result) {
    return res.status(result.statusCode()).json(result.toJSON());
}

function sendFailure(res, error) {
    if (error instanceof DatabaseSessionError) {
        console.error('Database session error:', error.message);
        return res.status(503).json({ error: error.message });
    }
    const message = error instanceof Error && error.message ? error.message : 'Server error';
    console.error('Flight status update failed:', message);
    return res.status(500).json({ error: message });
}

/**
 * @swagger
 * /flights/{id}/complete:
 *   post:
 *     summary: Mark a flight completed and its active people as Flown
 *     description: |
 *       Matches people by flight name (flight.id) using
 *       _design/basic/_view/all_by_flight_and_name. Each changed person gets a
 *       flight.history status line and updated metadata.updated_at and
 *       metadata.updated_by, the same as an individual status edit. The flight
 *       is marked completed only after every person save succeeds.
 *     tags: [Flights]
 *     security:
 *       - GoogleAuth: []
 *     x-required-permission: flights:manage
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Flight document ID
 *     responses:
 *       200:
 *         description: Every qualifying person and the flight were saved, including when nobody needed changing
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FlightStatusBulkResult'
 *       207:
 *         description: Some documents were attempted and one or more were not saved. failed lists their ids. The flight stays not completed when any person failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FlightStatusBulkResult'
 *       400:
 *         description: Invalid document id, document is not a flight record, or flight name cannot be used to match people
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - missing required permission
 *       404:
 *         description: Flight not found
 *       409:
 *         description: Flight is already completed. Nothing was changed
 *       500:
 *         description: Server error before any document was saved
 *       503:
 *         description: Database unreachable before any document was saved
 */
export async function completeFlight(req, res) {
    try {
        const url = buildCouchDocumentUrlOrRespond(res, databaseBase(), req.params.id);
        if (url === null) {
            return;
        }

        const flightResponse = await dbFetch(req, url);
        if (!flightResponse.ok) {
            if (flightResponse.status === 404) {
                return res.status(404).json({ error: 'Flight not found' });
            }
            let data = {};
            try {
                data = await flightResponse.json();
            } catch {
                data = {};
            }
            throw new Error(stableDatabaseError('Failed to get flight', data, flightResponse.status));
        }

        const flightDoc = await flightResponse.json();
        if (flightDoc.type !== 'Flight') {
            return res.status(400).json({ error: 'Document is not a flight record' });
        }
        if (flightDoc.completed === true || flightDoc.completed === 'true') {
            return res.status(409).json({ error: 'Flight is already completed' });
        }

        const flightName = typeof flightDoc.name === 'string' ? flightDoc.name : '';
        if (flightName.length === 0 || flightName === 'None') {
            return res.status(400).json({ error: 'Flight name cannot be used to match people' });
        }

        const rows = await readExactView(req, 'all_by_flight_and_name', flightName);
        const matched = uniquePeople(rows, (doc) => doc.flight?.id === flightName);
        const toChange = matched.filter((doc) => doc.flight?.status === 'Active');
        for (const doc of toChange) {
            applyStatusChange(doc, 'Flown', req.user);
        }

        const outcome = toChange.length === 0
            ? { saved: [], failed: [], skipped: [] }
            : await saveBulkDocs(req, toChange, {
                prepareRetry(fresh) {
                    if (!stillActiveOnFlight(fresh, flightName)) {
                        return { action: 'skip' };
                    }
                    applyStatusChange(fresh, 'Flown', req.user);
                    return { action: 'save', doc: fresh };
                }
            });

        const failures = outcome.failed.map((failure) => ({
            id: failure.id,
            type: personType(toChange.find((doc) => doc._id === failure.id)),
            status: failure.status,
            error: failure.error
        }));

        const originalCompleted = flightDoc.completed;
        let storedCompleted = originalCompleted;
        if (outcome.failed.length === 0) {
            markFlightCompleted(flightDoc, req.user);
            const flightOutcome = await saveBulkDocs(req, [flightDoc], {
                prepareRetry(fresh) {
                    if (fresh?.completed === true || fresh?.completed === 'true') {
                        return { action: 'ok' };
                    }
                    if (fresh?.type !== 'Flight') {
                        return { action: 'fail', status: 400, error: 'Document is not a flight record' };
                    }
                    markFlightCompleted(fresh, req.user);
                    return { action: 'save', doc: fresh };
                }
            });
            if (flightOutcome.failed.length === 0) {
                storedCompleted = true;
            } else {
                storedCompleted = originalCompleted;
                const failure = flightOutcome.failed[0];
                failures.push({
                    id: failure.id || flightDoc._id,
                    type: 'flight',
                    status: failure.status,
                    error: failure.error
                });
            }
        }

        const changed = outcome.saved.length;
        const failedPeople = outcome.failed.length;
        const result = new FlightStatusBulkResult({
            fromStatus: 'Active',
            toStatus: 'Flown',
            flight: {
                id: flightDoc._id,
                name: flightName,
                completed: storedCompleted
            }
        });
        result.setCounts({
            matched: matched.length,
            changed,
            skipped: matched.length - changed - failedPeople,
            failed: failedPeople
        });
        for (const failure of failures) {
            result.addFailure(failure);
        }

        logRun({
            endpoint: 'POST /flights/:id/complete',
            flightId: flightDoc._id,
            counts: result.counts,
            failed: result.failures.map((item) => item.id)
        });
        return sendResult(res, result);
    } catch (error) {
        return sendFailure(res, error);
    }
}

/**
 * @swagger
 * /flights/future-status/activate:
 *   post:
 *     summary: Change every person with a Future-* status to Active
 *     description: |
 *       Accepts any status beginning with "Future-". Reads
 *       _design/basic/_view/all_by_status_and_name. Each changed person gets a
 *       flight.history status line and updated metadata.updated_at and
 *       metadata.updated_by, the same as an individual status edit. Matched
 *       people who are on a flight are still changed and listed in
 *       assignedToFlight.
 *     tags: [Flights]
 *     security:
 *       - GoogleAuth: []
 *     x-required-permission: flights:manage
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FutureStatusActivateRequest'
 *     responses:
 *       200:
 *         description: Every matching person was saved, including when nobody had the status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FlightStatusBulkResult'
 *       207:
 *         description: Some documents were attempted and one or more were not saved. failed lists their ids
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FlightStatusBulkResult'
 *       400:
 *         description: status is missing or does not begin with "Future-"
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - missing required permission
 *       500:
 *         description: Server error before any document was saved
 *       503:
 *         description: Database unreachable before any document was saved
 */
export async function activateFutureStatus(req, res) {
    let request;
    try {
        request = new FutureStatusRequest(req.body);
    } catch {
        return res.status(400).json({ error: 'status must begin with "Future-"' });
    }

    try {
        const status = request.status;
        const rows = await readExactView(req, 'all_by_status_and_name', status);
        const matched = uniquePeople(rows, (doc) => doc.flight?.status === status);
        const assignedToFlight = matched.filter((doc) => isOnFlight(doc)).map((doc) => doc._id);

        for (const doc of matched) {
            applyStatusChange(doc, 'Active', req.user);
        }

        const outcome = matched.length === 0
            ? { saved: [], failed: [], skipped: [] }
            : await saveBulkDocs(req, matched, {
                prepareRetry(fresh) {
                    const person = fresh?.type === 'Veteran' || fresh?.type === 'Guardian';
                    if (!person || fresh.flight?.status !== status) {
                        return { action: 'skip' };
                    }
                    applyStatusChange(fresh, 'Active', req.user);
                    return { action: 'save', doc: fresh };
                }
            });

        const changed = outcome.saved.length;
        const failedPeople = outcome.failed.length;
        const result = new FlightStatusBulkResult({
            fromStatus: status,
            toStatus: 'Active',
            assignedToFlight
        });
        result.setCounts({
            matched: matched.length,
            changed,
            skipped: matched.length - changed - failedPeople,
            failed: failedPeople
        });
        for (const failure of outcome.failed) {
            result.addFailure({
                id: failure.id,
                type: personType(matched.find((doc) => doc._id === failure.id)),
                status: failure.status,
                error: failure.error
            });
        }

        logRun({
            endpoint: 'POST /flights/future-status/activate',
            status,
            counts: result.counts,
            failed: result.failures.map((item) => item.id),
            assignedToFlight
        });
        return sendResult(res, result);
    } catch (error) {
        return sendFailure(res, error);
    }
}
