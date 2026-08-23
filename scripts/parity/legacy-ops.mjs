function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
}

function personName(doc) {
    const first = doc?.name?.first || '';
    const last = doc?.name?.last || '';
    return `${first} ${last}`.trim();
}

function stampMetadata(doc, userName, timestamp) {
    doc.metadata = doc.metadata || {};
    if (!doc.metadata.created_at) {
        doc.metadata.created_at = timestamp;
    }
    if (!doc.metadata.created_by) {
        doc.metadata.created_by = userName;
    }
    doc.metadata.updated_at = timestamp;
    doc.metadata.updated_by = userName;
}

function pushHistory(list, timestamp, change) {
    list.push({ id: timestamp, change });
}

function ensureFlight(doc) {
    doc.flight = doc.flight || {};
    doc.flight.history = Array.isArray(doc.flight.history) ? doc.flight.history : [];
}

function ensureCall(doc) {
    doc.call = doc.call || {};
    doc.call.history = Array.isArray(doc.call.history) ? doc.call.history : [];
}

export function editVetNote(doc, note, { userName, timestamp }) {
    const next = cloneJson(doc);
    ensureFlight(next);
    const cleaned = String(note).replace(/"/g, "'").replace(/\\/g, '/');
    next.flight.status_note = cleaned;
    stampMetadata(next, userName, timestamp);
    return next;
}

export function changeSeat(doc, seat, { userName, timestamp }) {
    const next = cloneJson(doc);
    ensureFlight(next);
    const oldSeat = next.flight.seat || '';
    next.flight.seat = seat;
    pushHistory(
        next.flight.history,
        timestamp,
        `changed seat from: ${oldSeat} to: ${seat} by: ${userName}`
    );
    stampMetadata(next, userName, timestamp);
    return next;
}

export function changeBus(doc, bus, { userName, timestamp }) {
    const next = cloneJson(doc);
    ensureFlight(next);
    const oldBus = next.flight.bus || 'None';
    next.flight.bus = bus;
    pushHistory(
        next.flight.history,
        timestamp,
        `changed bus from: ${oldBus} to: ${bus} by: ${userName}`
    );
    stampMetadata(next, userName, timestamp);
    return next;
}

export function changeCaller(doc, caller, { userName, timestamp }) {
    const next = cloneJson(doc);
    ensureCall(next);
    const oldCaller = next.call.assigned_to || '';
    next.call.assigned_to = caller;
    pushHistory(
        next.call.history,
        timestamp,
        `changed assigned caller from: ${oldCaller} to: ${caller} by: ${userName}`
    );
    stampMetadata(next, userName, timestamp);
    return next;
}

export function pairGuardian({ veteran, guardian }, { userName, timestamp }) {
    const nextVeteran = cloneJson(veteran);
    const nextGuardian = cloneJson(guardian);
    nextVeteran.guardian = nextVeteran.guardian || { id: '', name: '', history: [] };
    nextVeteran.guardian.history = Array.isArray(nextVeteran.guardian.history)
        ? nextVeteran.guardian.history
        : [];
    nextGuardian.veteran = nextGuardian.veteran || { pairings: [], history: [] };
    nextGuardian.veteran.pairings = Array.isArray(nextGuardian.veteran.pairings)
        ? nextGuardian.veteran.pairings
        : [];
    nextGuardian.veteran.history = Array.isArray(nextGuardian.veteran.history)
        ? nextGuardian.veteran.history
        : [];

    const guardianName = personName(nextGuardian);
    const veteranName = personName(nextVeteran);

    nextVeteran.guardian.id = nextGuardian._id;
    nextVeteran.guardian.name = guardianName;
    pushHistory(
        nextVeteran.guardian.history,
        timestamp,
        `paired to: ${guardianName} by: ${userName}`
    );

    nextGuardian.veteran.pairings.push({
        id: nextVeteran._id,
        name: veteranName
    });
    pushHistory(
        nextGuardian.veteran.history,
        timestamp,
        `paired to: ${veteranName} by: ${userName}`
    );

    stampMetadata(nextVeteran, userName, timestamp);
    stampMetadata(nextGuardian, userName, timestamp);
    return { veteran: nextVeteran, guardian: nextGuardian };
}

export function unpairGuardian({ veteran, guardian }, { userName, timestamp }) {
    const nextVeteran = cloneJson(veteran);
    const nextGuardian = cloneJson(guardian);
    nextVeteran.guardian = nextVeteran.guardian || { id: '', name: '', history: [] };
    nextVeteran.guardian.history = Array.isArray(nextVeteran.guardian.history)
        ? nextVeteran.guardian.history
        : [];
    nextGuardian.veteran = nextGuardian.veteran || { pairings: [], history: [] };
    nextGuardian.veteran.pairings = Array.isArray(nextGuardian.veteran.pairings)
        ? nextGuardian.veteran.pairings
        : [];
    nextGuardian.veteran.history = Array.isArray(nextGuardian.veteran.history)
        ? nextGuardian.veteran.history
        : [];

    const guardianName = nextVeteran.guardian.name || personName(nextGuardian);
    const veteranName = personName(nextVeteran);

    nextVeteran.guardian.id = '';
    nextVeteran.guardian.name = '';
    pushHistory(
        nextVeteran.guardian.history,
        timestamp,
        `unpaired from: ${guardianName} by: ${userName}`
    );

    nextGuardian.veteran.pairings = nextGuardian.veteran.pairings.filter(
        (pairing) => pairing.id !== nextVeteran._id
    );
    pushHistory(
        nextGuardian.veteran.history,
        timestamp,
        `unpaired from: ${veteranName} by: ${userName}`
    );

    stampMetadata(nextVeteran, userName, timestamp);
    stampMetadata(nextGuardian, userName, timestamp);
    return { veteran: nextVeteran, guardian: nextGuardian };
}

export function assignToFlight(doc, flightName, { userName, timestamp }) {
    const next = cloneJson(doc);
    ensureFlight(next);
    const oldFlight = next.flight.id || 'None';
    next.flight.id = flightName;
    pushHistory(
        next.flight.history,
        timestamp,
        `changed flight from: ${oldFlight} to: ${flightName} by: ${userName}`
    );
    stampMetadata(next, userName, timestamp);
    return next;
}

export function newFlightDoc({
    _id,
    name,
    flight_date,
    capacity,
    userName,
    timestamp
}) {
    return {
        _id,
        type: 'Flight',
        name,
        flight_date,
        capacity,
        completed: false,
        metadata: {
            created_at: timestamp,
            created_by: userName,
            updated_at: timestamp,
            updated_by: userName
        }
    };
}
