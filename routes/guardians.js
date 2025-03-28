import { Guardian } from '../models/guardian.js';

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
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Cookie': req.dbCookie,
                'Accept': 'application/json',
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
        
        const response = await fetch(url, {
            headers: {
                'Cookie': req.dbCookie,
                'Accept': 'application/json'
            }
        });

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
        console.error('Error getting guardian:', error);
        res.status(500).json({ error: error.message });
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
 *         description: Guardian record updated successfully
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
 */
export async function updateGuardian(req, res) {
    try {
        const docId = req.params.id;
        const url = `${dbUrl}/${dbName}/${docId}`;
        
        // First, get the current document
        const getResponse = await fetch(url, {
            headers: {
                'Cookie': req.dbCookie,
                'Accept': 'application/json'
            }
        });

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
        updatedGuardian.updateHistory(currentGuardian, req.user);
        updatedGuardian.prepareForSave(req.user);
        updatedGuardian.validate();

        // Update the document
        const updateResponse = await fetch(url, {
            method: 'PUT',
            headers: {
                'Cookie': req.dbCookie,
                'Accept': 'application/json',
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
        const getResponse = await fetch(`${dbUrl}/${dbName}/${docId}`, {
            headers: {
                'Cookie': req.dbCookie,
                'Accept': 'application/json'
            }
        });

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

        const deleteResponse = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Cookie': req.dbCookie,
                'Accept': 'application/json'
            }
        });

        const data = await deleteResponse.json();
        if (!deleteResponse.ok) {
            throw new Error(data.reason || 'Failed to delete guardian');
        }

        res.json(data);
    } catch (error) {
        console.error('Error deleting guardian:', error);
        res.status(500).json({ error: error.message });
    }
} 