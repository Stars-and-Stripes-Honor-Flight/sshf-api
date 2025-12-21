import { Flight } from '../models/flight.js';
import { dbFetch, DatabaseSessionError } from '../utils/db.js';

const dbUrl = process.env.DB_URL;
const dbName = process.env.DB_NAME;

/**
 * @swagger
 * /flights:
 *   get:
 *     summary: Retrieve a list of all flights
 *     description: |
 *       Retrieves all flights from the database using the CouchDB "Flights" view.
 *       Returns an array of flight objects containing name, flight_date, capacity, and completed fields.
 *     tags: [Flights]
 *     security:
 *       - GoogleAuth: []
 *     responses:
 *       200:
 *         description: List of flights retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   _id:
 *                     type: string
 *                     description: Flight document ID
 *                   name:
 *                     type: string
 *                     description: Flight name
 *                   flight_date:
 *                     type: string
 *                     format: date
 *                     description: Flight date in YYYY-MM-DD format
 *                   capacity:
 *                     type: integer
 *                     description: Flight capacity
 *                   completed:
 *                     type: boolean
 *                     description: Whether the flight is completed
 *             example:
 *               - _id: "422fc05d0401190a7a13ad7ffde62d3c"
 *                 name: "SSHF-Nov2011"
 *                 flight_date: "2011-11-05"
 *                 capacity: 448
 *                 completed: true
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
export async function listFlights(req, res) {
    try {
        const url = `${dbUrl}/${dbName}/_design/basic/_view/flights?limit=500&include_docs=true&descending=true`;
        
        const response = await dbFetch(req, url, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.reason || 'Failed to retrieve flights');
        }

        const data = await response.json();
        
        // Extract flight documents from view results
        // CouchDB view returns rows with id, key, value/doc
        const flights = data.rows.map(row => {
            // With include_docs=true, the document is in row.doc
            // Fallback to row.value if doc is not available
            const flightDoc = row.doc || row.value || {};
            return {
                _id: flightDoc._id || row.id || '',
                name: flightDoc.name || '',
                flight_date: flightDoc.flight_date || '',
                capacity: flightDoc.capacity || 0,
                completed: flightDoc.completed || false
            };
        });

        res.json(flights);
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error retrieving flights:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * @swagger
 * /flights:
 *   post:
 *     summary: Create a new flight record
 *     tags: [Flights]
 *     security:
 *       - GoogleAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Flight'
 *     responses:
 *       201:
 *         description: Flight record created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Flight'
 *       400:
 *         description: Invalid flight data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export async function createFlight(req, res) {
    try {
        const flight = new Flight(req.body);
        // Set completed to false by default for new flights
        flight.completed = false;
        flight.prepareForSave(req.user);
        flight.validate();
        delete flight._id;
        delete flight._rev;

        const url = `${dbUrl}/${dbName}`;
        const response = await dbFetch(req, url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(flight.toJSON())
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.reason || 'Failed to create flight document');
        }

        const data = await response.json();
        
        // Update the flight with the new _id and _rev
        flight._id = data.id;
        flight._rev = data.rev;

        res.status(201).json(flight.toJSON());
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        if (error.message.includes('Validation failed')) {
            res.status(400).json({ error: error.message });
        } else {
            console.error('Error creating flight document:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

/**
 * @swagger
 * /flights/{id}:
 *   get:
 *     summary: Retrieve a flight record by ID
 *     tags: [Flights]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Flight record ID
 *     responses:
 *       200:
 *         description: Flight record retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Flight'
 *       400:
 *         description: Document is not a flight record
 *       404:
 *         description: Flight not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export async function retrieveFlight(req, res) {
    try {
        const docId = req.params.id;
        const url = `${dbUrl}/${dbName}/${docId}`;
        
        const response = await dbFetch(req, url);

        const data = await response.json();
        if (!response.ok) {
            if (response.status === 404) {
                return res.status(404).json({ error: 'Flight not found' });
            }
            throw new Error(data.reason || 'Failed to get flight');
        }

        // Verify this is a flight document
        if (data.type !== 'Flight') {
            return res.status(400).json({ error: 'Document is not a flight record' });
        }

        const flight = Flight.fromJSON(data);
        res.json(flight.toJSON());
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error getting flight:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * @swagger
 * /flights/{id}:
 *   put:
 *     summary: Update a flight record
 *     tags: [Flights]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Flight record ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Flight'
 *     responses:
 *       200:
 *         description: Flight record updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Flight'
 *       400:
 *         description: Invalid flight data or document is not a flight record
 *       404:
 *         description: Flight not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export async function updateFlight(req, res) {
    try {
        const docId = req.params.id;
        const url = `${dbUrl}/${dbName}/${docId}`;
        
        // First, get the current document
        const getResponse = await dbFetch(req, url);

        if (!getResponse.ok) {
            if (getResponse.status === 404) {
                return res.status(404).json({ error: 'Flight not found' });
            }
            throw new Error('Failed to get flight for update');
        }

        const currentDoc = await getResponse.json();
        
        // Verify this is a flight document
        if (currentDoc.type !== 'Flight') {
            return res.status(400).json({ error: 'Document is not a flight record' });
        }
        const currentFlight = Flight.fromJSON(currentDoc);

        // Create updated flight object
        const updatedFlight = new Flight({
            ...req.body,
            _id: docId,
            _rev: currentDoc._rev
        });
        
        // Preserve server-controlled fields
        updatedFlight.type = 'Flight'; // Force type to remain "Flight"
        
        // Preserve metadata creation fields from current document
        updatedFlight.metadata.created_at = currentFlight.metadata.created_at;
        updatedFlight.metadata.created_by = currentFlight.metadata.created_by;
        
        updatedFlight.prepareForSave(req.user);
        updatedFlight.validate();

        // Update the document
        const updateResponse = await dbFetch(req, url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedFlight.toJSON())
        });

        if (!updateResponse.ok) {
            const data = await updateResponse.json();
            throw new Error(data.reason || 'Failed to update flight');
        }

        const data = await updateResponse.json();

        // Update the revision
        updatedFlight._rev = data.rev;
        res.json(updatedFlight.toJSON());
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        if (error.message.includes('Validation failed')) {
            res.status(400).json({ error: error.message });
        } else {
            console.error('Error updating flight:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

