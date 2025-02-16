import { Veteran } from '../models/veteran.js';

const dbUrl = process.env.DB_URL;
const dbName = process.env.DB_NAME;

// Create a new veteran document
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
        console.error('Error creating veteran document:', error);
        res.status(500).json({ error: error.message });
    }
}

// Get a veteran by ID
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

// Update a veteran
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
        console.error('Error updating veteran:', error);
        res.status(500).json({ error: error.message });
    }
}

// Delete a veteran
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