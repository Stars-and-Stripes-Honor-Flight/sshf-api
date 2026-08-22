import { isProductionDatabase } from './db-guards.mjs';

function basicAuthHeader(user, pass) {
    return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

export function createRawCouchClient({ dbUrl, user, pass, fetchImpl = fetch } = {}) {
    if (!dbUrl) {
        throw new Error('Raw Couch client requires dbUrl');
    }
    if (isProductionDatabase(dbUrl)) {
        throw new Error('Parity harness refuses production database hf');
    }
    const base = String(dbUrl).replace(/\/+$/, '');
    const headers = {
        Accept: 'application/json',
        ...(user && pass ? { Authorization: basicAuthHeader(user, pass) } : {})
    };

    async function request(path, init = {}) {
        const response = await fetchImpl(`${base}${path}`, {
            ...init,
            headers: { ...headers, ...init.headers }
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(payload.reason || payload.error || `GET ${path} failed (${response.status})`);
        }
        return payload;
    }

    return {
        async get(id) {
            return request(`/${encodeURIComponent(id)}`);
        },
        async getMany(ids) {
            const docs = {};
            for (const id of ids) {
                docs[id] = await this.get(id);
            }
            return docs;
        },
        async allDocs() {
            const payload = await request('/_all_docs?include_docs=true');
            const docs = {};
            for (const row of payload.rows || []) {
                if (row.doc && !row.id.startsWith('_design/')) {
                    docs[row.id] = row.doc;
                }
            }
            return docs;
        },
        async waitlist(limit) {
            const payload = await request(
                `/_design/basic/_view/waitlist_veterans_active?limit=${limit}&descending=false&include_docs=true`
            );
            return (payload.rows || []).map((row) => row.doc).filter(Boolean);
        }
    };
}
