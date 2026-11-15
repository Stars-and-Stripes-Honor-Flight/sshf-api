import { createDbClient, DatabaseSessionError, stableDatabaseError } from '../../utils/db.js';
import { MaintenanceError } from '../maintenance/errors.mjs';

function normalizeBaseUrl(url) {
    return String(url || '').replace(/\/+$/, '');
}

function databaseBase(url, name) {
    return `${normalizeBaseUrl(url)}/${encodeURIComponent(name)}`;
}

function mapDatabaseError(message, response, data = {}) {
    const status = Number.isInteger(response?.status) ? response.status : 500;
    stableDatabaseError(message, data, status);
    return new MaintenanceError(message, { code: 'DB' });
}

async function readJson(response) {
    try {
        return await response.json();
    } catch {
        return {};
    }
}

export function createDesignDeployDb({
    url,
    name,
    user,
    pass,
    fetchImpl
} = {}) {
    if (!url || !name || !user || !pass) {
        throw new MaintenanceError('Database credentials are incomplete.', { code: 'CONFIG' });
    }

    if (typeof fetchImpl === 'function') {
        globalThis.fetch = fetchImpl;
    }

    const client = createDbClient({
        url: normalizeBaseUrl(url),
        user,
        pass,
        cookieProperty: 'designDeployDbCookie'
    });
    const req = { designDeployDbCookie: undefined };
    let sessionEstablished = false;

    async function ensureSession() {
        if (sessionEstablished && req.designDeployDbCookie) {
            return;
        }
        const res = {
            status() {
                return this;
            },
            json() {}
        };
        await client.session(req, res, () => {});
        if (!req.designDeployDbCookie) {
            throw new MaintenanceError('Database session error', { code: 'DB' });
        }
        sessionEstablished = true;
    }

    async function performFetch(targetUrl, options = {}) {
        await ensureSession();
        try {
            return await client.fetch(req, targetUrl, options);
        } catch (error) {
            if (error instanceof DatabaseSessionError) {
                throw new MaintenanceError('Database session error', { code: 'DB' });
            }
            throw error;
        }
    }

    return {
        async getDesignDoc(id) {
            const targetUrl = `${databaseBase(url, name)}/${id}?attachments=true`;
            const response = await performFetch(targetUrl, { method: 'GET' });
            if (response.status === 404) {
                return null;
            }
            if (!response.ok) {
                const data = await readJson(response);
                throw mapDatabaseError('Database read failed.', response, data);
            }
            return readJson(response);
        },

        async putDesignDoc(doc) {
            const docId = doc._id;
            const targetUrl = `${databaseBase(url, name)}/${docId}`;
            const response = await performFetch(targetUrl, {
                method: 'PUT',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(doc)
            });
            const data = await readJson(response);
            if (response.status === 409) {
                return {
                    ok: false,
                    id: docId,
                    error: 'conflict',
                    status: 409
                };
            }
            if (!response.ok) {
                throw mapDatabaseError('Database write failed.', response, data);
            }
            return {
                ok: true,
                id: data.id || docId,
                rev: data.rev
            };
        }
    };
}