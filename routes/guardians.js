import { Guardian } from '../models/guardian.js';
import { Veteran } from '../models/veteran.js';
import { VALID_BUSES } from '../models/flight_detail.js';
import { dbFetch, DatabaseSessionError } from '../utils/db.js';

const dbUrl = process.env.DB_URL;
const dbName = process.env.DB_NAME;

/**
 * @swagger
 * /guardians:
 *   post:
 *     summary: Create a new guardian record
 *     tags: [Guardians]
 *     security:
 *       - GoogleAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Guardian'
 *     responses:
 *       201:
 *         description: Guardian record created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Guardian'
 *       400:
 *         description: Invalid guardian data
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
export async function createGuardian(req, res) {
    try {
        const guardian = new Guardian(req.body);
        guardian.prepareForSave(req.user);
        guardian.validate();
        delete guardian._id;
        delete guardian._rev;

        const url = `${dbUrl}/${dbName}`;
        const response = await dbFetch(req, url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(guardian.toJSON())
        });

        if (!response.ok) {
            const data = await response.json();
            throw new Error(data.reason || 'Failed to create guardian document');
        }

        const data = await response.json();
        
        // Update the guardian with the new _id and _rev
        guardian._id = data.id;
        guardian._rev = data.rev;

        res.status(201).json(guardian.toJSON());
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        if (error.message.includes('Validation failed')) {
            res.status(400).json({ error: error.message });
        } else {
            console.error('Error creating guardian document:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

/**
 * @swagger
 * /guardians/{id}:
 *   get:
 *     summary: Retrieve a guardian record by ID
 *     tags: [Guardians]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Guardian record ID
 *     responses:
 *       200:
 *         description: Guardian record retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Guardian'
 *       400:
 *         description: Document is not a guardian record
 *       404:
 *         description: Guardian not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export async function retrieveGuardian(req, res) {
    try {
        const docId = req.params.id;
        const url = `${dbUrl}/${dbName}/${docId}`;
        
        const response = await dbFetch(req, url);

        const data = await response.json();
        if (!response.ok) {
            if (response.status === 404) {
                return res.status(404).json({ error: 'Guardian not found' });
            }
            throw new Error(data.reason || 'Failed to get guardian');
        }

        // Verify this is a guardian document
        if (data.type !== 'Guardian') {
            return res.status(400).json({ error: 'Document is not a guardian record' });
        }

        const guardian = Guardian.fromJSON(data);
        res.json(guardian.toJSON());
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error getting guardian:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * Constructs a full name from first and last name
 * @param {Object} name - Name object with first and last properties
 * @returns {string} Full name in format "First Last"
 */
function constructGuardianFullName(name) {
    return `${name.first} ${name.last}`.trim();
}

/**
 * Updates a veteran's guardian reference when pairing changes
 * @param {string} veteranId - ID of the veteran to update
 * @param {string} guardianId - ID of the guardian
 * @param {string} guardianName - Full name of the guardian
 * @param {string} action - 'add' or 'remove'
 * @param {Object} user - User object with firstName and lastName
 * @param {string} timestamp - Timestamp in yyyy-MM-DDThh:mm:ssZ format
 * @param {Object} req - Express request object with dbCookie
 * @returns {Promise<{success: boolean, error?: string, veteranName?: string}>}
 */
async function updateVeteranGuardianReference(veteranId, guardianId, guardianName, action, user, timestamp, req) {
    try {
        const veteranUrl = `${dbUrl}/${dbName}/${veteranId}`;
        
        // Fetch the current veteran document
        const getVeteranResponse = await dbFetch(req, veteranUrl);

        if (!getVeteranResponse.ok) {
            if (getVeteranResponse.status === 404) {
                return { success: false, error: `Veteran ${veteranId} not found` };
            }
            const errorData = await getVeteranResponse.json();
            return { success: false, error: errorData.reason || 'Failed to get veteran' };
        }

        const currentVeteranDoc = await getVeteranResponse.json();
        
        // Verify this is a veteran document
        if (currentVeteranDoc.type !== 'Veteran') {
            return { success: false, error: `Document ${veteranId} is not a veteran record` };
        }

        const currentVeteran = Veteran.fromJSON(currentVeteranDoc);
        const veteranName = `${currentVeteran.name.first} ${currentVeteran.name.last}`.trim();

        // Create updated veteran object
        const updatedVeteran = new Veteran({
            ...currentVeteranDoc,
            _id: veteranId,
            _rev: currentVeteranDoc._rev
        });

        // Preserve server-controlled fields
        updatedVeteran.type = 'Veteran';
        updatedVeteran.metadata.created_at = currentVeteran.metadata.created_at;
        updatedVeteran.metadata.created_by = currentVeteran.metadata.created_by;
        
        // Preserve history arrays from current document
        updatedVeteran.flight.history = currentVeteran.flight.history;
        updatedVeteran.call.history = currentVeteran.call.history;
        updatedVeteran.guardian.history = currentVeteran.guardian.history;
        updatedVeteran.guardian.pref_notes = currentVeteran.guardian.pref_notes;

        // Update guardian reference based on action
        const userName = `${user.firstName} ${user.lastName}`;
        if (action === 'add') {
            updatedVeteran.guardian.id = guardianId;
            updatedVeteran.guardian.name = guardianName;
            updatedVeteran.guardian.history.push({
                id: timestamp,
                change: `paired to: ${guardianName} by: ${userName}`
            });
        } else if (action === 'remove') {
            updatedVeteran.guardian.id = '';
            updatedVeteran.guardian.name = '';
            updatedVeteran.guardian.history.push({
                id: timestamp,
                change: `unpaired from: ${guardianName} by: ${userName}`
            });
        }

        updatedVeteran.prepareForSave(user);
        updatedVeteran.validate();

        // Update the veteran document
        const updateVeteranResponse = await dbFetch(req, veteranUrl, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedVeteran.toJSON())
        });

        if (!updateVeteranResponse.ok) {
            const errorData = await updateVeteranResponse.json();
            return { success: false, error: errorData.reason || 'Failed to update veteran' };
        }

        return { success: true, veteranName };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * @swagger
 * /guardians/{id}:
 *   put:
 *     summary: Update a guardian record
 *     tags: [Guardians]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Guardian record ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Guardian'
 *     responses:
 *       200:
 *         description: Guardian record updated successfully. When veteran.pairings array is modified, the affected veteran records are automatically updated to reflect the pairing changes. History entries are added to both guardian and veteran records.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Guardian'
 *       400:
 *         description: Invalid guardian data or document is not a guardian record
 *       404:
 *         description: Guardian not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 *     x-code-samples:
 *       - lang: 'JavaScript'
 *         label: 'Example: Adding a veteran pairing'
 *         source: |
 *           // When updating veteran.pairings, the system automatically:
 *           // 1. Updates the veteran's guardian.id and guardian.name
 *           // 2. Adds history entries to both guardian and veteran records
 *           const response = await fetch('/guardians/guardian-id', {
 *             method: 'PUT',
 *             body: JSON.stringify({
 *               veteran: {
 *                 pairings: [{ id: 'veteran-id', name: 'Veteran Name' }]
 *               }
 *             })
 *           });
 */
export async function updateGuardian(req, res) {
    try {
        const docId = req.params.id;
        const url = `${dbUrl}/${dbName}/${docId}`;
        
        // First, get the current document
        const getResponse = await dbFetch(req, url);

        if (!getResponse.ok) {
            if (getResponse.status === 404) {
                return res.status(404).json({ error: 'Guardian not found' });
            }
            throw new Error('Failed to get guardian for update');
        }

        const currentDoc = await getResponse.json();
        
        // Verify this is a guardian document
        if (currentDoc.type !== 'Guardian') {
            return res.status(400).json({ error: 'Document is not a guardian record' });
        }
        const currentGuardian = Guardian.fromJSON(currentDoc);

        // Create updated guardian object
        const updatedGuardian = new Guardian({
            ...req.body,
            _id: docId,
            _rev: currentDoc._rev
        });
        
        // Preserve server-controlled fields
        updatedGuardian.type = 'Guardian'; // Force type to remain "Guardian"
        
        // Preserve metadata creation fields from current document
        updatedGuardian.metadata.created_at = currentGuardian.metadata.created_at;
        updatedGuardian.metadata.created_by = currentGuardian.metadata.created_by;
        
        // Preserve history arrays from current document
        updatedGuardian.flight.history = currentGuardian.flight.history;
        updatedGuardian.veteran.history = currentGuardian.veteran.history;
        updatedGuardian.call.history = currentGuardian.call.history;
        
        // Validate the guardian data BEFORE making any database changes
        // This prevents leaving veteran records in an inconsistent state if validation fails
        updatedGuardian.updateHistory(currentGuardian, req.user);
        updatedGuardian.prepareForSave(req.user);
        updatedGuardian.validate();
        
        // Handle veteran pairing changes (only after validation succeeds)
        const currentPairings = currentGuardian.veteran.pairings;
        const newPairings = updatedGuardian.veteran.pairings;
        
        // Extract IDs for comparison
        const currentPairingIds = new Set(currentPairings.map(p => p.id));
        const newPairingIds = new Set(newPairings.map(p => p.id));
        
        // Identify added and removed veterans
        const addedVeterans = newPairings.filter(p => !currentPairingIds.has(p.id));
        const removedVeterans = currentPairings.filter(p => !newPairingIds.has(p.id));
        
        // Generate timestamp for history entries
        const now = new Date();
        const timestamp = now.toISOString().split('.')[0] + 'Z';
        const guardianName = constructGuardianFullName(updatedGuardian.name);
        const userName = `${req.user.firstName} ${req.user.lastName}`;
        const errors = [];
        
        // Process added veterans
        for (const pairing of addedVeterans) {
            const result = await updateVeteranGuardianReference(
                pairing.id,
                docId,
                guardianName,
                'add',
                req.user,
                timestamp,
                req
            );
            
            if (result.success) {
                // Add history entry to guardian
                updatedGuardian.veteran.history.push({
                    id: timestamp,
                    change: `paired to: ${result.veteranName} by: ${userName}`
                });
            } else {
                errors.push(`Failed to add pairing for veteran ${pairing.id}: ${result.error}`);
                console.warn(`Guardian pairing sync warning: ${result.error}`);
            }
        }
        
        // Process removed veterans
        for (const pairing of removedVeterans) {
            const result = await updateVeteranGuardianReference(
                pairing.id,
                docId,
                guardianName,
                'remove',
                req.user,
                timestamp,
                req
            );
            
            if (result.success) {
                // Add history entry to guardian
                updatedGuardian.veteran.history.push({
                    id: timestamp,
                    change: `unpaired from: ${result.veteranName} by: ${userName}`
                });
            } else {
                errors.push(`Failed to remove pairing for veteran ${pairing.id}: ${result.error}`);
                console.warn(`Guardian pairing sync warning: ${result.error}`);
            }
        }
        
        // Log any errors but don't fail the entire update
        if (errors.length > 0) {
            console.error('Guardian pairing synchronization errors:', errors);
        }

        // Update the document
        const updateResponse = await dbFetch(req, url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedGuardian.toJSON())
        });

        if (!updateResponse.ok) {
            const data = await updateResponse.json();
            throw new Error(data.reason || 'Failed to update guardian');
        }

        const data = await updateResponse.json();

        // Update the revision
        updatedGuardian._rev = data.rev;
        res.json(updatedGuardian.toJSON());
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        if (error.message.includes('Validation failed')) {
            res.status(400).json({ error: error.message });
        } else {
            console.error('Error updating guardian:', error);
            res.status(500).json({ error: error.message });
        }
    }
}

/**
 * @swagger
 * /guardians/{id}:
 *   delete:
 *     summary: Delete a guardian record
 *     tags: [Guardians]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Guardian record ID
 *     responses:
 *       200:
 *         description: Guardian record deleted successfully
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
 *         description: Document is not a guardian record
 *       404:
 *         description: Guardian not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export async function deleteGuardian(req, res) {
    try {
        const docId = req.params.id;
        
        // First, get the current document
        const getResponse = await dbFetch(req, `${dbUrl}/${dbName}/${docId}`);

        if (!getResponse.ok) {
            if (getResponse.status === 404) {
                return res.status(404).json({ error: 'Guardian not found' });
            }
            throw new Error('Failed to get guardian for deletion');
        }

        const currentDoc = await getResponse.json();
        
        // Verify this is a guardian document
        if (currentDoc.type !== 'Guardian') {
            return res.status(400).json({ error: 'Document is not a guardian record' });
        }

        const url = `${dbUrl}/${dbName}/${docId}?rev=${currentDoc._rev}`;

        const deleteResponse = await dbFetch(req, url, {
            method: 'DELETE'
        });

        const data = await deleteResponse.json();
        if (!deleteResponse.ok) {
            throw new Error(data.reason || 'Failed to delete guardian');
        }

        res.json(data);
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error deleting guardian:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * @swagger
 * /guardians/{id}/seat:
 *   patch:
 *     summary: Update a guardian's seat assignment
 *     description: |
 *       Quickly updates only the seat assignment for a guardian without loading the full model.
 *       Adds a history entry for the change.
 *     tags: [Guardians]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Guardian record ID
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
 *         description: Invalid request or document is not a guardian record
 *       404:
 *         description: Guardian not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export async function updateGuardianSeat(req, res) {
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
                return res.status(404).json({ error: 'Guardian not found' });
            }
            throw new Error('Failed to get guardian for update');
        }

        const doc = await getResponse.json();

        // Verify this is a guardian document
        if (doc.type !== 'Guardian') {
            return res.status(400).json({ error: 'Document is not a guardian record' });
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
            throw new Error(data.reason || 'Failed to update guardian seat');
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
        console.error('Error updating guardian seat:', error);
        res.status(500).json({ error: error.message });
    }
}

/**
 * @swagger
 * /guardians/{id}/bus:
 *   patch:
 *     summary: Update a guardian's bus assignment
 *     description: |
 *       Quickly updates only the bus assignment for a guardian without loading the full model.
 *       Adds a history entry for the change.
 *       Bus must be one of: None, Alpha1, Alpha2, Alpha3, Alpha4, Alpha5, Bravo1, Bravo2, Bravo3, Bravo4, Bravo5
 *     tags: [Guardians]
 *     security:
 *       - GoogleAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Guardian record ID
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
 *         description: Invalid request, invalid bus value, or document is not a guardian record
 *       404:
 *         description: Guardian not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
export async function updateGuardianBus(req, res) {
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
                return res.status(404).json({ error: 'Guardian not found' });
            }
            throw new Error('Failed to get guardian for update');
        }

        const doc = await getResponse.json();

        // Verify this is a guardian document
        if (doc.type !== 'Guardian') {
            return res.status(400).json({ error: 'Document is not a guardian record' });
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
            throw new Error(data.reason || 'Failed to update guardian bus');
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
        console.error('Error updating guardian bus:', error);
        res.status(500).json({ error: error.message });
    }
} 