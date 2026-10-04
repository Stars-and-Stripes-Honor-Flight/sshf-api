import { Veteran } from './veteran.js';
import { Guardian } from './guardian.js';

const FUTURE_STATUS_ERROR = 'status must begin with "Future-"';

/**
 * JSON body for POST /flights/future-status/activate.
 * Any trimmed status that begins with "Future-" and has text after the hyphen is accepted.
 */
export class FutureStatusRequest {
    constructor(data) {
        const source = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
        const raw = source.status;
        if (typeof raw !== 'string') {
            throw new Error(FUTURE_STATUS_ERROR);
        }
        const status = raw.trim();
        if (!status.startsWith('Future-') || status.length <= 'Future-'.length) {
            throw new Error(FUTURE_STATUS_ERROR);
        }
        this.status = status;
    }
}

/**
 * A person is on a flight when flight.id is present and is not "None".
 *
 * @param {object} doc
 * @returns {boolean}
 */
export function isOnFlight(doc) {
    const id = doc?.flight?.id;
    return typeof id === 'string' && id.length > 0 && id !== 'None';
}

/**
 * Change flight.status the same way PUT /veterans/:id and PUT /guardians/:id do.
 * Copies only flight.status, flight.history, and metadata back onto the stored document.
 * Does not call validate() or save toJSON(), so legacy fields stay on the document.
 *
 * @param {object} doc Stored person document. Mutated in place.
 * @param {string} toStatus
 * @param {{ firstName?: string, lastName?: string }} user
 * @returns {object}
 */
export function applyStatusChange(doc, toStatus, user) {
    const Model = doc.type === 'Veteran' ? Veteran : Guardian;
    const current = Model.fromJSON(structuredClone(doc));
    const updated = Model.fromJSON(structuredClone(doc));
    updated.flight.status = toStatus;
    updated.updateHistory(current, user);
    updated.prepareForSave(user);

    doc.flight.status = updated.flight.status;
    doc.flight.history = updated.flight.history;
    doc.metadata = { ...(doc.metadata || {}), ...updated.metadata };
    return doc;
}

/**
 * Shared JSON result for the flight completion and future-status endpoints.
 * statusCode() is 207 when any attempted save failed, including a flight-only failure.
 * assignedToFlight does not change the status code.
 */
export class FlightStatusBulkResult {
    constructor(options = {}) {
        this.fromStatus = options.fromStatus;
        this.toStatus = options.toStatus;
        this.flight = options.flight || null;
        this.assignedToFlight = options.assignedToFlight === undefined ? null : options.assignedToFlight;
        this.counts = { matched: 0, changed: 0, skipped: 0, failed: 0 };
        this.failures = [];
    }

    setCounts({ matched, changed, skipped, failed }) {
        if (matched !== changed + skipped + failed) {
            throw new Error('matched must equal changed + skipped + failed');
        }
        this.counts = { matched, changed, skipped, failed };
    }

    addFailure(failure) {
        this.failures.push({ ...failure });
    }

    statusCode() {
        return this.failures.length === 0 ? 200 : 207;
    }

    toJSON() {
        const body = {
            fromStatus: this.fromStatus,
            toStatus: this.toStatus,
            counts: { ...this.counts },
            failed: this.failures.map((item) => ({ ...item }))
        };
        if (this.flight) {
            body.flight = { ...this.flight };
        }
        if (this.assignedToFlight) {
            body.assignedToFlight = [...this.assignedToFlight];
        }
        return body;
    }
}
