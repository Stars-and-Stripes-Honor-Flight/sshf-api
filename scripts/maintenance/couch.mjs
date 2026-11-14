import { createDbClient, DatabaseSessionError, stableDatabaseError } from '../../utils/db.js';
import { MaintenanceError } from './errors.mjs';

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

export function createCouchMaintenanceDb({
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
        cookieProperty: 'maintDbCookie'
    });
    const req = { maintDbCookie: undefined };
    let sessionEstablished = false;

    async function ensureSession() {
        if (sessionEstablished && req.maintDbCookie) {
            return;
        }
        const res = {
            status() {
                return this;
            },
            json() {}
        };
        await client.session(req, res, () => {});
        if (!req.maintDbCookie) {
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
        async allDocs(query = {}) {
            const params = new URLSearchParams();
            for (const [key, value] of Object.entries(query)) {
                if (value === undefined || value === null) {
                    continue;
                }
                if (key === 'startkey' || key === 'endkey') {
                    params.set(key, JSON.stringify(value));
                } else {
                    params.set(key, String(value));
                }
            }
            const targetUrl = `${databaseBase(url, name)}/_all_docs?${params.toString()}`;
            const response = await performFetch(targetUrl, { method: 'GET' });
            if (!response.ok) {
                const data = await readJson(response);
                throw mapDatabaseError('Database read failed.', response, data);
            }
            return readJson(response);
        },

        async bulkDocs(docs) {
            const targetUrl = `${databaseBase(url, name)}/_bulk_docs`;
            const response = await performFetch(targetUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ docs })
            });
            if (!response.ok) {
                const data = await readJson(response);
                throw mapDatabaseError('Database write failed.', response, data);
            }
            return readJson(response);
        }
    };
}