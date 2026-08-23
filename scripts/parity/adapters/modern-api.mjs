import { assertSafeModernAdapterDb } from '../db-guards.mjs';

function apiHeaders(token) {
    return {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json'
    };
}

async function requestJson(fetchImpl, url, init) {
    const response = await fetchImpl(url, init);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload.error || payload.reason || `${init.method || 'GET'} ${url} failed (${response.status})`);
    }
    return payload;
}

export function createModernAdapter({
    apiBase,
    token,
    dbUrl,
    dbName,
    fetchImpl = fetch
} = {}) {
    assertSafeModernAdapterDb({ dbUrl, dbName });
    if (!apiBase) {
        throw new Error('Modern adapter requires apiBase');
    }
    const base = String(apiBase).replace(/\/+$/, '');
    const headers = apiHeaders(token);

    return {
        async editVetNote(id, note) {
            const veteran = await requestJson(fetchImpl, `${base}/veterans/${id}`, { headers });
            veteran.flight = veteran.flight || {};
            veteran.flight.status_note = String(note).replace(/"/g, "'").replace(/\\/g, '/');
            return requestJson(fetchImpl, `${base}/veterans/${id}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(veteran)
            });
        },

        async pairGuardian(guardianId, veteranId, veteranName) {
            const guardian = await requestJson(fetchImpl, `${base}/guardians/${guardianId}`, { headers });
            guardian.veteran = guardian.veteran || { pairings: [] };
            const pairings = Array.isArray(guardian.veteran.pairings) ? guardian.veteran.pairings : [];
            if (!pairings.some((pairing) => pairing.id === veteranId)) {
                pairings.push({ id: veteranId, name: veteranName });
            }
            guardian.veteran.pairings = pairings;
            return requestJson(fetchImpl, `${base}/guardians/${guardianId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(guardian)
            });
        },

        async unpairGuardian(guardianId) {
            const guardian = await requestJson(fetchImpl, `${base}/guardians/${guardianId}`, { headers });
            guardian.veteran = guardian.veteran || { pairings: [] };
            guardian.veteran.pairings = [];
            return requestJson(fetchImpl, `${base}/guardians/${guardianId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(guardian)
            });
        },

        async changeSeat(id, seat) {
            return requestJson(fetchImpl, `${base}/veterans/${id}/seat`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ value: seat })
            });
        },

        async changeBus(id, bus) {
            return requestJson(fetchImpl, `${base}/veterans/${id}/bus`, {
                method: 'PATCH',
                headers,
                body: JSON.stringify({ value: bus })
            });
        },

        async changeCaller(veteranId, caller, guardianId) {
            const veteran = await requestJson(fetchImpl, `${base}/veterans/${veteranId}`, { headers });
            veteran.call = veteran.call || {};
            veteran.call.assigned_to = caller;
            await requestJson(fetchImpl, `${base}/veterans/${veteranId}`, {
                method: 'PUT',
                headers,
                body: JSON.stringify(veteran)
            });
            if (guardianId) {
                const guardian = await requestJson(fetchImpl, `${base}/guardians/${guardianId}`, { headers });
                guardian.call = guardian.call || {};
                guardian.call.assigned_to = caller;
                await requestJson(fetchImpl, `${base}/guardians/${guardianId}`, {
                    method: 'PUT',
                    headers,
                    body: JSON.stringify(guardian)
                });
            }
        },

        async createFlight(flight) {
            return requestJson(fetchImpl, `${base}/flights`, {
                method: 'POST',
                headers,
                body: JSON.stringify(flight)
            });
        },

        async addToFlight(flightId, veteranCount) {
            return requestJson(fetchImpl, `${base}/flights/${flightId}/assignments`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ veteranCount })
            });
        }
    };
}
