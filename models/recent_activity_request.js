// Valid activity types
const VALID_TYPES = ['modified', 'added', 'call', 'flight', 'pairing'];

// Map of activity types to CouchDB view names
const VIEW_MAP = {
    modified: 'admin_recent_changes',
    added: 'admin_recent_additions',
    call: 'admin_recent_call_changes',
    flight: 'admin_recent_flight_changes',
    pairing: 'admin_recent_pairing_changes'
};

export class RecentActivityRequest {
    constructor(data = {}) {
        // Type is required - one of: modified, added, call, flight, pairing
        this.type = data.type || '';
        
        // Pagination parameters with defaults
        this.offset = data.offset !== undefined && data.offset !== null 
            ? parseInt(data.offset, 10) 
            : 0;
        this.limit = data.limit !== undefined && data.limit !== null 
            ? parseInt(data.limit, 10) 
            : 20;
        
        // Ensure non-negative values
        if (this.offset < 0) this.offset = 0;
        if (this.limit < 1) this.limit = 20;
    }

    /**
     * Validates the request parameters
     * @returns {{valid: boolean, error?: string}}
     */
    validate() {
        if (!this.type) {
            return { valid: false, error: 'type parameter is required' };
        }
        if (!VALID_TYPES.includes(this.type)) {
            return { valid: false, error: `type must be one of: ${VALID_TYPES.join(', ')}` };
        }
        return { valid: true };
    }

    /**
     * Returns the CouchDB view name based on type
     * @returns {string|null}
     */
    getViewName() {
        return VIEW_MAP[this.type] || null;
    }

    /**
     * Convert to query parameters for CouchDB
     * @returns {string}
     */
    toQueryParams() {
        const params = new URLSearchParams();
        
        // Use skip for offset-based pagination
        if (this.offset > 0) {
            params.append('skip', this.offset);
        }
        
        params.append('limit', this.limit);
        params.append('descending', 'true');
        
        return params.toString();
    }

    /**
     * Convert to JSON object
     * @returns {Object}
     */
    toJSON() {
        return {
            type: this.type,
            offset: this.offset,
            limit: this.limit,
            viewName: this.getViewName()
        };
    }
}

