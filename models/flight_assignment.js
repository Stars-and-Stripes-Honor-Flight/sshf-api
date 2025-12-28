/**
 * Parses nofly field from CouchDB view.
 * The view returns " " (single space) for false, "nofly" for true.
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
 * The view returns " " (single space) for false, "confirmed" for true.
 * Also handles boolean true for direct data.
 * @param {any} value - The value to parse
 * @returns {boolean}
 */
function parseConfirmed(value) {
    if (value === true) return true;
    if (typeof value === 'string' && value.trim().toLowerCase() === 'confirmed') return true;
    return false;
}

/**
 * Parses mail_sent/email_sent field from CouchDB view.
 * The view returns "Y" for true, "N" or " " for false.
 * Also handles boolean true for direct data.
 * @param {any} value - The value to parse
 * @returns {boolean}
 */
function parseYN(value) {
    if (value === true) return true;
    if (typeof value === 'string' && value.trim().toUpperCase() === 'Y') return true;
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
 * Represents an individual person (veteran or guardian) in a flight assignment
 */
export class AssignmentPerson {
    constructor(data = {}) {
        this.type = data.type || '';
        this.id = data.id || '';
        this.name_first = data.name_first || '';
        this.name_last = data.name_last || '';
        this.city = data.city || '';
        this.appdate = data.appdate || '';
        this.group = data.group || '';
        this.nofly = parseNofly(data.nofly);
        this.fm_number = data.fm_number || '';
        this.assigned_to = data.assigned_to || '';
        this.mail_sent = parseYN(data.mail_sent);
        this.email_sent = parseYN(data.email_sent);
        this.confirmed = parseConfirmed(data.confirmed);
        this.paired_with = data.paired_with || '';
    }

    toJSON() {
        return {
            type: this.type,
            id: this.id,
            name_first: this.name_first,
            name_last: this.name_last,
            city: this.city,
            appdate: this.appdate,
            group: this.group,
            nofly: this.nofly,
            fm_number: this.fm_number,
            assigned_to: this.assigned_to,
            mail_sent: this.mail_sent,
            email_sent: this.email_sent,
            confirmed: this.confirmed,
            paired_with: this.paired_with
        };
    }

    static fromViewRow(row) {
        return new AssignmentPerson({
            type: row.type || '',
            id: row.id || '',
            name_first: row.name_first || '',
            name_last: row.name_last || '',
            city: row.city || '',
            appdate: row.appdate || '',
            group: row.group || '',
            nofly: row.nofly,
            fm_number: row.fm_number || '',
            assigned_to: row.assigned_to || '',
            mail_sent: row.mail_sent,
            email_sent: row.email_sent,
            confirmed: row.confirmed || '',
            paired_with: row.paired_with || ''
        });
    }
}

/**
 * Represents a veteran-guardian pairing in a flight assignment
 */
export class AssignmentPair {
    constructor(data = {}) {
        this.pairId = data.pairId || '';
        this.group = data.group || '';
        this.appDate = data.appDate || '';
        this.missingPerson = parseBoolean(data.missingPerson);
        this.people = data.people || [];
    }

    addPerson(person) {
        this.people.push(person);
    }

    /**
     * Check if the pair is missing a person (veteran has paired_with but only 1 person in pair)
     */
    checkMissingPerson() {
        if (this.people.length < 2) {
            const firstPerson = this.people[0];
            if (firstPerson && firstPerson.paired_with && firstPerson.paired_with.trim().length > 0) {
                this.missingPerson = true;
            }
        }
        return this.missingPerson;
    }

    toJSON() {
        return {
            pairId: this.pairId,
            group: this.group,
            appDate: this.appDate,
            missingPerson: this.missingPerson,
            people: this.people.map(p => p instanceof AssignmentPerson ? p.toJSON() : p)
        };
    }
}

/**
 * Represents the full flight assignment data including flight info, counts, and pairs
 */
export class FlightAssignment {
    constructor(data = {}) {
        this.flight = {
            id: data.flight?.id || data._id || '',
            rev: data.flight?.rev || data._rev || '',
            name: data.flight?.name || data.name || '',
            capacity: data.flight?.capacity || data.capacity || 0,
            flight_date: data.flight?.flight_date || data.flight_date || ''
        };
        this.counts = {
            veterans: data.counts?.veterans || 0,
            guardians: data.counts?.guardians || 0,
            veteransConfirmed: data.counts?.veteransConfirmed || 0,
            guardiansConfirmed: data.counts?.guardiansConfirmed || 0,
            remaining: data.counts?.remaining || 0
        };
        this.pairs = data.pairs || [];
    }

    /**
     * Sort pairs by group (if present) then by application date
     * Groups come before non-grouped, and within groups/non-grouped, sort by appDate descending
     */
    sortPairs() {
        this.pairs.sort((a, b) => {
            const aKey = (a.group || 'aa') + a.appDate;
            const bKey = (b.group || 'aa') + b.appDate;
            if (aKey < bKey) return 1;
            if (aKey > bKey) return -1;
            return 0;
        });
    }

    /**
     * Calculate counts from the pairs data
     * Excludes people marked as nofly from counts
     */
    calculateCounts() {
        const veterans = new Set();
        const guardians = new Set();
        const veteransConfirmed = new Set();
        const guardiansConfirmed = new Set();

        for (const pair of this.pairs) {
            for (const person of pair.people) {
                // Skip nofly people in counts
                if (person.nofly) continue;

                if (person.type === 'Veteran') {
                    veterans.add(person.id);
                    if (person.confirmed) {
                        veteransConfirmed.add(person.id);
                    }
                } else if (person.type === 'Guardian') {
                    guardians.add(person.id);
                    if (person.confirmed) {
                        guardiansConfirmed.add(person.id);
                    }
                }
            }
        }

        this.counts.veterans = veterans.size;
        this.counts.guardians = guardians.size;
        this.counts.veteransConfirmed = veteransConfirmed.size;
        this.counts.guardiansConfirmed = guardiansConfirmed.size;
        this.counts.remaining = this.flight.capacity - veterans.size - guardians.size;
    }

    /**
     * Build pairs from CouchDB flight_assignment view results
     * The view returns rows keyed by [flightName, pairId] with veteran/guardian data
     */
    static buildPairsFromViewResults(rows) {
        const pairs = [];
        let currentPair = null;
        let lastPairId = '';

        for (const row of rows) {
            const value = row.value;
            const pairId = value.pair;

            // Start a new pair when pair ID changes
            if (pairId !== lastPairId) {
                // Finalize previous pair
                if (currentPair) {
                    currentPair.checkMissingPerson();
                    pairs.push(currentPair);
                }

                // Create new pair
                currentPair = new AssignmentPair({
                    pairId: pairId,
                    group: value.group || '',
                    appDate: value.appdate || ''
                });
                lastPairId = pairId;
            }

            // Add person to current pair
            const person = AssignmentPerson.fromViewRow(value);
            currentPair.addPerson(person);
        }

        // Don't forget the last pair
        if (currentPair) {
            currentPair.checkMissingPerson();
            pairs.push(currentPair);
        }

        return pairs;
    }

    toJSON() {
        return {
            flight: this.flight,
            counts: this.counts,
            pairs: this.pairs.map(p => p instanceof AssignmentPair ? p.toJSON() : p)
        };
    }

    static fromFlightDoc(doc) {
        return new FlightAssignment({
            flight: {
                id: doc._id,
                rev: doc._rev,
                name: doc.name,
                capacity: doc.capacity,
                flight_date: doc.flight_date
            }
        });
    }
}

/**
 * Represents the result of adding veterans to a flight
 */
export class AddVeteransResult {
    constructor() {
        this.added = {
            veterans: 0,
            guardians: 0
        };
        this.errors = [];
    }

    incrementVeterans() {
        this.added.veterans++;
    }

    incrementGuardians() {
        this.added.guardians++;
    }

    addError(error) {
        this.errors.push(error);
    }

    toJSON() {
        return {
            added: this.added,
            errors: this.errors
        };
    }
}

