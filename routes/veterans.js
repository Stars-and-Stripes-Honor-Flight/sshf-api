import { Veteran } from '../models/veteran.js';
import { UnpairedVeteranRequest } from '../models/unpaired_veteran_request.js';
import { UnpairedVeteranResults } from '../models/unpaired_veteran_results.js';
import { VALID_BUSES } from '../models/flight_detail.js';
import { dbFetch, DatabaseSessionError } from '../utils/db.js';

const dbUrl = process.env.DB_URL;
const dbName = process.env.DB_NAME;

/**
 * @swagger
 * /veterans:
 *   post:
 *     summary: Create a new veteran record
 *     tags: [Veterans]
 *     security:
 *       - GoogleAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Veteran'
 *     responses:
 *       201:
 *         description: Veteran record created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Veteran'
 *       400:
 *         description: Invalid veteran data
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
export async function createVeteran(req, res) {
    try {
        const veteran = new Veteran(req.body);
        veteran.prepareForSave(req.user);
        veteran.validate();
        delete veteran._id;
        delete veteran._rev;

        const url = `${dbUrl}/${dbName}`;
        const response = await dbFetch(req, url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(veteran.toJSON())
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.reason || 'Failed to create veteran document');
        }

        const data = await response.json();
        
        // Update the veteran with the new _id and _rev
        veteran._id = data.id;
        veteran._rev = data.rev;

        res.status(201).json(veteran.toJSON());
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        if (error.message.includes('Validation failed')) {
            res.status(400).json({ error: error.message });
        } else {
            console.error('Error creating veteran document:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

/**
 * @swagger
 * /veterans/{id}:
 *   get:
 *     summary: Retrieve a veteran record by ID
 *     tags: [Veterans]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Veteran record ID
 *     responses:
 *       200:
 *         description: Veteran record retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Veteran'
 *       400:
 *         description: Document is not a veteran record
 *       404:
 *         description: Veteran not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export async function retrieveVeteran(req, res) {
    try {
        const docId = req.params.id;
        const url = `${dbUrl}/${dbName}/${docId}`;
        
        const response = await dbFetch(req, url);

        const data = await response.json();
        if (!response.ok) {
            if (response.status === 404) {
                return res.status(404).json({ error: 'Veteran not found' });
            }
            throw new Error(data.reason || 'Failed to get veteran');
        }

        // Verify this is a veteran document
        if (data.type !== 'Veteran') {
            return res.status(400).json({ error: 'Document is not a veteran record' });
        }

        const veteran = Veteran.fromJSON(data);
        res.json(veteran.toJSON());
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error getting veteran:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * @swagger
 * /veterans/{id}:
 *   put:
 *     summary: Update a veteran record
 *     tags: [Veterans]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Veteran record ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Veteran'
 *     responses:
 *       200:
 *         description: Veteran record updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Veteran'
 *       400:
 *         description: Invalid veteran data or document is not a veteran record
 *       404:
 *         description: Veteran not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export async function updateVeteran(req, res) {
    try {
        const docId = req.params.id;
        const url = `${dbUrl}/${dbName}/${docId}`;
        
        // First, get the current document
        const getResponse = await dbFetch(req, url);

        if (!getResponse.ok) {
            if (getResponse.status === 404) {
                return res.status(404).json({ error: 'Veteran not found' });
            }
            throw new Error('Failed to get veteran for update');
        }

        const currentDoc = await getResponse.json();
        
        // Verify this is a veteran document
        if (currentDoc.type !== 'Veteran') {
            return res.status(400).json({ error: 'Document is not a veteran record' });
        }
        const currentVeteran = Veteran.fromJSON(currentDoc);

        // Create updated veteran object
        const updatedVeteran = new Veteran({
            ...req.body,
            _id: docId,
            _rev: currentDoc._rev
        });
        
        // Preserve server-controlled fields
        updatedVeteran.type = 'Veteran'; // Force type to remain "Veteran"
        
        // Preserve metadata creation fields from current document
        updatedVeteran.metadata.created_at = currentVeteran.metadata.created_at;
        updatedVeteran.metadata.created_by = currentVeteran.metadata.created_by;
        
        // Preserve history arrays from current document
        updatedVeteran.flight.history = currentVeteran.flight.history;
        updatedVeteran.guardian.history = currentVeteran.guardian.history;
        updatedVeteran.call.history = currentVeteran.call.history;
        
        updatedVeteran.updateHistory(currentVeteran, req.user);
        updatedVeteran.prepareForSave(req.user);
        updatedVeteran.validate();

        // Update the document
        const updateResponse = await dbFetch(req, url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedVeteran.toJSON())
        });

        if (!updateResponse.ok) {
            const data = await updateResponse.json();
            throw new Error(data.reason || 'Failed to update veteran');
        }

        const data = await updateResponse.json();

        // Update the revision
        updatedVeteran._rev = data.rev;
        res.json(updatedVeteran.toJSON());
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        if (error.message.includes('Validation failed')) {
            res.status(400).json({ error: error.message });
        } else {
            console.error('Error updating veteran:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

/**
 * @swagger
 * /veterans/{id}:
 *   delete:
 *     summary: Delete a veteran record
 *     tags: [Veterans]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Veteran record ID
 *     responses:
 *       200:
 *         description: Veteran record deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 id:
 *                   type: string
 *                 rev:
 *                   type: string
 *       400:
 *         description: Document is not a veteran record
 *       404:
 *         description: Veteran not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export async function deleteVeteran(req, res) {
    try {
        const docId = req.params.id;
        
        // First, get the current document
        const getResponse = await dbFetch(req, `${dbUrl}/${dbName}/${docId}`);

        if (!getResponse.ok) {
            if (getResponse.status === 404) {
                return res.status(404).json({ error: 'Veteran not found' });
            }
            throw new Error('Failed to get veteran for deletion');
        }

        const currentDoc = await getResponse.json();
        
        // Verify this is a veteran document
        if (currentDoc.type !== 'Veteran') {
            return res.status(400).json({ error: 'Document is not a veteran record' });
        }

        const url = `${dbUrl}/${dbName}/${docId}?rev=${currentDoc._rev}`;

        const deleteResponse = await dbFetch(req, url, {
            method: 'DELETE'
        });

        const data = await deleteResponse.json();
        if (!deleteResponse.ok) {
            throw new Error(data.reason || 'Failed to delete veteran');
        }

        res.json(data);
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error deleting veteran:', error);
        res.status(500).json({ error: error.message });
    }
}

async function searchUnpaired(searchRequest, req) {
    const viewName = searchRequest.getViewName();
    const queryParams = searchRequest.toQueryParams();
    const url = `${dbUrl}/${dbName}/_design/basic/_view/${viewName}?${queryParams}&descending=false`;
    
    const response = await dbFetch(req, url, {
        headers: {
            'Content-Type': 'application/json'
        }
    });
    
    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.reason || data.error || 'Failed to search unpaired veterans');
    }
    
    return data;
}

/**
 * @swagger
 * /veterans/search:
 *   get:
 *     summary: Search for unpaired veterans
 *     description: |
 *       Searches for unpaired veterans based on provided criteria.
 *       Currently only supports searching for unpaired veterans (paired=false).
 *       The search uses the unpaired_veterans_by_last_name view which filters
 *       veterans where guardian.id is empty.
 *     tags: [Veterans]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: query
 *         name: paired
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Whether to search for paired veterans (currently not implemented)
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: ['Active', 'Flown', 'Deceased', 'Removed', 'Future-Spring', 'Future-Fall', 'Future-PostRestriction']
 *           default: 'Active'
 *         description: Flight status filter for the search
 *       - in: query
 *         name: lastname
 *         schema:
 *           type: string
 *         description: Last name to search for (partial match, case-insensitive)
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 25
 *         description: Maximum number of results to return
 *     responses:
 *       200:
 *         description: Search completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UnpairedVeteranResults'
 *             example:
 *               - id: "doc1"
 *                 name: "John Smith"
 *                 city: "Chicago, IL"
 *                 flight: "F23"
 *                 prefs: "Prefers window seat"
 *               - id: "doc2"
 *                 name: "Jane Doe"
 *                 city: "New York, NY"
 *                 flight: "F24"
 *                 prefs: ""
 *       501:
 *         description: Not Implemented - paired=true is not yet supported
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 error:
 *                   type: string
 */
export async function searchUnpairedVeterans(req, res) {
    try {
        const searchRequest = new UnpairedVeteranRequest(req.query);
        
        // If paired is true, return Not Implemented
        if (searchRequest.paired) {
            return res.status(501).json({ error: 'Not Implemented: paired=true is not yet supported' });
        }
        
        const dbResult = await searchUnpaired(searchRequest, req);
        const searchResults = new UnpairedVeteranResults(dbResult);
        res.json(searchResults.toJSON());
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error searching unpaired veterans:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * @swagger
 * /veterans/{id}/seat:
 *   patch:
 *     summary: Update a veteran's seat assignment
 *     description: |
 *       Quickly updates only the seat assignment for a veteran without loading the full model.
 *       Adds a history entry for the change.
 *     tags: [Veterans]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Veteran record ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - value
 *             properties:
 *               value:
 *                 type: string
 *                 description: New seat assignment (e.g., "14A")
 *     responses:
 *       200:
 *         description: Seat updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 id:
 *                   type: string
 *                 rev:
 *                   type: string
 *                 seat:
 *                   type: string
 *       400:
 *         description: Invalid request or document is not a veteran record
 *       404:
 *         description: Veteran not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export async function updateVeteranSeat(req, res) {
    try {
        const docId = req.params.id;
        const { value } = req.body;

        // Validate request body
        if (value === undefined || value === null) {
            return res.status(400).json({ error: 'value is required' });
        }

        const newSeat = String(value);

        // Get the current document
        const url = `${dbUrl}/${dbName}/${docId}`;
        const getResponse = await dbFetch(req, url);

        if (!getResponse.ok) {
            if (getResponse.status === 404) {
                return res.status(404).json({ error: 'Veteran not found' });
            }
            throw new Error('Failed to get veteran for update');
        }

        const doc = await getResponse.json();

        // Verify this is a veteran document
        if (doc.type !== 'Veteran') {
            return res.status(400).json({ error: 'Document is not a veteran record' });
        }

        // Get current seat value
        const oldSeat = doc.flight?.seat || '';

        // Update seat
        if (!doc.flight) {
            doc.flight = {};
        }
        doc.flight.seat = newSeat;

        // Add history entry
        if (!doc.flight.history) {
            doc.flight.history = [];
        }
        const userName = req.user.firstName + ' ' + req.user.lastName;
        const timestamp = new Date().toISOString().split('.')[0] + 'Z';
        doc.flight.history.push({
            id: timestamp,
            change: `changed seat from: ${oldSeat} to: ${newSeat} by: ${userName}`
        });

        // Update metadata
        if (!doc.metadata) {
            doc.metadata = {};
        }
        doc.metadata.updated_at = timestamp;
        doc.metadata.updated_by = userName;

        // Save the document
        const updateResponse = await dbFetch(req, url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(doc)
        });

        if (!updateResponse.ok) {
            const data = await updateResponse.json();
            throw new Error(data.reason || 'Failed to update veteran seat');
        }

        const data = await updateResponse.json();
        res.json({
            ok: true,
            id: data.id,
            rev: data.rev,
            seat: newSeat
        });
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error updating veteran seat:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * @swagger
 * /veterans/{id}/bus:
 *   patch:
 *     summary: Update a veteran's bus assignment
 *     description: |
 *       Quickly updates only the bus assignment for a veteran without loading the full model.
 *       Adds a history entry for the change.
 *       Bus must be one of: None, Alpha1, Alpha2, Alpha3, Alpha4, Alpha5, Bravo1, Bravo2, Bravo3, Bravo4, Bravo5
 *     tags: [Veterans]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Veteran record ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - value
 *             properties:
 *               value:
 *                 type: string
 *                 enum: [None, Alpha1, Alpha2, Alpha3, Alpha4, Alpha5, Bravo1, Bravo2, Bravo3, Bravo4, Bravo5]
 *                 description: New bus assignment
 *     responses:
 *       200:
 *         description: Bus updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 id:
 *                   type: string
 *                 rev:
 *                   type: string
 *                 bus:
 *                   type: string
 *       400:
 *         description: Invalid request, invalid bus value, or document is not a veteran record
 *       404:
 *         description: Veteran not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export async function updateVeteranBus(req, res) {
    try {
        const docId = req.params.id;
        const { value } = req.body;

        // Validate request body
        if (value === undefined || value === null) {
            return res.status(400).json({ error: 'value is required' });
        }

        const newBus = String(value);

        // Validate bus value
        if (!VALID_BUSES.includes(newBus)) {
            return res.status(400).json({ 
                error: `Invalid bus value. Must be one of: ${VALID_BUSES.join(', ')}` 
            });
        }

        // Get the current document
        const url = `${dbUrl}/${dbName}/${docId}`;
        const getResponse = await dbFetch(req, url);

        if (!getResponse.ok) {
            if (getResponse.status === 404) {
                return res.status(404).json({ error: 'Veteran not found' });
            }
            throw new Error('Failed to get veteran for update');
        }

        const doc = await getResponse.json();

        // Verify this is a veteran document
        if (doc.type !== 'Veteran') {
            return res.status(400).json({ error: 'Document is not a veteran record' });
        }

        // Get current bus value
        const oldBus = doc.flight?.bus || 'None';

        // Update bus
        if (!doc.flight) {
            doc.flight = {};
        }
        doc.flight.bus = newBus;

        // Add history entry
        if (!doc.flight.history) {
            doc.flight.history = [];
        }
        const userName = req.user.firstName + ' ' + req.user.lastName;
        const timestamp = new Date().toISOString().split('.')[0] + 'Z';
        doc.flight.history.push({
            id: timestamp,
            change: `changed bus from: ${oldBus} to: ${newBus} by: ${userName}`
        });

        // Update metadata
        if (!doc.metadata) {
            doc.metadata = {};
        }
        doc.metadata.updated_at = timestamp;
        doc.metadata.updated_by = userName;

        // Save the document
        const updateResponse = await dbFetch(req, url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(doc)
        });

        if (!updateResponse.ok) {
            const data = await updateResponse.json();
            throw new Error(data.reason || 'Failed to update veteran bus');
        }

        const data = await updateResponse.json();
        res.json({
            ok: true,
            id: data.id,
            rev: data.rev,
            bus: newBus
        });
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error updating veteran bus:', error);
        res.status(500).json({ error: error.message });
    }
} 