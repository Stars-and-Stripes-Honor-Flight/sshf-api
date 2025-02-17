import { Veteran } from '../models/veteran.js';

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
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Cookie': req.dbCookie,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(veteran.toJSON())
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.reason || 'Failed to create veteran document');
        }

        // Update the veteran with the new _id and _rev
        veteran._id = data.id;
        veteran._rev = data.rev;

        res.status(201).json(veteran.toJSON());
    } catch (error) {
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
        
        const response = await fetch(url, {
            headers: {
                'Cookie': req.dbCookie,
                'Accept': 'application/json'
            }
        });

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
        const getResponse = await fetch(url, {
            headers: {
                'Cookie': req.dbCookie,
                'Accept': 'application/json'
            }
        });

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

        // Create updated veteran object
        const updatedVeteran = new Veteran({
            ...req.body,
            _id: docId,
            _rev: currentDoc._rev
        });
        updatedVeteran.prepareForSave(req.user);
        updatedVeteran.validate();

        // Update the document
        const updateResponse = await fetch(url, {
            method: 'PUT',
            headers: {
                'Cookie': req.dbCookie,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedVeteran.toJSON())
        });

        const data = await updateResponse.json();
        if (!updateResponse.ok) {
            throw new Error(data.reason || 'Failed to update veteran');
        }

        // Update the revision
        updatedVeteran._rev = data.rev;
        res.json(updatedVeteran.toJSON());
    } catch (error) {
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
        const getResponse = await fetch(`${dbUrl}/${dbName}/${docId}`, {
            headers: {
                'Cookie': req.dbCookie,
                'Accept': 'application/json'
            }
        });

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

        const deleteResponse = await fetch(url, {
            method: 'DELETE',
            headers: {
                'Cookie': req.dbCookie,
                'Accept': 'application/json'
            }
        });

        const data = await deleteResponse.json();
        if (!deleteResponse.ok) {
            throw new Error(data.reason || 'Failed to delete veteran');
        }

        res.json(data);
    } catch (error) {
        console.error('Error deleting veteran:', error);
        res.status(500).json({ error: error.message });
    }
} 