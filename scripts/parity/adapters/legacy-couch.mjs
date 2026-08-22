import { isProductionDatabase } from '../db-guards.mjs';
import {
    assignToFlight,
    changeBus,
    changeCaller,
    changeSeat,
    editVetNote,
    newFlightDoc,
    pairGuardian,
    unpairGuardian
} from '../legacy-ops.mjs';

function basicAuthHeader(user, pass) {
    return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
}

async function requestJson(fetchImpl, url, init) {
    const response = await fetchImpl(url, init);
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(payload.reason || payload.error || `${init.method || 'GET'} ${url} failed (${response.status})`);
    }
    return payload;
}

export function createLegacyCouchAdapter({
    dbUrl,
    user,
    pass,
    fetchImpl = fetch
} = {}) {
    if (!dbUrl) {
        throw new Error('Legacy adapter requires dbUrl');
    }
    if (isProductionDatabase(dbUrl)) {
        throw new Error('Parity legacy adapter refuses production database hf');
    }
    const base = String(dbUrl).replace(/\/+$/, '');
    const headers = {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(user && pass ? { Authorization: basicAuthHeader(user, pass) } : {})
    };

    async function get(id) {
        return requestJson(fetchImpl, `${base}/${encodeURIComponent(id)}`, { headers });
    }

    async function put(doc) {
        return requestJson(fetchImpl, `${base}/${encodeURIComponent(doc._id)}`, {
            method: 'PUT',
            headers,
            body: JSON.stringify(doc)
        });
    }

    return {
        async get(id) {
            return get(id);
        },

        async waitlist(limit) {
            const payload = await requestJson(
                fetchImpl,
                `${base}/_design/basic/_view/waitlist_veterans_active?limit=${limit}&descending=false&include_docs=true`,
                { headers }
            );
            return (payload.rows || []).map((row) => row.doc).filter(Boolean);
        },

        async editVetNote(id, note, ctx) {
            const next = editVetNote(await get(id), note, ctx);
            await put(next);
            return next;
        },

        async pairGuardian(veteranId, guardianId, ctx) {
            const veteran = await get(veteranId);
            const guardian = await get(guardianId);
            const paired = pairGuardian({ veteran, guardian }, ctx);
            await put(paired.veteran);
            await put(paired.guardian);
            return paired;
        },

        async unpairGuardian(veteranId, guardianId, ctx) {
            const veteran = await get(veteranId);
            const guardian = await get(guardianId);
            const unpaired = unpairGuardian({ veteran, guardian }, ctx);
            await put(unpaired.veteran);
            await put(unpaired.guardian);
            return unpaired;
        },

        async changeSeat(id, seat, ctx) {
            const next = changeSeat(await get(id), seat, ctx);
            await put(next);
            return next;
        },

        async changeBus(id, bus, ctx) {
            const next = changeBus(await get(id), bus, ctx);
            await put(next);
            return next;
        },

        async changeCaller(id, caller, ctx, guardianId) {
            const next = changeCaller(await get(id), caller, ctx);
            await put(next);
            if (guardianId) {
                const guardian = changeCaller(await get(guardianId), caller, ctx);
                await put(guardian);
            }
            return next;
        },

        async createFlight(fields, ctx) {
            const flight = newFlightDoc({ ...fields, ...ctx });
            await put(flight);
            return flight;
        },

        async addToFlight(flightDoc, veteranDocs, ctx) {
            const flightName = flightDoc.name;
            const updated = [];
            for (const doc of veteranDocs) {
                const next = assignToFlight(doc, flightName, ctx);
                await put(next);
                updated.push(next);
                const guardianId = next.guardian?.id;
                if (guardianId && guardianId.length === 32) {
                    const guardian = await get(guardianId);
                    if ((guardian.flight?.id || 'None') !== flightName) {
                        const assignedGuardian = assignToFlight(guardian, flightName, ctx);
                        await put(assignedGuardian);
                        updated.push(assignedGuardian);
                    }
                }
            }
            return updated;
        }
    };
}
