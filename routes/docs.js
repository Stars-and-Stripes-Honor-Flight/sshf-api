import { dbFetch, DatabaseSessionError } from '../utils/db.js';

const dbUrl = process.env.DB_URL;
const dbName = process.env.DB_NAME;

// Create a new document
export async function createDocument(req, res) {
    try {
        const url = `${dbUrl}/${dbName}`;
        const response = await dbFetch(req, url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(req.body)
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.reason || 'Failed to create document');
        }

        res.status(201).json(data);
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error creating document:', error);
        res.status(500).json({ error: error.message });
    }
}

// Get a document by ID
export async function retrieveDocument(req, res) {
    try {
        const docId = req.params.id;
        const url = `${dbUrl}/${dbName}/${docId}`;
        
        const response = await dbFetch(req, url);

        const data = await response.json();
        if (!response.ok) {
            if (response.status === 404) {
                return res.status(404).json({ error: 'Document not found' });
            }
            throw new Error(data.reason || 'Failed to get document');
        }

        res.json(data);
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error getting document:', error);
        res.status(500).json({ error: error.message });
    }
}

// Update a document
export async function updateDocument(req, res) {
    try {
        const docId = req.params.id;
        const url = `${dbUrl}/${dbName}/${docId}`;
        
        // First, get the current revision
        const getResponse = await dbFetch(req, url);

        if (!getResponse.ok) {
            if (getResponse.status === 404) {
                return res.status(404).json({ error: 'Document not found' });
            }
            throw new Error('Failed to get document for update');
        }

        const currentDoc = await getResponse.json();
        const updatedDoc = { ...req.body, _rev: currentDoc._rev };

        // Then, update the document
        const updateResponse = await dbFetch(req, url, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updatedDoc)
        });

        const data = await updateResponse.json();
        if (!updateResponse.ok) {
            throw new Error(data.reason || 'Failed to update document');
        }

        res.json(data);
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error updating document:', error);
        res.status(500).json({ error: error.message });
    }
}

// Delete a document
export async function deleteDocument(req, res) {
    try {
        const docId = req.params.id;
        
        // First, get the current revision
        const getResponse = await dbFetch(req, `${dbUrl}/${dbName}/${docId}`);

        if (!getResponse.ok) {
            if (getResponse.status === 404) {
                return res.status(404).json({ error: 'Document not found' });
            }
            throw new Error('Failed to get document for deletion');
        }

        const currentDoc = await getResponse.json();
        const url = `${dbUrl}/${dbName}/${docId}?rev=${currentDoc._rev}`;

        const deleteResponse = await dbFetch(req, url, {
            method: 'DELETE'
        });

        const data = await deleteResponse.json();
        if (!deleteResponse.ok) {
            throw new Error(data.reason || 'Failed to delete document');
        }

        res.json(data);
    } catch (error) {
        if (error instanceof DatabaseSessionError) {
            console.error('Database session error:', error.message);
            return res.status(503).json({ error: error.message });
        }
        console.error('Error deleting document:', error);
        res.status(500).json({ error: error.message });
    }
} 