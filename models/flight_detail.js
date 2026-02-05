/**
 * Valid bus assignments
 */
const VALID_BUSES = ['None', 'Alpha1', 'Alpha2', 'Alpha3', 'Alpha4', 'Alpha5', 'Bravo1', 'Bravo2', 'Bravo3', 'Bravo4', 'Bravo5'];

/**
 * Parses nofly field from CouchDB view.
 * The view returns "" (empty string) for false, "nofly" for true.
 * Also handles boolean true for direct data.
 * @param {any} value - The value to parse
 * @returns {boolean}
 */
function parseNofly(value) {
    if (value === true) return true;
    if (typeof value === 'string' && value.trim().toLowerCase() === 'nofly') return true;
    return false;
}

/**
 * Parses confirmed field from CouchDB view.
 * The view returns "unconfirmed" for false, "" (empty) for confirmed.
 * Also handles boolean true for direct data.
 * @param {any} value - The value to parse
 * @returns {boolean}
 */
function parseConfirmed(value) {
    if (value === true) return true;
    if (typeof value === 'string') {
        const trimmed = value.trim().toLowerCase();
        // Empty string means confirmed (has confirmed_date)
        if (trimmed === '') return true;
        if (trimmed === 'confirmed') return true;
    }
    return false;
}

/**
 * Parses a generic boolean value.
 * Returns true only for boolean true or string "true" (case-insensitive).
 * @param {any} value - The value to parse
 * @returns {boolean}
 */
function parseBoolean(value) {
    if (value === true) return true;
    if (typeof value === 'string' && value.trim().toLowerCase() === 'true') return true;
    return false;
}

/**
 * Normalizes bus value to a valid bus name or 'None'
 * @param {string} value - The bus value from the view
 * @returns {string}
 */
function normalizeBus(value) {
    if (!value || typeof value !== 'string') return 'None';
    const trimmed = value.trim();
    if (VALID_BUSES.includes(trimmed)) return trimmed;
    return 'None';
}

/**
 * Represents an individual person (veteran or guardian) in the flight detail
 */
export class FlightDetailPerson {
    constructor(data = {}) {
        this.type = data.type || '';
        this.id = data.id || '';
        this.name_first = data.name_first || '';
        this.name_last = data.name_last || '';
        this.city = data.city || '';
        this.bus = normalizeBus(data.bus);
        this.seat = data.seat || '';
        this.shirt = data.shirt || '';
        this.nofly = parseNofly(data.nofly);
        this.confirmed = parseConfirmed(data.confirmed);
        
        // Veteran-specific fields
        if (data.type === 'Veteran') {
            this.med_limits = data.med_limits || '';
            this.group = data.group || '';
        }
        
        // Guardian-specific fields
        if (data.type === 'Guardian') {
            this.med_exprnc = data.med_exprnc || '';
            this.training = data.training || '';
            this.training_complete = parseBoolean(data.training_complete);
        }
    }

    toJSON() {
        const result = {
            type: this.type,
            id: this.id,
            name_first: this.name_first,
            name_last: this.name_last,
            city: this.city,
            bus: this.bus,
            seat: this.seat,
            shirt: this.shirt,
            nofly: this.nofly,
            confirmed: this.confirmed
        };
        
        // Include type-specific fields
        if (this.type === 'Veteran') {
            result.med_limits = this.med_limits;
            result.group = this.group;
        }
        
        if (this.type === 'Guardian') {
            result.med_exprnc = this.med_exprnc;
            result.training = this.training;
            result.training_complete = this.training_complete;
        }
        
        return result;
    }

    static fromViewRow(row) {
        return new FlightDetailPerson({
            type: row.type || '',
            id: row.id || '',
            name_first: row.name_first || '',
            name_last: row.name_last || '',
            city: row.city || '',
            bus: row.bus,
            seat: row.seat || '',
            shirt: row.shirt || '',
            nofly: row.nofly,
            confirmed: row.confirmed,
            // Veteran fields
            med_limits: row.med_limits || '',
            group: row.group || '',
            // Guardian fields
            med_exprnc: row.med_exprnc || '',
            training: row.training || '',
            training_complete: row.training_complete
        });
    }
}

/**
 * Represents a veteran-guardian pairing in the flight detail
 */
export class FlightDetailPair {
    constructor(data = {}) {
        this.pairId = data.pairId || '';
        this.busMismatch = parseBoolean(data.busMismatch);
        this.missingPairedPerson = parseBoolean(data.missingPairedPerson);
        this.people = data.people || [];
    }

    addPerson(person) {
        this.people.push(person);
    }

    /**
     * Check if people in the pair have different bus assignments
     * @returns {boolean}
     */
    checkBusMismatch() {
        if (this.people.length < 2) {
            this.busMismatch = false;
            return false;
        }
        const buses = this.people.map(p => p.bus);
        this.busMismatch = !buses.every(b => b === buses[0]);
        return this.busMismatch;
    }

    toJSON() {
        return {
            pairId: this.pairId,
            busMismatch: this.busMismatch,
            missingPairedPerson: this.missingPairedPerson,
            people: this.people.map(p => p instanceof FlightDetailPerson ? p.toJSON() : p)
        };
    }
}

/**
 * Statistics for the flight detail
 */
export class FlightDetailStats {
    constructor() {
        this.buses = {
            None: 0,
            Alpha1: 0,
            Alpha2: 0,
            Alpha3: 0,
            Alpha4: 0,
            Alpha5: 0,
            Bravo1: 0,
            Bravo2: 0,
            Bravo3: 0,
            Bravo4: 0,
            Bravo5: 0
        };
        this.tours = {
            Alpha: 0,
            Bravo: 0,
            None: 0
        };
        this.flight = {
            Alpha: 0,
            Bravo: 0,
            None: 0
        };
    }

    toJSON() {
        return {
            buses: { ...this.buses },
            tours: { ...this.tours },
            flight: { ...this.flight }
        };
    }
}

/**
 * Represents the full flight detail data including flight info, stats, and pairs
 */
export class FlightDetailResult {
    constructor(data = {}) {
        this.flight = {
            id: data.flight?.id || data._id || '',
            name: data.flight?.name || data.name || '',
            capacity: data.flight?.capacity || data.capacity || 0,
            flight_date: data.flight?.flight_date || data.flight_date || ''
        };
        this.stats = data.stats instanceof FlightDetailStats ? data.stats : new FlightDetailStats();
        this.pairs = data.pairs || [];
    }

    /**
     * Calculate statistics from the pairs data
     * Bus counts are per unique person ID
     * Tour counts sum Alpha1-5 to Alpha, Bravo1-5 to Bravo
     * Flight counts exclude nofly entries
     */
    calculateStats() {
        // Track unique person IDs per bus (to handle deduplication)
        const busPeople = {
            None: new Set(),
            Alpha1: new Set(),
            Alpha2: new Set(),
            Alpha3: new Set(),
            Alpha4: new Set(),
            Alpha5: new Set(),
            Bravo1: new Set(),
            Bravo2: new Set(),
            Bravo3: new Set(),
            Bravo4: new Set(),
            Bravo5: new Set()
        };

        // Track unique person IDs per bus for flight counts (excluding nofly)
        const busFlightPeople = {
            None: new Set(),
            Alpha1: new Set(),
            Alpha2: new Set(),
            Alpha3: new Set(),
            Alpha4: new Set(),
            Alpha5: new Set(),
            Bravo1: new Set(),
            Bravo2: new Set(),
            Bravo3: new Set(),
            Bravo4: new Set(),
            Bravo5: new Set()
        };

        for (const pair of this.pairs) {
            for (const person of pair.people) {
                const bus = person.bus || 'None';
                if (busPeople[bus]) {
                    busPeople[bus].add(person.id);
                    
                    // Add to flight counts only if not nofly
                    if (!person.nofly) {
                        busFlightPeople[bus].add(person.id);
                    }
                }
            }
        }

        // Set bus counts
        for (const bus of VALID_BUSES) {
            this.stats.buses[bus] = busPeople[bus].size;
        }

        // Calculate tour counts (Alpha1-5 = Alpha, Bravo1-5 = Bravo)
        this.stats.tours.Alpha = busPeople.Alpha1.size + busPeople.Alpha2.size + 
                                  busPeople.Alpha3.size + busPeople.Alpha4.size + busPeople.Alpha5.size;
        this.stats.tours.Bravo = busPeople.Bravo1.size + busPeople.Bravo2.size + 
                                  busPeople.Bravo3.size + busPeople.Bravo4.size + busPeople.Bravo5.size;
        this.stats.tours.None = busPeople.None.size;

        // Calculate flight counts (excluding nofly)
        this.stats.flight.Alpha = busFlightPeople.Alpha1.size + busFlightPeople.Alpha2.size + 
                                   busFlightPeople.Alpha3.size + busFlightPeople.Alpha4.size + busFlightPeople.Alpha5.size;
        this.stats.flight.Bravo = busFlightPeople.Bravo1.size + busFlightPeople.Bravo2.size + 
                                   busFlightPeople.Bravo3.size + busFlightPeople.Bravo4.size + busFlightPeople.Bravo5.size;
        this.stats.flight.None = busFlightPeople.None.size;
    }

    /**
     * Build pairs from CouchDB flight_pairings view results
     * The view returns rows keyed by [flightName, pairId, typeOrder] with veteran/guardian data
     * 
     * This method groups by guardian ID:
     * - pairId = guardian ID (or veteran ID if unpaired)
     * - All veterans paired with the same guardian are in one group
     * - busMismatch: true if ANY people in the group have different buses
     * - missingPairedPerson: true if ANY person's pairing is not on the flight
     * 
     * @param {Array} rows - View result rows
     * @returns {Array<FlightDetailPair>}
     */
    static buildPairsFromViewResults(rows) {
        // First pass: collect all people and their pairing info
        const personIdsOnFlight = new Set();
        const veterans = [];  // { person, pairing }
        const guardians = new Map();  // guardianId -> person object
        
        for (const row of rows) {
            const value = row.value;
            personIdsOnFlight.add(value.id);
            
            const person = FlightDetailPerson.fromViewRow(value);
            const pairing = value.pairing && value.pairing.length > 0 ? value.pairing : null;
            
            if (value.type === 'Guardian') {
                // Deduplicate guardians by ID
                if (!guardians.has(value.id)) {
                    guardians.set(value.id, { person, pairing });
                }
            } else {
                // Veterans - store with their pairing info
                veterans.push({ person, pairing });
            }
        }

        // Second pass: group by guardian ID
        // Map: guardianId -> { guardian, veterans: [], pairings: [] }
        const groupsByGuardian = new Map();
        const unpairedVeterans = [];
        
        for (const { person, pairing } of veterans) {
            if (pairing && guardians.has(pairing)) {
                // Veteran is paired with a guardian on this flight
                if (!groupsByGuardian.has(pairing)) {
                    groupsByGuardian.set(pairing, {
                        guardian: guardians.get(pairing),
                        veterans: [],
                        pairings: [pairing]  // Track all pairings for mismatch detection
                    });
                }
                const group = groupsByGuardian.get(pairing);
                group.veterans.push(person);
                group.pairings.push(pairing);
            } else {
                // Veteran is unpaired or guardian is not on flight
                unpairedVeterans.push({ person, pairing });
            }
        }

        // Handle guardians who are on the flight but none of their veterans are
        for (const [guardianId, { person: guardian, pairing }] of guardians) {
            if (!groupsByGuardian.has(guardianId)) {
                // Guardian with no veterans in the group yet
                groupsByGuardian.set(guardianId, {
                    guardian: { person: guardian, pairing },
                    veterans: [],
                    pairings: pairing ? [pairing] : []
                });
            }
        }

        // Build pairs array
        const pairs = [];

        // Add guardian-based groups
        for (const [guardianId, group] of groupsByGuardian) {
            const pair = new FlightDetailPair({ pairId: guardianId });
            
            // Add all veterans first, then the guardian
            for (const veteran of group.veterans) {
                pair.addPerson(veteran);
            }
            pair.addPerson(group.guardian.person);
            
            // Check bus mismatch across the whole group
            pair.checkBusMismatch();
            
            // Check for missing paired person
            // For veterans: check if their pairing (guardian) is on the flight
            for (const veteran of group.veterans) {
                // Veterans in this group are already matched to a guardian on flight
            }
            
            // For guardian: check if any of their pairings (veterans) are missing
            if (group.guardian.pairing && !personIdsOnFlight.has(group.guardian.pairing)) {
                pair.missingPairedPerson = true;
            }
            
            pairs.push(pair);
        }

        // Add unpaired veterans as individual pairs
        for (const { person, pairing } of unpairedVeterans) {
            const pair = new FlightDetailPair({ pairId: person.id });
            pair.addPerson(person);
            
            // Check if veteran's pairing (guardian) is missing from flight
            if (pairing && !personIdsOnFlight.has(pairing)) {
                pair.missingPairedPerson = true;
            }
            
            pairs.push(pair);
        }

        return pairs;
    }

    toJSON() {
        return {
            flight: this.flight,
            stats: this.stats instanceof FlightDetailStats ? this.stats.toJSON() : this.stats,
            pairs: this.pairs.map(p => p instanceof FlightDetailPair ? p.toJSON() : p)
        };
    }

    static fromFlightDoc(doc) {
        return new FlightDetailResult({
            flight: {
                id: doc._id,
                name: doc.name,
                capacity: doc.capacity,
                flight_date: doc.flight_date
            }
        });
    }
}

// Export valid buses for use in validation
export { VALID_BUSES };
